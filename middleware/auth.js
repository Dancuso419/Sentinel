function loadActiveSessionUser(req) {
  const sessionUser = req.session.user;
  if (!sessionUser) return null;
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(sessionUser.id);
  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    return null;
  }
  return sessionUser;
}

function requireAuth(req, res, next) {
  if (!loadActiveSessionUser(req)) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const sessionUser = loadActiveSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(sessionUser.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// Blocks an account that is still on a password somebody else chose.
//
// Mounted in server.js above every router except /api/auth and /api/stats, rather
// than left to the front end: a prompt the browser draws is bypassed by calling the
// API directly, so the account has to be genuinely unusable, not merely awkward.
//
// /api/auth stays reachable so the holder can read /me, change the password, and
// log out — the three things they must be able to do.
function enforcePasswordChange(req, res, next) {
  const sessionUser = req.session.user;
  // No session: let the route's own requireAuth decide. This middleware sits above
  // public routes too, and must not turn an anonymous request into a 403.
  if (!sessionUser) return next();

  const db = req.app.locals.db;
  const user = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(sessionUser.id);
  if (!user || !user.must_change_password) return next();

  res.status(403).json({
    error: 'Set your own password before using this account',
    code: 'PASSWORD_CHANGE_REQUIRED'
  });
}

module.exports = { requireAuth, requireRole, enforcePasswordChange };
