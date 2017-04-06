const {
    TCPRelay
} = require('./tcprelay');
new TCPRelay({
    localAddress: '127.0.0.1',
    localPort: 1080,
    serverAddress: '127.0.0.1',
    serverPort: 1081,
    password: 'shadowsocks-over-websocket',
    method: 'aes-256-cfb'
}, true, 'info').bootstrap();