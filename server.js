const {
    TCPRelay
} = require('./tcprelay');
new TCPRelay({
    serverAddress: '0.0.0.0',
    serverPort: process.env.PORT || 21001,
    password: 'ourvpn01010101',
    method: "aes-256-cfb"
}, false, 'error').bootstrap();