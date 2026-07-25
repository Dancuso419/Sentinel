const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('node:fs');
const { requireAuth } = require('../middleware/auth');
const { requireFields, isAllowedEvidenceFile, MAX_EVIDENCE_BYTES } = require('../lib/validators');
const { nextCaseId } = require('../lib/caseId');

const router = express.Router();
const REQUIRED = ['type', 'location', 'description', 'incident_time'];

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: MAX_EVIDENCE_BYTES }
}).single('evidence');

function deleteUploadedFile(req) {
  if (req.file) {
    fs.unlink(req.file.path, () => {});
  }
}

function handleUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Evidence file too large (max 5MB)' });
    if (req.file && !isAllowedEvidenceFile(req.file.mimetype, req.file.size)) {
      deleteUploadedFile(req);
      return res.status(400).json({ error: 'Evidence must be jpg, png, or pdf, max 5MB' });
    }
    next();
  });
}

function insertReport(db, { citizen_id, is_anonymous, type, location, description, incident_time, evidence_path }) {
  const year = new Date().getFullYear();
  const case_id = nextCaseId(db, year);
  db.prepare(`
    INSERT INTO reports (case_id, citizen_id, is_anonymous, type, location, description, incident_time, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(case_id, citizen_id, is_anonymous ? 1 : 0, type, location, description, incident_time, evidence_path || null);

  const reportId = db.prepare('SELECT id FROM reports WHERE case_id = ?').get(case_id).id;
  db.prepare('INSERT INTO status_history (report_id, status, updated_by) VALUES (?, ?, ?)')
    .run(reportId, 'pending', citizen_id ? String(citizen_id) : 'system');

  return case_id;
}

router.post('/', requireAuth, handleUpload, (req, res) => {
  const { type, location, description, incident_time, is_anonymous } = req.body;
  const missing = requireFields({ type, location, description, incident_time }, REQUIRED);
  if (missing.length) {
    deleteUploadedFile(req);
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  }

  const db = req.app.locals.db;
  const case_id = insertReport(db, {
    citizen_id: req.session.user.id,
    is_anonymous: is_anonymous === 'true' || is_anonymous === true,
    type, location, description, incident_time,
    evidence_path: req.file ? req.file.filename : null
  });

  res.status(201).json({ case_id });
});

router.post('/walkin', handleUpload, (req, res) => {
  const { type, location, description, incident_time } = req.body;
  const missing = requireFields({ type, location, description, incident_time }, REQUIRED);
  if (missing.length) {
    deleteUploadedFile(req);
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  }

  const db = req.app.locals.db;
  const case_id = insertReport(db, {
    citizen_id: null,
    is_anonymous: true,
    type, location, description, incident_time,
    evidence_path: req.file ? req.file.filename : null
  });

  res.status(201).json({ case_id });
});

function loadOwnedPendingReport(req, res, next) {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  if (report.citizen_id !== req.session.user.id) return res.status(403).json({ error: 'Not your report' });
  if (report.status !== 'pending') return res.status(409).json({ error: 'Report is locked once status has moved past pending' });
  req.report = report;
  next();
}

router.put('/:case_id', requireAuth, loadOwnedPendingReport, (req, res) => {
  const { type, location, description, incident_time } = req.body;
  const db = req.app.locals.db;
  db.prepare(`
    UPDATE reports SET
      type = COALESCE(?, type),
      location = COALESCE(?, location),
      description = COALESCE(?, description),
      incident_time = COALESCE(?, incident_time),
      updated_at = datetime('now')
    WHERE case_id = ?
  `).run(type || null, location || null, description || null, incident_time || null, req.params.case_id);

  res.json({ ok: true });
});

router.delete('/:case_id', requireAuth, loadOwnedPendingReport, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM status_history WHERE report_id = ?').run(req.report.id);
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.report.id);
  res.json({ ok: true });
});

module.exports = router;
