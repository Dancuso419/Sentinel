const express = require('express');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { streamCaseSummary } = require('../lib/casePdf');
const { recordEvent, handlingOfficer, ACTOR_REPORTER } = require('../lib/caseTrail');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Shared by the public walk-in route below and the signed-in owner route, so the
// two paths can never record a verdict differently.
function recordVerdict(db, report, verdict, note) {
  const trimmed = typeof note === 'string' && note.trim() !== '' ? note.trim() : null;
  db.prepare(`
    UPDATE reports
    SET reporter_verdict = ?, reporter_verdict_note = ?,
        reporter_verdict_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(verdict, trimmed, report.id);

  recordEvent(db, {
    reportId: report.id,
    status: report.status,
    event: 'verdict',
    detail: trimmed ? `${verdict}: ${trimmed}` : verdict,
    actor: ACTOR_REPORTER
  });
}

router.get('/mine', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const reports = db.prepare(`
    SELECT id, case_id, type, location, description, incident_time, status, resolution_note,
           evidence_path, created_at, updated_at, unseen_status_change,
           reporter_relationship, reporter_verdict, reporter_verdict_note,
           reporter_verdict_at, reviewed_at
    FROM reports WHERE citizen_id = ? ORDER BY created_at DESC
  `).all(req.session.user.id);

  const withOfficer = reports.map(({ id, ...r }) => ({
    ...r,
    handled_by: handlingOfficer(db, id),
    can_verify: r.status === 'resolved' && !r.reporter_verdict
  }));

  db.prepare('UPDATE reports SET unseen_status_change = 0 WHERE citizen_id = ?').run(req.session.user.id);
  res.json({ reports: withOfficer });
});

// The signed-in owner's route to the same action the walk-in path exposes publicly.
// Ownership is proved by the session here, so no case-ID guessing gets near it.
router.post('/mine/:case_id/verify', requireAuth, (req, res) => {
  try {
    const { verdict, note } = req.body || {};
    if (verdict !== 'confirmed' && verdict !== 'disputed') {
      return res.status(400).json({ error: 'verdict must be "confirmed" or "disputed"' });
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be a string' });
    }

    const db = req.app.locals.db;
    const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
    // Same 404-not-403 collapse as everywhere else in this file.
    if (!report || report.citizen_id !== req.session.user.id) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (report.status !== 'resolved') {
      return res.status(409).json({ error: 'This case has not been resolved yet' });
    }
    if (report.reporter_verdict) {
      return res.status(409).json({ error: 'A response has already been recorded for this case' });
    }

    recordVerdict(db, report, verdict, note);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/cases/mine/:case_id/verify failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

// Public status lookup. The case ID is the credential — for a walk-in report it is
// the reporter's only one, so this must work with no session.
//
// It exposes the handling officer's name. That is a deliberate accountability
// decision: a reporter is entitled to know who holds their case. It does mean
// officer names are readable by anyone holding a case ID.
router.get('/:case_id', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare(`
    SELECT id, case_id, type, status, resolution_note, created_at, updated_at,
           reporter_relationship, reporter_verdict, reporter_verdict_at, reviewed_at
    FROM reports WHERE case_id = ?
  `).get(req.params.case_id);

  if (!report) return res.status(404).json({ error: 'Case not found' });

  const { id, ...publicFields } = report;
  res.json({
    ...publicFields,
    handled_by: handlingOfficer(db, id),
    // Whether this caller may record a verdict. A report filed from an account is
    // confirmed by its owner while signed in; only a walk-in, which has no account
    // to sign in to, is confirmable with the case ID alone.
    can_verify: report.status === 'resolved' && !report.reporter_verdict
  });
});

// The reporter's response to a resolution.
//
// Scoped hard: walk-in cases only. A report that belongs to an account is verified
// through the citizen dashboard while signed in, because case IDs are sequential and
// guessable — letting anyone holding a guessed ID dispute an identified citizen's
// case would be a write primitive handed to a stranger. For a walk-in there is no
// account to authenticate against, so the case ID is the only key that exists.
router.post('/:case_id/verify', (req, res) => {
  try {
    const { verdict, note } = req.body || {};
    if (verdict !== 'confirmed' && verdict !== 'disputed') {
      return res.status(400).json({ error: 'verdict must be "confirmed" or "disputed"' });
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be a string' });
    }

    const db = req.app.locals.db;
    const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
    if (!report) return res.status(404).json({ error: 'Case not found' });
    if (report.citizen_id !== null) {
      // 404, not 403 — consistent with the rest of this file, so a guessed ID never
      // reveals whether a case exists or who it belongs to.
      return res.status(404).json({ error: 'Case not found' });
    }
    if (report.status !== 'resolved') {
      return res.status(409).json({ error: 'This case has not been resolved yet' });
    }
    if (report.reporter_verdict) {
      return res.status(409).json({ error: 'A response has already been recorded for this case' });
    }

    recordVerdict(db, report, verdict, note);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/cases/:case_id/verify failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
