# FE Dev proxy

This is an HTTP proxy which will help with FE development of ATG pages.
The main and only feature is to proxy HTTP pages and replace some assets accoring to config rules.

### Config

Config file ( config.js ) is pretty staightforward. It's a node module which exports a config object

#### Config prams

`port` - (optional. default: 8888) - Local proxy server port
`target` - (required) - Target webpage url, for example https://www.wikipedia.org/
`rules` - (optional, kind of...) - Array or file-replacement rules object
`ruleObject.original` - (required) = RegExp or string which will be converted to regexp
`ruleObject.local` - (required) = Replacement file path. Can include match groups from regex ( i.e. \$1 )

see included config.js as an example.

### Getting Started

Clone the repo, adjust config and develop:

```bash
$ npm install
$ npm run start
```

Now http://localhost:8888/wiki/Proxy
will proxy the https://en.wikipedia.org/wiki/Proxy with the file replacement rules applied.
