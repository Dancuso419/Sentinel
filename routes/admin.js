const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/analytics', (req, res) => {
  const db = req.app.locals.db;
  const byType = db.prepare('SELECT type, COUNT(*) AS count FROM reports GROUP BY type').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status').all();
  const byDate = db.prepare(`
    SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
    FROM reports GROUP BY date ORDER BY date
  `).all();
  res.json({ byType, byStatus, byDate });
});

router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare("SELECT id, name, email, role, is_active FROM users WHERE role = 'officer'").all();
  res.json({ users });
});

router.patch('/users/:id/active', (req, res) => {
  const { is_active } = req.body;
  const db = req.app.locals.db;
  const result = db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

module.exports = router;
