const express = require('express');
const bcrypt = require('bcryptjs');
const { isValidEmail, requireFields } = require('../lib/validators');

const router = express.Router();
const SALT_ROUNDS = 10;
const ALLOWED_ROLES = new Set(['citizen', 'officer', 'admin']);

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const missing = requireFields({ name, email, password, role }, ['name', 'email', 'password', 'role']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });

  const db = req.app.locals.db;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, password_hash, role);

  res.status(201).json({ id: result.lastInsertRowid, name, email, role });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const missing = requireFields({ email, password }, ['email', 'password']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
