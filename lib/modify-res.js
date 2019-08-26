const debug = require('debug')('modifyres');
const path = require('path');
const zlib = require('zlib');
const { getCacheWriteStream } = require('./cache');

const { DEFAULT_CONFIG_FILENAME } = require('./const');

const configFileName = path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);

const defaultConfig = require('./defaultConfig');
const { findReplaceRule } = require('./utils');

const userConfig = require(configFileName); // eslint-disable-line
const config = Object.assign({}, defaultConfig, userConfig);

const { Writable, Transform } = require('stream');

// Tangled streams
class YStream extends Writable {
    constructor(writeTargets) {
        super();
        this.writeTargets = writeTargets.filter(w => w && w.write);
    }
    _write(chunk, enc, done) {
        let leftToWrite = this.writeTargets.length;

        function writeComplete() {
            leftToWrite -= 1;
            if (leftToWrite === 0) {
                done();
            } else if (leftToWrite < 0) {
                console.warn('Something went wrong. Check implementation.');
            }
        }

        this.writeTargets.forEach(w => {
            if (!w.write(chunk, enc)) {
                w.once('drain', writeComplete);
            } else {
                process.nextTick(writeComplete);
            }
        });
    }
    _final(done) {
        this.writeTargets.forEach(w => {
            w.end();
        });
        done();
    }
}

class TStream extends Transform {
    constructor(writeTargets) {
        super();
        this.writeTargets = writeTargets.filter(w => w && w.write);
    }
    _transform(chunk, enc, done) {
        let leftToWrite = this.writeTargets.length;
        const that = this;

        function writeComplete() {
            leftToWrite -= 1;
            if (leftToWrite === 0) {
                that.push(chunk);
                done();
            } else if (leftToWrite < 0) {
                console.warn('Something went wrong. Check implementation.');
            }
        }

        if (leftToWrite <= 0) {
            that.push(chunk);
            done();
            return;
        }

        this.writeTargets.forEach(w => {
            if (!w.write(chunk, enc)) {
                w.once('drain', writeComplete);
            } else {
                process.nextTick(writeComplete);
            }
        });
    }
    _final(done) {
        this.writeTargets.forEach(w => {
            w.end();
        });
        done();
    }
}

class TransformResponseBody extends Transform {
    constructor(callback, wpOptions, res) {
        super();
        this.callback = callback;
        this.wpOptions = wpOptions;
        this.res = res;
        this.buffer = [];
        this.firstChunk = true;
    }
    _transform(chunk, enc, done) {
        const c = chunk.toString();
        if (this.firstChunk) {
            this.firstChunk = false;
        }
        this.buffer.push(c);
        done();
    }
    _flush(done) {
        const body = this.callback(this.buffer.join(''), this.wpOptions, this.res);

        if (body instanceof Promise) {
            body.then(modifiedBody => {
                this.push(modifiedBody);
                done();
            }).catch(done);
        } else {
            this.push(body);
            done();
        }
    }
}

/**
 * Modify the response of json
 * @param proxyRes {Response} The http response from the target
 * @param req {Request} The http request to dev-proxy
 * @param res {Response} The http response from dev-proxy
 * @param wpOptions {Object} webpack options
 */
module.exports = function processProxyResponse(proxyRes, req, res, wpOptions) {
    let contentEncoding = '';
    let contentType = '';
    if (proxyRes && proxyRes.headers) {
        contentEncoding = proxyRes.headers['content-encoding'];
        contentType = proxyRes.headers['content-type']; // eslint-disable-line no-param-reassign
    }

    let unzip;
    let zip;
    // Now only deal with the gzip/deflate/undefined content-encoding.
    switch (contentEncoding) {
        case 'gzip':
            debug('Using GZIP');
            unzip = zlib.createGunzip();
            zip = zlib.createGzip();
            break;
        case 'deflate':
            debug('Using DEFLATE');
            unzip = zlib.Inflate();
            zip = zlib.Deflate();
            break;
        default:
            // noop
            break;
    }

    function processRes(err, cacheWriteStream) {
        let transformCallback = x => x;

        if (config.localOverrides) {
            const replaceRule = findReplaceRule(req.url, contentType);
            if (replaceRule) {
                transformCallback = replaceRule.transform;

                res.setHeader(
                    'X-proxy-replaced',
                    wpOptions._fromCache ? 'cache-modified' : 'modified',
                );
            }
        }

        const targetStreams = [];

        if (cacheWriteStream) {
            targetStreams.push(cacheWriteStream);
        }

        if (unzip) {
            targetStreams.push(zip);
            debug(`[${new Date()}] >>>>>>> Unzipping...`);
            unzip.on('error', e => {
                debug('Unzip error: ', e);
                res.end();
            });
            res.setHeader('Content-Encoding', 'gzip');
            proxyRes.pipe(unzip).pipe(new YStream(targetStreams));

            zip.pipe(new TransformResponseBody(transformCallback, wpOptions, res)).pipe(res);
        } else if (!contentEncoding) {
            debug(`>>>>>>> ${req.targetHost}${req.url}`);
            debug('>>>>>>> NO content encoding...');
            proxyRes
                .pipe(new TStream(targetStreams))
                .pipe(new TransformResponseBody(transformCallback, wpOptions, res))
                .pipe(res);
        } else {
            debug(`Not supported content-encoding: ${contentEncoding}`);
        }
    }

    if (wpOptions._fromCache) {
        process.nextTick(processRes);
    } else {
        getCacheWriteStream(req.targetHost, req.url, processRes);
    }
};
