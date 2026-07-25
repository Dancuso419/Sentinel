const express = require('express');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { streamCaseSummary } = require('../lib/casePdf');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

router.get('/mine', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const reports = db.prepare(`
    SELECT case_id, type, location, description, incident_time, status, resolution_note,
           evidence_path, created_at, updated_at, unseen_status_change
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

// Same 404-not-403 pattern as the PDF route above, and same reasoning: a non-owner
// gets 404 rather than 403 so a guessed case ID doesn't confirm the case's existence.
router.get('/:case_id/evidence', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  if (report.citizen_id !== req.session.user.id) return res.status(404).json({ error: 'Case not found' });
  if (!report.evidence_path) return res.status(404).json({ error: 'No evidence file for this case' });

  const filePath = path.join(UPLOADS_DIR, report.evidence_path);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Evidence file not found' });
  });
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
