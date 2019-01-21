const fs = require('fs');
const url = require('url');
const path = require('path');

const targetUrl = url.parse(TARGET);

module.exports = {
    port: 80,
    sslPort: 443,
    localOverrides: false,
    target: 'https://int3.apc.com',
    ssl: {
        key: fs.readFileSync(path.resolve(__dirname, 'ssl/server.key'), 'utf8'),
        cert: fs.readFileSync(path.resolve(__dirname, 'ssl/server.crt'), 'utf8'),
    },
    rules: [
        // replacing html page with contents of other file
        {
            original: '/t/air-vapormax-2019-premium-mens-shoe-wr4C0z/AT6810-001',
            local: './html/air-vapormax-2019_modified.html',
        },
        // transforming html page with transform function
        {
            original: '/t/air-vapormax-2019-premium-mens-shoe-wr4C0z/AT6810-001',
            transform: function(body) {
                let b = body.replace(new RegExp(targetUrl.hostname, 'ig'), 'local.mysite.com');

                b = b.replace(/<script.*?\/search\.js"><\/script>/gi, '');

                return b;
            },
        },

        // replace resource with local one
        {
            o: '/static/js/app.js',
            l: './build/js/app.js',
        },
    ],
};
