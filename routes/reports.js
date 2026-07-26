const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('node:fs');
const { requireAuth } = require('../middleware/auth');
const { requireFields, isAllowedEvidenceFile, isNonEmptyString, MAX_EVIDENCE_BYTES } = require('../lib/validators');
const { nextCaseId } = require('../lib/caseId');
const { recordEvent, ACTOR_WALKIN } = require('../lib/caseTrail');

const router = express.Router();
const REQUIRED = ['type', 'location', 'description', 'incident_time'];
const EDITABLE_FIELDS = ['type', 'location', 'description', 'incident_time'];
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_EVIDENCE_BYTES }
}).single('evidence');

function deleteUploadedFile(req) {
  if (req.file) {
    fs.unlink(req.file.path, () => {});
  }
}

function deleteEvidenceByFilename(filename) {
  if (!filename) return;
  fs.unlink(path.join(UPLOADS_DIR, filename), () => {});
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

const RELATIONSHIPS = ['affected', 'witness'];

function insertReport(db, {
  citizen_id, is_anonymous, type, location, description, incident_time, evidence_path,
  reporter_relationship
}) {
  const year = new Date().getFullYear();
  const case_id = nextCaseId(db, year);

  // Unrecognised or absent values store NULL rather than guessing. A wrong guess
  // here would misrepresent how much the reporter's later confirmation is worth.
  const relationship = RELATIONSHIPS.includes(reporter_relationship) ? reporter_relationship : null;

  db.prepare(`
    INSERT INTO reports (case_id, citizen_id, is_anonymous, type, location, description,
                         incident_time, evidence_path, reporter_relationship)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(case_id, citizen_id, is_anonymous ? 1 : 0, type, location, description,
    incident_time, evidence_path || null, relationship);

  const reportId = db.prepare('SELECT id FROM reports WHERE case_id = ?').get(case_id).id;
  recordEvent(db, {
    reportId,
    status: 'pending',
    event: 'status',
    actor: citizen_id ? citizen_id : ACTOR_WALKIN
  });

  return case_id;
}

router.post('/', requireAuth, handleUpload, (req, res) => {
  try {
    const { type, location, description, incident_time, is_anonymous, reporter_relationship } = req.body || {};
    const missing = requireFields({ type, location, description, incident_time }, REQUIRED);
    if (missing.length) {
      deleteUploadedFile(req);
      return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    }
    if (![type, location, description, incident_time].every(isNonEmptyString)) {
      deleteUploadedFile(req);
      return res.status(400).json({ error: 'type, location, description, and incident_time must be non-empty strings' });
    }

    const db = req.app.locals.db;
    const case_id = insertReport(db, {
      citizen_id: req.session.user.id,
      is_anonymous: is_anonymous === 'true' || is_anonymous === true,
      type, location, description, incident_time, reporter_relationship,
      evidence_path: req.file ? req.file.filename : null
    });

    res.status(201).json({ case_id });
  } catch (err) {
    deleteUploadedFile(req);
    console.error('POST /api/reports failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/walkin', handleUpload, (req, res) => {
  try {
    const { type, location, description, incident_time, reporter_relationship } = req.body || {};
    const missing = requireFields({ type, location, description, incident_time }, REQUIRED);
    if (missing.length) {
      deleteUploadedFile(req);
      return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    }
    if (![type, location, description, incident_time].every(isNonEmptyString)) {
      deleteUploadedFile(req);
      return res.status(400).json({ error: 'type, location, description, and incident_time must be non-empty strings' });
    }

    const db = req.app.locals.db;
    const case_id = insertReport(db, {
      citizen_id: null,
      is_anonymous: true,
      type, location, description, incident_time, reporter_relationship,
      evidence_path: req.file ? req.file.filename : null
    });

    res.status(201).json({ case_id });
  } catch (err) {
    deleteUploadedFile(req);
    console.error('POST /api/reports/walkin failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function loadOwnedPendingReport(req, res, next) {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  if (report.citizen_id !== req.session.user.id) return res.status(404).json({ error: 'Case not found' });
  if (report.status !== 'pending') return res.status(409).json({ error: 'Report is locked once status has moved past pending' });
  req.report = report;
  next();
}

router.put('/:case_id', requireAuth, loadOwnedPendingReport, (req, res) => {
  try {
    const body = req.body || {};
    const invalid = EDITABLE_FIELDS.filter((f) => body[f] !== undefined && !isNonEmptyString(body[f]));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid fields: ${invalid.join(', ')}` });
    }

    const { type, location, description, incident_time } = body;
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
  } catch (err) {
    console.error('PUT /api/reports/:case_id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:case_id', requireAuth, loadOwnedPendingReport, (req, res) => {
  try {
    const db = req.app.locals.db;
    db.prepare('DELETE FROM status_history WHERE report_id = ?').run(req.report.id);
    db.prepare('DELETE FROM reports WHERE id = ?').run(req.report.id);
    deleteEvidenceByFilename(req.report.evidence_path);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/reports/:case_id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
