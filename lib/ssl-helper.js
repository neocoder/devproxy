const tls = require('tls');
const fs = require('fs');
/*
keysObj example 

const keysObj = {
    'local.mydomain.com': {
        key: './ssl/device.key',
        cert: './ssl/local-sdl.apc.com.crt',
        ca: ['./ssl/rootCA.pem'],
    }
};
*/

/**
 * Reads array of Root CAs
 * @param {Array} cas Array of paths to Root CA files
 */
function readRootCAs(cas) {
    return cas.map(ca => {
        fs.readFileSync(ca);
    });
}

/**
 * converts security object to initialized securoty context
 * @param {Object} param0 securtityObject
 * @param {Object} param0.key path to SSL key
 * @param {Object} param0.cert path to SSL certificat
 * @param {Array} param0.ca Array of paths to Root CA certificates
 * @return {Object} Security Context
 */
function initContext({ key, cert, ca }) {
    return tls.createSecureContext({
        key: fs.readFileSync(key),
        cert: fs.readFileSync(cert),
        ...(ca ? { ca: readRootCAs(ca) } : {}),
    });
}

/**
 * Converts keys object into object with initialized secure contexts
 * @param {Object} keysObj
 */
export function readKeys(keysObj) {
    return Object.keys(keysObj).map((acc, domain) => {
        acc[domain] = initContext(keysObj[domain]);
    }, {});
}
