const path = require('path');
const c = require('../coverage/coverage-summary.json');
const root = path.resolve(__dirname, '..');
const files = Object.entries(c)
  .filter(([k]) => k !== 'total')
  .map(([f, d]) => ({
    file: path.relative(root, f).replace(/\\/g, '/'),
    uncovered: d.statements.total - d.statements.covered,
    total: d.statements.total,
    pct: d.statements.pct
  }))
  .sort((a, b) => b.uncovered - a.uncovered)
  .slice(0, 35);
files.forEach(f => console.log(f.uncovered + '\t' + f.pct + '%\t' + f.file));
