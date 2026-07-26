const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Columns added after the first release. schema.sql uses CREATE TABLE IF NOT EXISTS,
// so an existing ccrts.db keeps its original shape and never picks these up on its
// own — this brings it forward without touching the data already in it.
//
// SQLite cannot add a column with a non-constant default or a REFERENCES clause via
// ALTER TABLE in every version, so these are declared plainly here and the CHECK
// constraints live in schema.sql for databases created fresh.
const MIGRATIONS = [
  ['users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
  ['reports', 'reporter_relationship', 'TEXT'],
  ['reports', 'reporter_verdict', 'TEXT'],
  ['reports', 'reporter_verdict_note', 'TEXT'],
  ['reports', 'reporter_verdict_at', 'TEXT'],
  ['reports', 'reviewed_by', 'INTEGER'],
  ['reports', 'reviewed_at', 'TEXT'],
  ['status_history', 'event', "TEXT NOT NULL DEFAULT 'status'"],
  ['status_history', 'detail', 'TEXT']
];

function applyMigrations(db) {
  for (const [table, column, definition] of MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createDb(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  applyMigrations(db);
  return db;
}

module.exports = { createDb };
