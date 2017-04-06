const TCPRelay = require('./tcprelay').TCPRelay;
const local = require('commander');

local
    .version('0.1.4')
    .option('-m --method [method]', 'encryption method, default: aes-256-cfb')
    .option('-k --password [password]', 'password')
    .option('-s --server-address [address]', 'server address')
    .option('-p --server-port [port]', 'server port, default: 8388')
    .option('-b --local-address [address]', 'local binding address, default: 127.0.0.1')
    .option('-l --local-port [port]', 'local port, default: 1080')
    .parse(process.argv);

var relay = new TCPRelay({
    localAddress: local.localAddress || '127.0.0.1',
    localPort: local.localPort || 1080,
    serverAddress: local.serverAddress || '127.0.0.1',
    serverPort: local.serverPort || 8388,
    password: local.password || 'shadowsocks-over-websocket',
    method: local.method || 'aes-256-cfb'
}, true, 'info');
relay.bootstrap();