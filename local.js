const TCPRelay = require('./tcprelay').TCPRelay;
const local = require('commander');
const constants = require('./constants');

local
    .version(constants.VERSION)
    .option('-m --method <method>', 'encryption method, default: aes-256-cfb')
    .option('-k --password <password>', 'password')
    .option('-s --server-address <address>', 'server address')
    .option('-p --server-port <port>', 'server port, default: 8388')
    .option('-b --local-address <address>', 'local binding address, default: 127.0.0.1')
    .option('-l --local-port <port>', 'local port, default: 1080')
    .option('--log-level <level>', 'log level(debug|info|warn|error|fatal)', /^(debug|info|warn|error|fatal)$/i, 'info')
    .option('--log-file <file>', 'log file')
    .parse(process.argv);

var relay = new TCPRelay({
    localAddress: local.localAddress,
    localPort: local.localPort,
    serverAddress: local.serverAddress,
    serverPort: local.serverPort,
    password: local.password,
    method: local.method
}, true);
relay.setLogLevel(local.logLevel);
relay.setLogFile(local.logFile);
relay.bootstrap();