const path = require('path');
const debug = require('debug')('dev-server:cache');
const fs = require('fs-extra');

const CACHE_DIR = path.resolve(__dirname, '../cache');

function getCacheWriteStream(targetHost, url, done = () => {}) {
    const filePath = path.join(CACHE_DIR, targetHost, url);
    debug('[proxyRes] URL: ', url);
    debug('[proxyRes] filePath: ', filePath);

    fs.ensureFile(filePath, err => {
        if (err) {
            console.error(`>>>>>> Error: File ${filePath} is already exist`);
            return done();
        }

        console.log('Piping res to file...');
        done(null, fs.createWriteStream(filePath));
    });
}

module.exports = {
    getCacheWriteStream,
};
