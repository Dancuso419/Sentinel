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

module.exports = { requireAuth, requireRole };
