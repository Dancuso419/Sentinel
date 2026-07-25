const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const reports = db.prepare(`
    SELECT case_id, type, location, status, resolution_note, created_at, updated_at, unseen_status_change
    FROM reports WHERE citizen_id = ? ORDER BY created_at DESC
  `).all(req.session.user.id);

  db.prepare('UPDATE reports SET unseen_status_change = 0 WHERE citizen_id = ?').run(req.session.user.id);
  res.json({ reports });
});

router.get('/:case_id', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare(`
    SELECT case_id, type, status, resolution_note, created_at, updated_at
    FROM reports WHERE case_id = ?
  `).get(req.params.case_id);

  if (!report) return res.status(404).json({ error: 'Case not found' });
  res.json(report);
});

module.exports = router;
