#!/usr/bin/env node

const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');

const { DEFAULT_CONFIG_FILENAME } = require('../lib/const');

function showUsage() {
    console.log(`
devproxy init - create basic config file in the projects directory
`);
}

/**
 * Copies config example in to the working directory of a project
 */
function init() {
    const example = path.resolve(__dirname, '../config-examples/main.config.js');
    const newConfigFilename = path.join(process.cwd(), DEFAULT_CONFIG_FILENAME);
    fs.copyFileSync(example, newConfigFilename, fs.constants.COPYFILE_EXCL);
}

const commands = {
    init: init,
};

function main() {
    // running command
    if (commands[argv._]) {
        commands[argv._]();
    } else {
        require('../lib/index');
    }
}

main();
