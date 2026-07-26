const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const {
  isValidEmail, requireFields, isNonEmptyString, isAcceptablePassword, MIN_PASSWORD_LENGTH
} = require('../lib/validators');

const router = express.Router();
const SALT_ROUNDS = 10;

// Public registration only ever creates citizen accounts. Officer/admin accounts
// are provisioned out-of-band (database/seed.js, or directly by an admin against
// the DB) — there is no endpoint that lets a caller mint a privileged account.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const missing = requireFields({ name, email, password }, ['name', 'email', 'password']);
    if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'name, email, and password must be non-empty strings' });
    }
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (!isAcceptablePassword(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (role !== undefined && role !== 'citizen') {
      return res.status(400).json({ error: 'Public registration can only create citizen accounts' });
    }

    const db = req.app.locals.db;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(name, email, password_hash, 'citizen');

    res.status(201).json({ id: result.lastInsertRowid, name, email, role: 'citizen' });
  } catch (err) {
    console.error('POST /api/auth/register failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const missing = requireFields({ email, password }, ['email', 'password']);
    if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'email and password must be non-empty strings' });
    }

    const db = req.app.locals.db;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error('POST /api/auth/login failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Who am I? Every signed-in surface reads this to name the account in the rail —
// without it a user genuinely cannot tell which account they are in. requireAuth
// re-reads is_active, so a deactivated account gets 401 here just like anywhere else.
router.get('/me', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare(
    'SELECT id, name, email, role, created_at FROM users WHERE id = ?'
  ).get(req.session.user.id);

  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

// Changing your own password. Distinct from the "password reset" PRODUCT.md puts
// out of scope: that means forgot-password recovery by email, which needs a mail
// path this system does not have. This requires the current password, so it is
// only ever a signed-in user re-keying their own account.
router.patch('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    const missing = requireFields({ current_password, new_password }, ['current_password', 'new_password']);
    if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

    if (!isAcceptablePassword(new_password)) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = req.app.locals.db;
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.session.user.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(403).json({ error: 'Current password is incorrect' });

    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/auth/password failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
