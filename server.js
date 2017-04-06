const {
    TCPRelay
} = require('./tcprelay');
new TCPRelay({
    serverAddress: process.env['SERVER_ADDRESS'] || '127.0.0.1',
    serverPort: process.env['PORT'] || 1081,
    password: process.env['password'] || 'shadowsocks-over-websocket',
    method: process.env['method'] || 'aes-256-cfb'
}, false, 'info').bootstrap();