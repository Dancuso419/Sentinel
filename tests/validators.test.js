const { isValidEmail, requireFields, isAllowedEvidenceFile } = require('../lib/validators');

test('isValidEmail accepts well-formed addresses and rejects malformed ones', () => {
  expect(isValidEmail('a@b.com')).toBe(true);
  expect(isValidEmail('not-an-email')).toBe(false);
  expect(isValidEmail('')).toBe(false);
});

test('requireFields lists missing/empty fields', () => {
  expect(requireFields({ name: 'Jo', email: '' }, ['name', 'email', 'password'])).toEqual(['email', 'password']);
  expect(requireFields({ name: 'Jo', email: 'a@b.com', password: 'x' }, ['name', 'email', 'password'])).toEqual([]);
});

test('isAllowedEvidenceFile enforces type and 5MB size limit', () => {
  expect(isAllowedEvidenceFile('image/jpeg', 1024)).toBe(true);
  expect(isAllowedEvidenceFile('application/pdf', 5 * 1024 * 1024)).toBe(true);
  expect(isAllowedEvidenceFile('application/pdf', 5 * 1024 * 1024 + 1)).toBe(false);
  expect(isAllowedEvidenceFile('text/plain', 1024)).toBe(false);
});
