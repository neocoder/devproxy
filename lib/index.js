/* eslint import/no-dynamic-require:0 consistent-return:0 */
const path = require('path');
const fs = require('fs-extra');
const zlib = require('zlib');
const url = require('url');
const debug = require('debug')('dev-server:proxy');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
const request = require('request');

const { findReplaceRule, normalizeRule, getMimeFromURL } = require('./utils');

const { DEFAULT_CONFIG_FILENAME } = require('./const');

const CACHE_DIR = path.resolve(__dirname, '../cache');

// config
const configFileName = path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);

const defaultConfig = require('./defaultConfig');
const userConfig = require(configFileName);
const config = Object.assign({}, defaultConfig, userConfig);

const processProxyResponse = require('./modify-res');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const CACHE_ENABLED = true; // ['1', 'true'].includes((process.env.CACHE_ENABLED || '').toLowerCase());

function createProxy(app, wpOptions) {
    //
    // The transforming function.
    //

    // handle routes

    config.rules
        .map(normalizeRule)
        .filter(r => r.handle && r.original)
        .forEach(r => {
            const method = r.method || 'get';
            app[method](r.original, (req, res, next) => {
                const opts = { ...wpOptions };
                r.handle(opts, req, res, next);
            });
        });

    // check host mapping
    app.use((req, res, next) => {
        const { host } = req.headers;
        const target = config.targets[host];

        debug('host', host);
        debug('target', target);

        if (!target) {
            console.error(`Error: no target for host ${host}`);
            return res.sendStatus(500).end(`Error: no target for host ${host}`);
        }

        req.target = target;
        req.targetHost = url.parse(target).hostname;

        next();
    });

    const transformerMiddleware = function transformerMiddleware(req, res, next) {
        if (!config.rules || !config.localOverrides) {
            debug('No rules or local overrides are configured.');
            return next();
        }

        const mimeType = getMimeFromURL(req.url);
        if (mimeType) {
            debug(`Setting content type to ${mimeType} for ${req.url}`);
            res.setHeader('Content-Type', mimeType);
        }

        const replaceRule = findReplaceRule(req.url, mimeType);

        if (replaceRule) {
            debug(`Found replace rule for ${req.url}`);

            if (replaceRule.transform) {
                debug('R> transform');
                return next(); // transformation is handled later
            } else if (replaceRule.handle) {
                debug('R> handle');
                return replaceRule.handle({ ...wpOptions }, req, res, next);
            } else if (replaceRule.local) {
                debug('R> local');
                const gzip = zlib.createGzip();
                const localFileName = replaceRule.local || replaceRule.l;
                const localFilePath = path.resolve(localFileName);
                const newDataStream = fs.createReadStream(localFilePath);
                res.setHeader('Content-Encoding', 'gzip');
                res.setHeader('X-proxy-replaced', 'local');

                newDataStream.pipe(gzip).pipe(res);
            } else {
                const errStr = `Replace rule for url ${
                    req.url
                } is not properly configured. It must contain one of the following properties: transform, handle, local.`;
                console.error(errStr);
                console.log(replaceRule);
                return next(new Error(errStr));
            }
        } else {
            // debug(`No replace rule found for URL: ${req.url}`);
            return next();
        }
    };

    // Local file cache
    app.use((req, res, next) => {
        if (!CACHE_ENABLED) {
            return next();
        }

        const filePath = path.join(CACHE_DIR, req.targetHost, req.url);

        fs.exists(filePath, exists => {
            if (!exists) {
                return next();
            }

            debug('[CACHE] URL: ', req.url);
            debug('[CACHE] hit: ', filePath);
            const fileStream = fs.createReadStream(filePath);

            // setting content-type
            const mimeType = getMimeFromURL(req.url);
            if (mimeType) {
                debug(`[CACHE] Setting content type to ${mimeType}`);
                res.setHeader('Content-Type', mimeType);
            }
            res.setHeader('X-proxy-replaced', 'from-cache');

            if (config.localOverrides) {
                const replaceRule = findReplaceRule(req.url, mimeType);

                // Passing cached file throug transform function
                if (replaceRule && replaceRule.transform) {
                    res.setHeader('X-proxy-replaced', 'cached-modified');
                    wpOptions._fromCache = true; // eslint-disable-line no-param-reassign
                    processProxyResponse(fileStream, req, res, wpOptions);
                    return;
                }
            }
            fileStream.pipe(res);
        });
    });

    app.use(transformerMiddleware);

    // Proxy middleware
    app.use((req, res) => {
        debug('[PROXY] req.target', req.target);
        debug('[PROXY] req.url', req.url);

        res.setHeader('Access-Control-Allow-Origin', '*');

        debug(`[PROXY] Proxying url: ${req.target}${req.url}`);

        const proxyRes = request({
            url: `${req.target}${req.url}`,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36',
            },
            // pool: { maxSockets: 20 },
            // strictSSL: false,
        });

        processProxyResponse(proxyRes, req, res, wpOptions);
    });

    debug('Proxying domains: ', config.targets, '\n\n');
}

module.exports = createProxy;
