// tests/caseId.test.js
const { createDb } = require('../database/db');
const { nextCaseId } = require('../lib/caseId');

test('generates sequential zero-padded case IDs per year', () => {
  const db = createDb(':memory:');
  expect(nextCaseId(db, 2026)).toBe('CR-2026-0001');
  expect(nextCaseId(db, 2026)).toBe('CR-2026-0002');
  expect(nextCaseId(db, 2027)).toBe('CR-2027-0001');
  db.close();
});
