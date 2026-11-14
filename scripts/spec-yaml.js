const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const dir = path.join(__dirname, '..', 'openapi');
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'openapi.json'), 'utf8'));
fs.writeFileSync(path.join(dir, 'openapi.yaml'), yaml.dump(spec, { lineWidth: 100, noRefs: true }));
console.log('openapi/openapi.yaml written');
