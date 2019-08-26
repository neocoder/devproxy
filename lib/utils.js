const path = require('path');
const mime = require('mime-types');

const { DEFAULT_CONFIG_FILENAME } = require('./const');
const config = getConfig();

/**
 * Normalized rule object
 * @param {Object} rule Rule object
 * */
function normalizeRule(rule) {
    const nRule = {};

    const original = rule.original || rule.o;
    if (original) {
        nRule.original = original;
    }

    const local = rule.local || rule.l;
    if (local) {
        nRule.local = local;
    }

    const matchOriginal = rule.matchOriginal || rule.m;
    if (matchOriginal) {
        nRule.matchOriginal = matchOriginal;
    }

    const transform = rule.transform || rule.t;
    if (transform) {
        nRule.transform = transform;
    }

    const { handle, method, matchContentType } = rule;
    if (handle) {
        nRule.handle = handle;
    }

    if (method) {
        nRule.method = method;
    }
    if (matchContentType) {
        nRule.matchContentType = matchContentType;
    }

    return nRule;
}

function findReplaceRule(url, mimeType) {
    return config.rules.map(normalizeRule).find(rule => {
        if (rule.matchOriginal) {
            return rule.matchOriginal(url);
        }
        if (rule.matchContentType) {
            return rule.matchContentType === mimeType;
        }
        const { original } = rule;
        const match = original instanceof RegExp ? url.match(original) : url === original;
        return !!match;
    });
}

function getMimeFromURL(url) {
    const m = url.match(/\.(\w+?)(\?|#|$)/gi);
    const reqUrlExtentison = (m && m[1]) || false;
    let mimeType = null;
    if (reqUrlExtentison) {
        mimeType = mime.lookup(reqUrlExtentison);
        if (mimeType) {
            return mimeType;
        }
    }
    return '';
}

function getConfig() {
    const configFileName = path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);

    const defaultConfig = require('./defaultConfig');
    const userConfig = require(configFileName);
    return Object.assign({}, defaultConfig, userConfig);
}

module.exports = {
    findReplaceRule,
    normalizeRule,
    getMimeFromURL,
    getConfig,
};
