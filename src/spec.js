const fs = require('fs');
const path = require('path');

const specPath = path.join(__dirname, '..', 'openapi', 'openapi.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

module.exports = { spec, specPath };
