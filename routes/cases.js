const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { streamCaseSummary } = require('../lib/casePdf');

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

// Registered before /:case_id so Express matches /:case_id/pdf here instead
// of treating "pdf" as a :case_id value on the route below.
router.get('/:case_id/pdf', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  // 404 (not 403) for non-owner, consistent with loadOwnedPendingReport in routes/reports.js:
  // avoids confirming a case ID exists to a user who doesn't own it.
  if (report.citizen_id !== req.session.user.id) return res.status(404).json({ error: 'Case not found' });
  streamCaseSummary(res, report);
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
