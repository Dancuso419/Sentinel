const { requireAuth, requireRole } = require('../middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockApp(user = { id: 1, is_active: 1 }) {
  return {
    locals: {
      db: {
        prepare: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue(user)
        })
      }
    }
  };
}

test('requireAuth blocks when no session user', () => {
  const req = { session: {} };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth calls next when session user present and active in DB', () => {
  const req = { session: { user: { id: 1, role: 'citizen' } }, app: mockApp({ id: 1, is_active: 1 }) };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(next).toHaveBeenCalled();
});

test('requireAuth blocks and destroys session when user no longer active', () => {
  const destroy = jest.fn((cb) => cb());
  const req = { session: { user: { id: 1, role: 'citizen' }, destroy }, app: mockApp({ id: 1, is_active: 0 }) };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(destroy).toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth blocks when the session user no longer exists in the DB', () => {
  const destroy = jest.fn((cb) => cb());
  const req = { session: { user: { id: 1, role: 'citizen' }, destroy }, app: mockApp(null) };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('requireRole blocks users without an allowed role', () => {
  const req = { session: { user: { id: 1, role: 'citizen' } }, app: mockApp({ id: 1, is_active: 1 }) };
  const res = mockRes();
  const next = jest.fn();
  requireRole('officer', 'admin')(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('requireRole allows users with an allowed role', () => {
  const req = { session: { user: { id: 1, role: 'officer' } }, app: mockApp({ id: 1, is_active: 1 }) };
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
