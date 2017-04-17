const net = require('net');
const path = require('path');
const log4js = require('log4js');
const WebSocket = require('ws');
const Encryptor = require('shadowsocks/lib/shadowsocks/encrypt').Encryptor;
const WSErrorCode = require('ws/lib/ErrorCodes');

const MAX_CONNECTIONS = 50000;

const TCP_RELAY_TYPE_LOCAL = 1;
const TCP_RELAY_TYPE_SERVER = 2;

const ADDRESS_TYPE_IPV4 = 0x01;
const ADDRESS_TYPE_DOMAIN_NAME = 0x03;
const ADDRESS_TYPE_IPV6 = 0x04;
const ADDRESS_TYPE = {
	1: 'IPV4',
	3: 'DOMAIN_NAME',
	4: 'IPV6'
};

const VERSION = 0x05;

const METHOD_NO_AUTHENTICATION_REQUIRED = 0x00;
const METHOD_GSSAPI = 0x01;
const METHOD_USERNAME_PASSWORD = 0x02;
const METHOD_NO_ACCEPTABLE_METHODS = 0xff;

const CMD_CONNECT = 0x01;
const CMD_BIND = 0x02;
const CMD_UDP_ASSOCIATE = 0x03;
const CMD = {
	1: 'CONNECT',
	2: 'BIND',
	3: 'UDP_ASSOCIATE'
};

const REPLIE_SUCCEEDED = 0x00;
const REPLIE_GENERAL_SOCKS_SERVER_FAILURE = 0x01;
const REPLIE_CONNECTION_NOT_ALLOWED_BY_RULESET = 0x02;
const REPLIE_NETWORK_UNREACHABLE = 0x03;
const REPLIE_HOST_UNREACHABLE = 0x04;
const REPLIE_CONNECTION_REFUSED = 0x05;
const REPLIE_TTL_EXPIRED = 0x06;
const REPLIE_COMMAND_NOT_SUPPORTED = 0x07;
const REPLIE_ADDRESS_TYPE_NOT_SUPPORTED = 0x08;

const STAGE_INIT = 0;
const STAGE_ADDR = 1;
const STAGE_UDP_ASSOC = 2;
const STAGE_DNS = 3;
const STAGE_CONNECTING = 4;
const STAGE_STREAM = 5;
const STAGE_DESTROYED = -1;

const STAGE = {
	[-1]: 'STAGE_DESTROYED',
	0: 'STAGE_INIT',
	1: 'STAGE_ADDR',
	2: 'STAGE_UDP_ASSOC',
	3: 'STAGE_DNS',
	4: 'STAGE_CONNECTING',
	5: 'STAGE_STREAM'
};

const SERVER_STATUS_INIT = 0;
const SERVER_STATUS_RUNNING = 1;
const SERVER_STATUS_STOPPED = 2;

var globalConnectionId = 1;
var connections = {};

function parseAddressHeader(data, offset) {
	var addressType = data.readUInt8(offset);
	var headerLen, dstAddr, dstPort, dstAddrLen;
	//domain name
	if (addressType == ADDRESS_TYPE_DOMAIN_NAME) {
		dstAddrLen = data.readUInt8(offset + 1);
		dstAddr = data.slice(offset + 2, offset + 2 + dstAddrLen).toString();
		dstPort = data.readUInt16BE(offset + 2 + dstAddrLen);
		headerLen = 4 + dstAddrLen;
	}
	//ipv4
	else if (addressType == ADDRESS_TYPE_IPV4) {
		dstAddr = data.slice(offset + 1, offset + 5).join('.').toString();
		dstPort = data.readUInt16BE(offset + 5);
		headerLen = 7;
	} else {
		return false;
	}
	return {
		addressType: addressType,
		headerLen: headerLen,
		dstAddr: dstAddr,
		dstPort: dstPort
	};
}

function TCPRelay(config, isLocal) {
	this.isLocal = isLocal;
	this.server = null;
	this.status = SERVER_STATUS_INIT;
	this.config = require('./config.json');
	if (config) {
		this.config = Object.assign(this.config, config);
	}
	this.logger = null;
	this.logLevel = 'error';
	this.logFile = null;
	this.serverName = null;
}

TCPRelay.prototype.getStatus = function() {
	return this.status;
};

TCPRelay.prototype.setServerName = function(serverName) {
	this.serverName = serverName;
	return this;
};

TCPRelay.prototype.getServerName = function() {
	if (!this.serverName) {
		this.serverName = this.isLocal ? 'local' : 'server';
	}
	return this.serverName;
};

TCPRelay.prototype.setLogLevel = function(logLevel) {
	this.logLevel = logLevel;
	return this;
};

TCPRelay.prototype.getLogLevel = function() {
	return this.logLevel;
};

TCPRelay.prototype.setLogFile = function(logFile) {
	if (logFile && !path.isAbsolute(logFile)) {
		logFile = process.cwd() + '/' + logFile;
	}
	this.logFile = logFile;
	return this;
};

TCPRelay.prototype.getLogFile = function() {
	return this.logFile;
};

TCPRelay.prototype.initLogger = function() {
	if (this.logFile) {
		log4js.loadAppender('file');
		log4js.addAppender(log4js.appenders.file(this.logFile), this.getServerName());
	}
	this.logger = log4js.getLogger(this.getServerName());
	this.logger.setLevel(this.logLevel);
};

TCPRelay.prototype.initServer = function() {
	var self = this;
	return new Promise(function(resolve, reject) {
		var config = self.config;
		var port = self.isLocal ? config.localPort : config.serverPort;
		var address = self.isLocal ? config.localAddress : config.serverAddress;
		var server;

		if (self.isLocal) {
			server = self.server = net.createServer({
				allowHalfOpen: true,
			});
			server.maxConnections = MAX_CONNECTIONS;
			server.on('connection', function(connection) {
				return self.handleConnectionByLocal(connection);
			});
			server.on('close', function() {
				self.logger.info('server is closed');
				self.status = SERVER_STATUS_STOPPED;
			});
			server.listen(port, address);
		} else {
			server = self.server = new WebSocket.Server({
				host: address,
				port: port,
				perMessageDeflate: false,
				backlog: MAX_CONNECTIONS
			});
			server.on('connection', function(connection) {
				return self.handleConnectionByServer(connection);
			});
		}
		server.on('error', function(error) {
			self.logger.fatal('an error of', self.getServerName(), 'occured', error);
			self.status = SERVER_STATUS_STOPPED;
			reject(error);
		});
		server.on('listening', function() {
			self.logger.info(self.getServerName(), 'is listening on', address + ':' + port);
			self.status = SERVER_STATUS_RUNNING;
			resolve();
		});
	});
};

//server
TCPRelay.prototype.handleConnectionByServer = function(connection) {
	var self = this;
	var config = self.config;
	var method = config.method;
	var password = config.password;
	var serverAddress = config.serverAddress;
	var serverPort = config.serverPort;

	var logger = self.logger;
	var encryptor = new Encryptor(password, method);

	var stage = STAGE_INIT;
	var connectionId = (globalConnectionId++) % MAX_CONNECTIONS;
	var targetConnection, addressHeader;

	var dataCache = [];

	logger.info(`[${connectionId}]: accept connection from local`);
	connections[connectionId] = connection;
	connection.on('message', function(data) {
		data = encryptor.decrypt(data);
		logger.debug(`[${connectionId}]: read data[length = ${data.length}] from local connection at stage[${STAGE[stage]}]`);

		switch (stage) {

			case STAGE_INIT:
				if (data.length < 7) {
					stage = STAGE_DESTROYED;
					return connection.close();
				}
				addressHeader = parseAddressHeader(data, 0);
				if (!addressHeader) {
					stage = STAGE_DESTROYED;
					return connection.close();
				}

				logger.info(`[${connectionId}]: connecting to ${addressHeader.dstAddr}:${addressHeader.dstPort}`);
				stage = STAGE_CONNECTING;

				targetConnection = net.createConnection({
					port: addressHeader.dstPort,
					host: addressHeader.dstAddr,
					allowHalfOpen: true
				}, function() {
					logger.info(`[${connectionId}]: connecting to target`);

					dataCache = Buffer.concat(dataCache);
					targetConnection.write(dataCache, function() {
						logger.debug(`[${connectionId}]: write data[length = ${dataCache.length}] to target connection`);
						dataCache = null;
					});
					stage = STAGE_STREAM;
				});

				targetConnection.on('data', function(data) {
					logger.debug(`[${connectionId}]: read data[length = ${data.length}] from target connection`);
					if (connection.readyState == WebSocket.OPEN) {
						connection.send(encryptor.encrypt(data), {
							binary: true
						}, function() {
							logger.debug(`[${connectionId}]: write data[length = ${data.length}] to local connection`);
						});
					}
				});
				targetConnection.on('end', function() {
					logger.info(`[${connectionId}]: end event of target connection has been triggered`);
					stage = STAGE_DESTROYED;
					connection.close();
				});
				targetConnection.on('close', function(hadError) {
					logger.info(`[${connectionId}]: close event[had error = ${hadError}] of target connection has been triggered`);
					stage = STAGE_DESTROYED;
					connection.close();
				});
				targetConnection.on('error', function(error) {
					logger.error(`[${connectionId}]: an error of target connection occured`, error);
					stage = STAGE_DESTROYED;
					targetConnection.destroy();
					connection.close();
				});

				if (data.length > addressHeader.headerLen) {
					dataCache.push(data.slice(addressHeader.headerLen));
				}
				break;

			case STAGE_CONNECTING:
				dataCache.push(data);
				break;

			case STAGE_STREAM:
				targetConnection.write(data, function() {
					logger.debug(`[${connectionId}]: write data[length = ${data.length}] to target connection`);
				});
				break;
		}
	});
	connection.on('close', function(code, reason) {
		logger.info(`[${connectionId}]: close event[code = '${WSErrorCode[code]}'] of local connection has been triggered`);
		connections[connectionId] = null;
		targetConnection && targetConnection.destroy();
	});
	connection.on('error', function(error) {
		logger.error(`[${connectionId}]: an error of connection local occured`, error);
		connection.terminate();
		connections[connectionId] = null;
		targetConnection && targetConnection.end();
	});
};

//local
TCPRelay.prototype.handleConnectionByLocal = function(connection) {
	var self = this;
	var config = self.config;
	var method = config.method;
	var password = config.password;
	var serverAddress = config.serverAddress;
	var serverPort = config.serverPort;

	var logger = self.logger;
	var encryptor = new Encryptor(password, method);

	var stage = STAGE_INIT;
	var connectionId = (globalConnectionId++) % MAX_CONNECTIONS;
	var serverConnection, cmd, addressHeader;

	var canWriteToLocalConnection = true;
	var dataCache = [];

	logger.info(`[${connectionId}]: accept connection from client`);
	connections[connectionId] = connection;
	connection.setKeepAlive(false);
	connection.on('data', function(data) {
		logger.debug(`[${connectionId}]: read data[length = ${data.length}] from client connection at stage[${STAGE[stage]}]`);
		switch (stage) {

			case STAGE_INIT:
				if (data.length < 3 || data.readUInt8(0) != 5) {
					stage = STAGE_DESTROYED;
					return connection.end();
				}
				connection.write("\x05\x00");
				stage = STAGE_ADDR;
				break;

			case STAGE_ADDR:
				if (data.length < 10 || data.readUInt8(0) != 5) {
					stage = STAGE_DESTROYED;
					return connection.end();
				}
				cmd = data.readUInt8(1);
				addressHeader = parseAddressHeader(data, 3);
				if (!addressHeader) {
					stage = STAGE_DESTROYED;
					return connection.end();
				}

				//only supports connect cmd
				if (cmd != CMD_CONNECT) {
					logger.error('[${connectionId}]: only supports connect cmd');
					stage = STAGE_DESTROYED;
					return connection.end("\x05\x07\x00\x01\x00\x00\x00\x00\x00\x00");
				}

				logger.info(`[${connectionId}]: connecting to ${addressHeader.dstAddr}:${addressHeader.dstPort}`);
				connection.write("\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00");

				stage = STAGE_CONNECTING;

				serverConnection = new WebSocket('ws://' + serverAddress + ':' + serverPort, {
					perMessageDeflate: false
				});
				serverConnection.on('open', function() {
					logger.info(`[${connectionId}]: connecting to server`);
					serverConnection.send(encryptor.encrypt(data.slice(3)), function() {
						stage = STAGE_STREAM;
						dataCache = Buffer.concat(dataCache);
						serverConnection.send(encryptor.encrypt(dataCache), {
							binary: true
						}, function() {
							logger.debug(`[${connectionId}]: write data[length = ${dataCache.length}] to client connection`);
							dataCache = null;
						});
					});
				});
				serverConnection.on('message', function(data) {
					logger.debug(`[${connectionId}]: read data[length = ${data.length}] from server connection`);
					canWriteToLocalConnection && connection.write(encryptor.decrypt(data), function() {
						logger.debug(`[${connectionId}]: write data[length = ${data.length}] to client connection`);
					});
				});
				serverConnection.on('error', function(error) {
					logger.error(`[${connectionId}]: an error of server connection occured`, error);
					stage = STAGE_DESTROYED;
					connection.end();
				});
				serverConnection.on('close', function(code, reason) {
					logger.info(`[${connectionId}]: close event[code = '${WSErrorCode[code]}'] of server connection has been triggered`);
					stage = STAGE_DESTROYED;
					connection.end();
				});

				if (data.length > addressHeader.headerLen + 3) {
					dataCache.push(data.slice(addressHeader.headerLen + 3));
				}
				break;

			case STAGE_CONNECTING:
				dataCache.push(data);
				break;

			case STAGE_STREAM:
				canWriteToLocalConnection && serverConnection.send(encryptor.encrypt(data), {
					binary: true
				}, function() {
					logger.debug(`[${connectionId}]: write data[length = ${data.length}] to server connection`);
				});
				break;
		}
	});
	connection.on('end', function() {
		logger.info(`[${connectionId}]: end event of client connection has been triggered`);
		stage = STAGE_DESTROYED;
	});
	connection.on('close', function(hadError) {
		logger.info(`[${connectionId}]: close event[had error = ${hadError}] of client connection has been triggered`);
		stage = STAGE_DESTROYED;
		canWriteToLocalConnection = false;
		connections[connectionId] = null;
		serverConnection && serverConnection.terminate();
	});
	connection.on('error', function(error) {
		logger.error(`[${connectionId}]: an error of client connection occured`, error);
		stage = STAGE_DESTROYED;
		connection.destroy();
		canWriteToLocalConnection = false;
		connections[connectionId] = null;
		serverConnection && serverConnection.close();
	});
};


TCPRelay.prototype.bootstrap = function() {
	this.initLogger();
	return this.initServer();
};

TCPRelay.prototype.stop = function() {
	var self = this;
	var connId = null;
	return new Promise(function(resolve, reject) {
		if (self.server) {
			self.server.close(function() {
				resolve();
			});

			for (connId in connections) {
				if (connections[connId]) {
					self.isLocal ? connections[connId].destroy() : connections[connId].terminate();
				}
			}

		} else {
			resolve();
		}
	});
};

module.exports.TCPRelay = TCPRelay;