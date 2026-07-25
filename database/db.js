const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function createDb(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

module.exports = { createDb };
