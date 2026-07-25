// tests/db.test.js
const { createDb } = require('../database/db');

test('createDb applies schema and returns a usable connection', () => {
  const db = createDb(':memory:');
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  expect(tables).toEqual(expect.arrayContaining(['users', 'reports', 'status_history', 'case_counters']));
  db.close();
});
