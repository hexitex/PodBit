const Database = require('better-sqlite3');
const db = new Database('c:/Users/rmcgl/Podbit/data/system.db', { readonly: true });

const cols = db.prepare('PRAGMA table_info(subsystem_assignments)').all();
console.log('Columns:', cols.map(c => c.name).join(', '));

const all = db.prepare('SELECT * FROM subsystem_assignments').all();
console.log('\nTotal rows:', all.length);

const qwenIds = ['521e9d95-a97f-48a5-b305-41f6c0ac48da', 'da58b942-814b-4fbb-a08f-b505fba02ed8'];
const matches = all.filter(row => Object.values(row).some(v => qwenIds.includes(String(v))));
console.log('\n--- Rows referencing qwen 3.6 model UUIDs ---');
console.log(JSON.stringify(matches, null, 2));
