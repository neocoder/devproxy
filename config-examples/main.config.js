const fs = require('fs');
const url = require('url');
const path = require('path');

const targetUrl = url.parse(TARGET);

module.exports = {
    port: 80,
    sslPort: 443,
    localOverrides: false,
    webpackConfig: '<PATH TO WEBPACK CONFIG>',
    targets: {
        'local.some-website.com': 'https://www.some-website.com',
    },

    ssl: {
        'local.some-website.com': {
            key: path.resolve(__dirname, './ssl/device.key'),
            cert: path.resolve(__dirname, './ssl/local.some-website.com.crt'),
            ca: [path.resolve(__dirname, './ssl/rootCA.pem')],
        },
    },
    defaultSSLkeys: 'local.some-website.com',

    rules: [
        // replacing html page with contents of other file
        {
            original: '/eg/t/air-max-270-react-shoe-kZBR2B/AO4971-002',
            local: './html/air-vapormax-2019_modified.html',
        },
        // transforming html page with transform function
        {
            original: '/eg/t/air-max-270-react-shoe-kZBR2B/AO4971-002',
            transform: function(body) {
                let b = body.replace(new RegExp(targetUrl.hostname, 'ig'), 'local.mysite.com');

                b = b.replace(/<script.*?\/search\.js"><\/script>/gi, '');

                return b;
            },
        },

        // mocking response
        {
            original: '/rest/model/bigcorp/site/rest/SiteActor/chatPopup?pushSite=storeSiteUS',
            handle: (wpOptions, req, res) => {
                res.json({
                    siteChatInfo: {
                        chatLiveAgentDeploymentID: '2987348927492387dr5Jk',
                        countryName: 'United States',
                        chatButtonID: '323745457453Zj',
                        countryCode: 'US',
                    },
                    helplineTimeMsg: 'Mon-Fri 8am to 8pm EST',
                    chatOrganizationID: '55Rt00000000TTx',
                    chatAvailable: true,
                });
            },
        },

        // match function
        {
            matchOriginal: url => {
                const hasCCLCInURL = url.match(/\/(shop\/|shop\/tradeups\/)?\w{2}\/\w{2}\//gi);
                const resourceFile = url.match(/\.(js|map|css|svg|jpg|png|ttf|woff\d?)($|\?)/gi);

                const match = hasCCLCInURL && !resourceFile;
                if (match) {
                    console.log(`[${new Date().toLocaleDateString()}] Will transform ${url}`);
                }
                return match;
            },
            t: (body, wpOptions) => {
                return new Promise(resolve => {
                    const dom = new JSDOM(body);
                    const { window } = dom;
                    const { document } = window;

                    const src = dom
                        .serialize()
                        .replace(/\/(\w+)\.some-website\.com\//gi, '/local.some-website.com/');

                    resolve(src);
                });
            },
        },

        // replace resource with local one
        {
            o: '/static/js/app.js',
            l: './build/js/app.js',
        },
    ],
};
