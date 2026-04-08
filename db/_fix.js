const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, 'sql.ts'), 'utf8').split('\n');
console.log('Read ' + lines.length + ' lines');