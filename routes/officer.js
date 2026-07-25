const express = require('express');
const { requireRole } = require('../middleware/auth');
const { streamCaseSummary } = require('../lib/casePdf');

const router = express.Router();
const WORKFLOW = ['pending', 'investigating', 'resolved'];

router.use(requireRole('officer', 'admin'));

router.get('/reports', (req, res) => {
  const { status, type, from, to } = req.query;
  const db = req.app.locals.db;

  let sql = `
    SELECT r.id, r.case_id, r.is_anonymous, r.type, r.location, r.description,
           r.incident_time, r.status, r.resolution_note, r.created_at, r.updated_at,
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
});

router.patch('/reports/:case_id/status', (req, res) => {
  const { status, resolution_note } = req.body;
  if (!WORKFLOW.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });

  const currentIdx = WORKFLOW.indexOf(report.status);
  const nextIdx = WORKFLOW.indexOf(status);
  if (nextIdx < currentIdx) return res.status(409).json({ error: 'Cannot move status backward' });
  if (status === 'resolved' && !resolution_note?.trim()) {
    return res.status(400).json({ error: 'Resolution note is required to resolve a case' });
  }

  db.prepare(`
    UPDATE reports SET status = ?, resolution_note = COALESCE(?, resolution_note),
      unseen_status_change = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, resolution_note || null, report.id);

  db.prepare('INSERT INTO status_history (report_id, status, updated_by) VALUES (?, ?, ?)')
    .run(report.id, status, String(req.session.user.id));

  res.json({ ok: true });
});

router.get('/reports/:case_id/pdf', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  streamCaseSummary(res, report);
});

module.exports = router;
