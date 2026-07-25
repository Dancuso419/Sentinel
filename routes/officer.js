const express = require('express');
const path = require('path');
const { requireRole } = require('../middleware/auth');
const { streamCaseSummary } = require('../lib/casePdf');

const router = express.Router();
const WORKFLOW = ['pending', 'investigating', 'resolved'];
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

router.use(requireRole('officer', 'admin'));

router.get('/reports', (req, res) => {
  try {
    const { status, type, from, to } = req.query;
    const db = req.app.locals.db;

    let sql = `
      SELECT r.id, r.case_id, r.is_anonymous, r.type, r.location, r.description,
             r.incident_time, r.status, r.resolution_note, r.evidence_path, r.created_at, r.updated_at,
             u.name AS citizen_name
      FROM reports r
      LEFT JOIN users u ON u.id = r.citizen_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    if (type) { sql += ' AND r.type = ?'; params.push(type); }
    if (from) { sql += ' AND r.incident_time >= ?'; params.push(from); }
    if (to) { sql += ' AND r.incident_time <= ?'; params.push(to); }
    sql += ' ORDER BY r.created_at DESC';

    const rows = db.prepare(sql).all(...params);
    const reports = rows.map((r) => {
      if (r.is_anonymous) delete r.citizen_name;
      return r;
    });
    res.json({ reports });
  } catch (err) {
    console.error('GET /api/officer/reports failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/reports/:case_id/status', (req, res) => {
  try {
    const { status, resolution_note } = req.body || {};
    if (!WORKFLOW.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (resolution_note !== undefined && resolution_note !== null && typeof resolution_note !== 'string') {
      return res.status(400).json({ error: 'resolution_note must be a string' });
    }

    const db = req.app.locals.db;
    const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
    if (!report) return res.status(404).json({ error: 'Case not found' });

    const currentIdx = WORKFLOW.indexOf(report.status);
    const nextIdx = WORKFLOW.indexOf(status);
    if (nextIdx < currentIdx) return res.status(409).json({ error: 'Cannot move status backward' });

    // Treat a non-empty resolution_note as an actual update request; blank/undefined/null
    // means "leave the existing note alone" (matches the COALESCE behavior below).
    const noteProvided = typeof resolution_note === 'string' && resolution_note.trim() !== '';
    const effectiveNote = noteProvided ? resolution_note : report.resolution_note;

    // Only block on a missing note when this would actually put the case into 'resolved'
    // without one ever having been recorded — a same-status resubmission that keeps (or
    // updates) an already-present note must not spuriously 400.
    if (status === 'resolved' && !effectiveNote?.trim()) {
      return res.status(400).json({ error: 'Resolution note is required to resolve a case' });
    }

    // No-op resubmission of the current status: don't write a duplicate status_history
    // row or re-flag unseen_status_change. Still persist a genuinely changed
    // resolution_note though — the dashboard always submits both fields together, so
    // dropping the note here would silently discard officer edits.
    if (status === report.status) {
      if (noteProvided && resolution_note !== report.resolution_note) {
        db.prepare(`
          UPDATE reports SET resolution_note = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(resolution_note, report.id);
      }
      return res.json({ ok: true });
    }

    db.prepare(`
      UPDATE reports SET status = ?, resolution_note = COALESCE(?, resolution_note),
        unseen_status_change = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, resolution_note || null, report.id);

    db.prepare('INSERT INTO status_history (report_id, status, updated_by) VALUES (?, ?, ?)')
      .run(report.id, status, String(req.session.user.id));

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/officer/reports/:case_id/status failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/reports/:case_id/pdf', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  streamCaseSummary(res, report);
});

router.get('/reports/:case_id/evidence', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  if (!report.evidence_path) return res.status(404).json({ error: 'No evidence file for this case' });

  const filePath = path.join(UPLOADS_DIR, report.evidence_path);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Evidence file not found' });
  });
});

router.get('/reports/:case_id/history', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });

  const history = db.prepare(`
    SELECT status, updated_by, updated_at FROM status_history
    WHERE report_id = ? ORDER BY id ASC
  `).all(report.id);

  res.json({ history });
});

module.exports = router;
