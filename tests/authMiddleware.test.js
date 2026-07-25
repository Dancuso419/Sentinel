const { requireAuth, requireRole } = require('../middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('requireAuth blocks when no session user', () => {
  const req = { session: {} };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth calls next when session user present', () => {
  const req = { session: { user: { id: 1, role: 'citizen' } } };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(next).toHaveBeenCalled();
});

test('requireRole blocks users without an allowed role', () => {
  const req = { session: { user: { id: 1, role: 'citizen' } } };
  const res = mockRes();
  const next = jest.fn();
  requireRole('officer', 'admin')(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('requireRole allows users with an allowed role', () => {
  const req = { session: { user: { id: 1, role: 'officer' } } };
  const res = mockRes();
  const next = jest.fn();
  requireRole('officer', 'admin')(req, res, next);
  expect(next).toHaveBeenCalled();
});

test('requireRole blocks when no session user', () => {
  const req = { session: {} };
  const res = mockRes();
  const next = jest.fn();
  requireRole('officer', 'admin')(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
