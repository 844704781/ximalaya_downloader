const fs = require('fs');
const { projectRoot } = require('../settings.js');

const configBuf = fs.readFileSync(`${projectRoot}/config.json`);
const _config = JSON.parse(String(configBuf));

module.exports = {
    config: _config
};
