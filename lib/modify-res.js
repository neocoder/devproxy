'use strict';

const zlib = require('zlib');
const split2 = require('split2');
const through2 = require('through2');

/**
 * Modify the response of json
 * @param res {Response} The http response
 * @param proxyRes {proxyRes|String} String: The http header content-encoding: gzip/deflate
 * @param callback {Function} Custom modified logic
 */
module.exports = function modifyResponse(res, proxyRes, callback) {
    let contentEncoding = '';

    if (proxyRes && proxyRes.headers) {
        contentEncoding = proxyRes.headers['content-encoding'];
        // Delete the content-length if it exists. Otherwise, an exception will occur
        // @see: https://github.com/langjt/node-http-proxy-json/issues/10
        if ('content-length' in proxyRes.headers) {
            delete proxyRes.headers['content-length'];
        }
    }

    let unzip, zip;
    // Now only deal with the gzip/deflate/undefined content-encoding.
    switch (contentEncoding) {
        case 'gzip':
            unzip = zlib.createGunzip();
            zip = zlib.createGzip();
            break;
        case 'deflate':
            unzip = zlib.Inflate();
            zip = zlib.Deflate();
            break;
    }

    // The cache response method can be called after the modification.
    // let _write = res.write;
    // let _end = res.end;

    if (unzip) {
        unzip.on('error', function(e) {
            console.log('Unzip error: ', e);
            _end.call(res);
        });
        res.setHeader('Content-Encoding', 'gzip');
        proxyRes
            .pipe(unzip)
            .pipe(
                (function() {
                    let buffer = [];
                    return through2(
                        function(chunk, enc, next) {
                            let c = chunk.toString();
                            buffer.push(c);
                            next();
                        },
                        function(next) {
                            let body = callback(buffer.join(''));
                            this.push(body);
                            next();
                        },
                    );
                })(),
            )
            .pipe(zip)
            .pipe(res);
    } else if (!contentEncoding) {
        proxyRes
            .pipe(split2())
            .pipe(
                through2(function(chunk, enc, next) {
                    let c = chunk.toString();
                    // console.log('in:', c);
                    c = callback(c);
                    // console.log('out:', c);
                    this.push(c + '\n');
                    next();
                }),
            )
            .pipe(res);
    } else {
        console.log('Not supported content-encoding: ' + contentEncoding);
    }
};
