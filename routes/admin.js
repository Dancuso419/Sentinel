const express = require('express');
const bcrypt = require('bcryptjs');
const { requireRole } = require('../middleware/auth');
const { recordEvent } = require('../lib/caseTrail');
const {
  isValidEmail, requireFields, isNonEmptyString, isAcceptablePassword, MIN_PASSWORD_LENGTH
} = require('../lib/validators');

const router = express.Router();
const SALT_ROUNDS = 10;
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

// Staffing and account totals. Separate from /analytics because that endpoint is
// about reports and this one is about people — the admin screen reads them as two
// different questions.
router.get('/overview', (req, res) => {
  try {
    const db = req.app.locals.db;

    const roleCounts = db.prepare(`
      SELECT role,
             COUNT(*) AS total,
             SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
      FROM users WHERE role IN ('officer', 'citizen') GROUP BY role
    `).all();

    const people = { officer: { total: 0, active: 0 }, citizen: { total: 0, active: 0 } };
    for (const row of roleCounts) {
      people[row.role] = { total: row.total, active: row.active };
    }

    const reports = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n;
    const types = db.prepare('SELECT COUNT(DISTINCT type) AS n FROM reports').get().n;

    res.json({
      officers: people.officer,
      citizens: people.citizen,
      reports,
      types
    });
  } catch (err) {
    console.error('GET /api/admin/overview failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Defaults to officers so existing callers are unaffected. Only officer and citizen
// rosters are exposed: there is no admin roster here, so this route can never be
// used to enumerate the accounts that could act on it.
//
// Deliberately no per-citizen report count. An admin can already read the whole
// queue through the officer routes, where anonymous reports have their identity
// stripped; a reports-filed count on this roster would let those two views be
// correlated back to a person. See PRODUCT.md principle 1.
// Resolved cases an admin has not yet signed off.
//
// This is the backstop that makes verification work for everyone. A reporter's
// confirmation is the better evidence — they are the only one who knows whether the
// harm was actually put right — but it is not always available: a walk-in reporter
// may never return, and a witness was never in a position to judge the outcome.
// Every resolved case passes through here regardless.
router.get('/reviews', (req, res) => {
  try {
    const db = req.app.locals.db;
    const pending = db.prepare(`
      SELECT case_id, type, location, status, resolution_note, updated_at,
             reporter_relationship, reporter_verdict, reporter_verdict_note, reporter_verdict_at
      FROM reports
      WHERE status = 'resolved' AND reviewed_at IS NULL
      ORDER BY updated_at ASC
    `).all();

    const disputed = db.prepare(`
      SELECT COUNT(*) AS n FROM reports
      WHERE reporter_verdict = 'disputed' AND reviewed_at IS NULL
    `).get().n;

    res.json({ pending, disputed });
  } catch (err) {
    console.error('GET /api/admin/reviews failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reviews/:case_id', (req, res) => {
  try {
    const { note } = req.body || {};
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be a string' });
    }

    const db = req.app.locals.db;
    const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
    if (!report) return res.status(404).json({ error: 'Case not found' });
    if (report.status !== 'resolved') {
      return res.status(409).json({ error: 'Only a resolved case can be signed off' });
    }
    if (report.reviewed_at) {
      return res.status(409).json({ error: 'This case has already been signed off' });
    }

    db.prepare(`
      UPDATE reports SET reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(req.session.user.id, report.id);

    recordEvent(db, {
      reportId: report.id,
      status: report.status,
      event: 'review',
      detail: typeof note === 'string' && note.trim() !== '' ? note.trim() : null,
      actor: req.session.user.id
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/admin/reviews/:case_id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', (req, res) => {
  try {
    const role = req.query.role || 'officer';
    if (role !== 'officer' && role !== 'citizen') {
      return res.status(400).json({ error: 'role must be officer or citizen' });
    }

    const db = req.app.locals.db;
    const users = db.prepare(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE role = ? ORDER BY name'
    ).all(role);

    res.json({ users });
  } catch (err) {
    console.error('GET /api/admin/users failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Provision an officer account. This is the only route in the system that can mint
// a privileged account, and it hard-codes the role: there is no role field in the
// request, so no request body can escalate past 'officer'. Public registration
// still refuses anything but 'citizen'.
router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const missing = requireFields({ name, email, password }, ['name', 'email', 'password']);
    if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    if (!isNonEmptyString(name)) return res.status(400).json({ error: 'Name must be a non-empty string' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (!isAcceptablePassword(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = req.app.locals.db;
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'That email already has an account' });
    }

    // must_change_password: the admin chose this password and has to communicate it
    // to the officer, so it is known to at least two people before first use. The
    // account cannot do anything until the officer replaces it.
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db.prepare(
      "INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, 'officer', 1)"
    ).run(name, email, password_hash);

    res.status(201).json({ user: { id: result.lastInsertRowid, name, email, role: 'officer' } });
  } catch (err) {
    console.error('POST /api/admin/users failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
