function bumpCounter(db, year) {
  const row = db.prepare('SELECT count FROM case_counters WHERE year = ?').get(year);
  const next = row ? row.count + 1 : 1;
  if (row) {
    db.prepare('UPDATE case_counters SET count = ? WHERE year = ?').run(next, year);
  } else {
    db.prepare('INSERT INTO case_counters (year, count) VALUES (?, ?)').run(year, next);
  }
  return next;
}

function nextCaseId(db, year) {
  db.exec('BEGIN');
  let n;
  try {
    n = bumpCounter(db, year);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return `CR-${year}-${String(n).padStart(4, '0')}`;
}

module.exports = { nextCaseId };
