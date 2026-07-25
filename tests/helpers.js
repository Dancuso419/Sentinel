// tests/helpers.js
// Shared test helpers. Officer/admin accounts can no longer be created through the
// public POST /api/auth/register endpoint (it only ever creates citizens), so tests
// that need an officer/admin account insert directly into the DB, mirroring the
// pattern used by database/seed.js.
const bcrypt = require('bcryptjs');

function createUserDirectly(db, { name, email, password, role, is_active = 1 }) {
  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, password_hash, role, is_active ? 1 : 0);
  return { id: result.lastInsertRowid, name, email, role };
}

// Registers (citizen) or directly inserts (officer/admin) a user, then logs in the agent.
async function registerAndLogin(app, agent, overrides = {}) {
  const user = { name: 'User', email: 'user@example.com', password: 'secret123', role: 'citizen', ...overrides };
  const db = app.locals.db;
  if (user.role === 'citizen') {
    await agent.post('/api/auth/register').send(user);
  } else {
    createUserDirectly(db, user);
  }
  return agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

module.exports = { createUserDirectly, registerAndLogin };
