const TCPRelay = require('./tcprelay').TCPRelay;
const server = require('commander');

server
    .version('0.1.4')
    .option('-m --method [method]', 'encryption method, default: aes-256-cfb')
    .option('-k --password [password]', 'password')
    .option('-s --server-address [address]', 'server address')
    .option('-p --server-port [port]', 'server port, default: 8388')
    .parse(process.argv);

var relay = new TCPRelay({
    serverAddress: process.env['SERVER_ADDRESS'] || server.serverAddress || '127.0.0.1',
    serverPort: process.env['PORT'] || server.serverPort || 8388,
    password: process.env['PASSWORD'] || server.password || 'shadowsocks-over-websocket',
    method: process.env['METHOD'] || server.method || 'aes-256-cfb'
}, false, 'info');
relay.bootstrap();