'use strict';

const http = require('http'),
    https = require('https'),
    connect = require('connect'),
    httpProxy = require('http-proxy'),
    transformerProxy = require('transformer-proxy'),
    path = require('path'),
    chalk = require('chalk'),
    fs = require('fs'),
    zlib = require('zlib'),
    cluster = require('cluster'),
    url = require('url'),
    { get, isArray } = require('lodash'),
    mime = require('mime-types');

const { DEFAULT_CONFIG_FILENAME } = require('./const');

const defaultConfig = require('./defaultConfig');

const modifyResponse = require('./modify-res');

const numCPUs = require('os').cpus().length;
const workers = [];

const configFileName = path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);

function forkWorkers() {
    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        workers.push(cluster.fork());
    }
}

function killWorkers() {
    if (workers.length) {
        workers.forEach(worker => worker.kill());
    }
}

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    forkWorkers();

    fs.watchFile(configFileName, (curr, prev) => {
        if (curr && prev) {
            console.log(`Config file ${configFileName} changed. Restarting workers`);
        }
        killWorkers();
        forkWorkers();
    });

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
    return;
}

createProxy(loadConfig());

function loadConfig() {
    delete require.cache[require.resolve(configFileName)];
    return require(configFileName);
}

function createProxy(userConfig) {
    const config = Object.assign({}, defaultConfig, userConfig);
    const targetUrl = url.parse(config.target);

    function findReplaceRule(url) {
        return config.rules.find(rule => {
            let match = url.match(rule.original || rule.o);
            return !!match;
        });
    }

    //
    // The transforming function.
    //

    const transformerMiddleware = function(req, res, next) {
        // fixing content-type
        const m = req.url.match(/\.(.+)$/);
        const reqUrlExtentison = (m && m[1]) || false;

        if (reqUrlExtentison) {
            const mimeType = mime.lookup(reqUrlExtentison);
            if (mimeType) {
                console.log(`Setting content type to ${mimeType} for ${req.url}`);
                res.setHeader('Content-Type', mimeType);
            }
        }

        if (!config.rules || !config.localOverrides) {
            return next();
        }

        const replaceRule = findReplaceRule(req.url);

        // transformation is handled later
        if (!replaceRule || replaceRule.t) {
            return next();
        }
        console.log(`Replace rule for ${req.url}`);

        const gzip = zlib.createGzip();
        const localFileName = (replaceRule.local || replaceRule.l).replace(/\$(\d+)/, (m, p1) => {
            return match[p1];
        });
        const localFilePath = path.resolve(localFileName);
        const newDataStream = fs.createReadStream(localFilePath);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('X-proxy-replaced', 'local');

        newDataStream.pipe(gzip).pipe(res);
    };

    //
    // A proxy as a basic connect app.
    //

    var proxy = httpProxy.createProxyServer({
        target: config.target,
        secure: false,
        // ssl: config.ssl,
        autoRewrite: true,
        changeOrigin: true,
        protocolRewrite: 'http',
        selfHandleResponse: true,
        cookieDomainRewrite: {
            'www.apc.com': 'local.apc.com',
        },
    });

    // proxyReq - request to target
    // req - request to this proxy
    // res - response t0 browser

    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        proxyReq.removeHeader('x-xss-protection');
        proxyReq.removeHeader('Origin');
        proxyReq.removeHeader('referer');

        res.setHeader('Access-Control-Allow-Origin', '*');
    });

    proxy.on('proxyRes', (proxyRes, req, res) => {
        let allowedOrigin = false;

        if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
        }

        // res.removeHeader('x-xss-protection');

        // Copying headers and status code
        Object.keys(proxyRes.headers).forEach(header => {
            let headerVal = proxyRes.headers[header];
            const rx = new RegExp(targetUrl.hostname, 'ig'); // /www\.apc\.com/gi;
            if (headerVal && headerVal.match && headerVal.match(rx)) {
                headerVal = headerVal.replace(rx, 'local.apc.com');
            }
            if (header === 'set-cookie' && isArray(headerVal)) {
                headerVal = headerVal.map(val =>
                    val.replace(/; Secure/gi, '').replace(/; Httponly/gi, ''),
                );
            }
            if (header !== 'content-length') {
                res.setHeader(header, headerVal);
            }
        });
        res.statusCode = proxyRes.statusCode;

        // fixing content-type

        const m = req.url.match(/\.(.+)$/);
        const reqUrlExtentison = (m && m[1]) || false;
        if (reqUrlExtentison) {
            const mimeType = mime.lookup(reqUrlExtentison);
            if (mimeType) {
                //console.log(`Setting content type to ${mimeType} for ${req.url}`);
                res.setHeader('Content-Type', mimeType);
            }
        }
        // - end of fixing content-type

        if (config.localOverrides) {
            const replaceRule = findReplaceRule(req.url);

            if (replaceRule && (replaceRule.t || replaceRule.transform)) {
                res.setHeader('X-proxy-replaced', 'modified');
                modifyResponse(res, proxyRes, replaceRule.t || replaceRule.transform);
                return;
            }
        }

        proxyRes.pipe(res);
    });

    var app = connect();

    app.use(transformerMiddleware);

    app.use(function(req, res, next) {
        proxy.web(req, res, function(err) {
            // If there is any proxy error return the error.
            next(err);
        });
    });

    const httpServer = http.createServer(app).listen(config.port);
    let httpsServer = null;
    console.log('The proxy server listens on', config.port);

    if (config.ssl) {
        var httpsApp = connect();

        httpsApp.use(transformerMiddleware);

        httpsApp.use(function(req, res, next) {
            proxy.web(req, res, function(err) {
                // If there is any proxy error return the error.
                next(err);
            });
        });

        httpsServer = https.createServer(config.ssl, httpsApp).listen(config.sslPort);
        console.log('The https proxy server listens on', config.sslPort);
    }

    console.log('Proxying: ', config.target, '\n\n');

    return function() {
        console.log('Shutting down proxy server...');
        if (proxy) {
            proxy.close();
        }
        if (httpServer) {
            httpServer.close();
        }
        if (httpsServer) {
            httpsServer.close();
        }
    };
}
