const express = require('express');
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { requireFields, isAllowedEvidenceFile, MAX_EVIDENCE_BYTES } = require('../lib/validators');
const { nextCaseId } = require('../lib/caseId');

const router = express.Router();
const REQUIRED = ['type', 'location', 'description', 'incident_time'];

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: MAX_EVIDENCE_BYTES }
}).single('evidence');

function handleUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Evidence file too large (max 5MB)' });
    if (req.file && !isAllowedEvidenceFile(req.file.mimetype, req.file.size)) {
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
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

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
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const db = req.app.locals.db;
  const case_id = insertReport(db, {
    citizen_id: null,
    is_anonymous: true,
    type, location, description, incident_time,
    evidence_path: req.file ? req.file.filename : null
  });

  res.status(201).json({ case_id });
});

module.exports = router;
