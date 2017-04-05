const {TCPRelay} = require('./tcprelay');
new TCPRelay({
    localAddress: '127.0.0.1',
    localPort: 1080,
    serverAddress: '127.0.0.1',
    serverPort: 21001,
    password: 'ourvpn01010101',
    method: "aes-256-cfb"
}, true, 'error').bootstrap();