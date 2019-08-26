/* eslint consistent-return: 0 */

const express = require('express');
const webpack = require('webpack');
const path = require('path');
const tls = require('tls');
const https = require('https');
const http = require('http');
const fs = require('fs-extra');
const createProxy = require('./lib');
const { getConfig } = require('./lib/utils');
const config = getConfig();
const { readKeys } = require('./lib/ssl-helper');

if (config.webpackConfig) {
    try {
        fs.accessSync(config.webpackConfig, fs.constants.F_OK);
    } catch (err) {
        console.error(`Cannot read webpack config at ${config.webpackConfig}!`);
        config.webpackConfig = null;
    }
}

let webpackConfig = null;
let compiler = null;
let webpackData = {};
if (config.webpackConfig) {
    webpackConfig = require(config.webpackConfig);
    compiler = webpack(webpackConfig);
    const webpackData = {
        compiler,
    };
    compiler.hooks.afterEmit.tap('DevProxyPlugin', compilation => {
        const { publicPath } = compilation.outputOptions;

        compilation.entrypoints.forEach(value => {
            const { files } = value.runtimeChunk;

            webpackData.assetsUrls = files
                .map(asset => `${publicPath}${asset}`)
                .map(asset => path.resolve(asset));
        });

        // return true to emit the output, otherwise false
        return true;
    });
}

const app = express();

// Accept all pre-flight requests
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }
    next();
});

app.use(
    require('webpack-dev-middleware')(compiler, {
        noInfo: true,
        publicPath: '/static/',
        headers: {
            'X-proxy-replaced': 'from-webpack',
        },
    }),
);

createProxy(app, webpackData);

const secureContext = readKeys(config.ssl);

const httpsOptions = {
    SNICallback(domain, callback) {
        callback(null, secureContext[domain]);
    }, // SNICallback is passed the domain name, see NodeJS docs on TLS

    // default ssl keys if browser does not support SNI
    ...config.ssl[config.ssl.defaultSSLkeys],
};

http.createServer(app).listen(config.port, config.bindAddress);
https.createServer(httpsOptions, app).listen(config.sslPort, config.bindAddress);
