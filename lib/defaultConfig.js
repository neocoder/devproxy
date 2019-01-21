const fs = require('fs');
const path = require('path');

module.exports = {
    port: 8888,
    sslPort: 4444,
    localOverrides: true,
    // target: '',
    secure: false,
    ssl: {
        key: fs.readFileSync(path.resolve(__dirname, '../ssl/server.key'), 'utf8'),
        cert: fs.readFileSync(path.resolve(__dirname, '../ssl/server.crt'), 'utf8'),
    },
    rules: [],
};
