const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/analytics', (req, res) => {
  try {
    const db = req.app.locals.db;
    const byType = db.prepare('SELECT type, COUNT(*) AS count FROM reports GROUP BY type').all();
    const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status').all();
    const byDate = db.prepare(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
      FROM reports GROUP BY date ORDER BY date
    `).all();
    res.json({ byType, byStatus, byDate });
  } catch (err) {
    console.error('GET /api/admin/analytics failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare("SELECT id, name, email, role, is_active FROM users WHERE role = 'officer'").all();
  res.json({ users });
});

router.patch('/users/:id/active', (req, res) => {
  try {
    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' });
    }

    const db = req.app.locals.db;
    // Only officer accounts can be deactivated/reactivated here — an admin should
    // not be able to disable a citizen or another admin through this route.
    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!target || target.role !== 'officer') {
      return res.status(404).json({ error: 'Officer not found' });
    }

    db.prepare("UPDATE users SET is_active = ? WHERE id = ? AND role = 'officer'")
      .run(is_active ? 1 : 0, req.params.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/users/:id/active failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
