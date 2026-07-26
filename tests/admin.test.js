const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { createDb } = require('../database/db');
const { registerAndLogin } = require('./helpers');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.locals.db = createDb(':memory:');
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/reports', require('../routes/reports'));
  app.use('/api/admin', require('../routes/admin'));
  return app;
}

test('officer cannot access admin routes', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent, { email: 'officer@example.com', role: 'officer' });
  const res = await agent.get('/api/admin/analytics');
  expect(res.status).toBe(403);
});

test('analytics returns counts by type and status', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Bank Rd')
    .field('description', 'Wallet stolen').field('incident_time', '2026-07-21T10:00');

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const res = await admin.get('/api/admin/analytics');
  expect(res.status).toBe(200);
  expect(res.body.byType).toEqual(expect.arrayContaining([{ type: 'Theft', count: 2 }]));
  expect(res.body.byStatus).toEqual(expect.arrayContaining([{ status: 'pending', count: 2 }]));
});

test('admin can deactivate an officer account', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const db = app.locals.db;
  const officerId = db.prepare("SELECT id FROM users WHERE email = 'officer@example.com'").get().id;

  const res = await admin.patch(`/api/admin/users/${officerId}/active`).send({ is_active: false });
  expect(res.status).toBe(200);

  const row = db.prepare('SELECT is_active FROM users WHERE id = ?').get(officerId);
  expect(row.is_active).toBe(0);
});

test('admin cannot deactivate a citizen account', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const db = app.locals.db;
  const citizenId = db.prepare("SELECT id FROM users WHERE email = 'user@example.com'").get().id;

  const res = await admin.patch(`/api/admin/users/${citizenId}/active`).send({ is_active: false });
  expect(res.status).toBe(404);

  const row = db.prepare('SELECT is_active FROM users WHERE id = ?').get(citizenId);
  expect(row.is_active).toBe(1);
});

test('admin cannot deactivate another admin account', async () => {
  const app = buildApp();
  const admin1 = request.agent(app);
  await registerAndLogin(app, admin1, { email: 'admin1@example.com', role: 'admin' });
  const admin2 = request.agent(app);
  await registerAndLogin(app, admin2, { email: 'admin2@example.com', role: 'admin' });

  const db = app.locals.db;
  const admin2Id = db.prepare("SELECT id FROM users WHERE email = 'admin2@example.com'").get().id;

  const res = await admin1.patch(`/api/admin/users/${admin2Id}/active`).send({ is_active: false });
  expect(res.status).toBe(404);
});

test('overview counts officers, citizens and reports', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const res = await admin.get('/api/admin/overview');
  expect(res.status).toBe(200);
  expect(res.body.officers).toEqual({ total: 1, active: 1 });
  expect(res.body.citizens).toEqual({ total: 1, active: 1 });
  expect(res.body.reports).toBe(1);
  expect(res.body.types).toBe(1);
});

test('overview active counts follow deactivation', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const db = app.locals.db;
  const officerId = db.prepare("SELECT id FROM users WHERE email = 'officer@example.com'").get().id;
  await admin.patch(`/api/admin/users/${officerId}/active`).send({ is_active: false });

  const res = await admin.get('/api/admin/overview');
  expect(res.body.officers).toEqual({ total: 1, active: 0 });
});

test('users roster can list citizens and never exposes report counts', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00')
    .field('is_anonymous', 'true');

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const res = await admin.get('/api/admin/users?role=citizen');
  expect(res.status).toBe(200);
  expect(res.body.users).toHaveLength(1);
  expect(res.body.users[0].email).toBe('user@example.com');
  expect(res.body.users[0].password_hash).toBeUndefined();

  // Linking a citizen to a report count here would let an admin correlate an
  // anonymous report back to a person. No key on the roster may imply reports.
  const keys = Object.keys(res.body.users[0]);
  expect(keys).toEqual(['id', 'name', 'email', 'role', 'is_active', 'created_at']);
});

test('users roster defaults to officers and rejects any other role', async () => {
  const app = buildApp();
  await registerAndLogin(app, request.agent(app), { email: 'officer@example.com', role: 'officer' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const dflt = await admin.get('/api/admin/users');
  expect(dflt.body.users.every(u => u.role === 'officer')).toBe(true);

  // No admin roster: this route must not enumerate the accounts that can use it.
  const bad = await admin.get('/api/admin/users?role=admin');
  expect(bad.status).toBe(400);
});

test('admin creates an officer account that can then log in', async () => {
  const app = buildApp();
  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const created = await admin.post('/api/admin/users')
    .send({ name: 'Officer Nwosu', email: 'nwosu@example.com', password: 'Passw0rd!' });
  expect(created.status).toBe(201);
  expect(created.body.user.role).toBe('officer');

  const roster = await admin.get('/api/admin/users?role=officer');
  expect(roster.body.users.map(u => u.email)).toContain('nwosu@example.com');

  const officer = request.agent(app);
  const login = await officer.post('/api/auth/login')
    .send({ email: 'nwosu@example.com', password: 'Passw0rd!' });
  expect(login.status).toBe(200);
  expect(login.body.user.role).toBe('officer');
});

test('officer creation hard-codes the role and cannot be escalated', async () => {
  const app = buildApp();
  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  // A role in the body must be ignored, not honoured.
  const res = await admin.post('/api/admin/users')
    .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Passw0rd!', role: 'admin' });
  expect(res.status).toBe(201);
  expect(res.body.user.role).toBe('officer');

  const db = app.locals.db;
  expect(db.prepare("SELECT role FROM users WHERE email = 'sneaky@example.com'").get().role).toBe('officer');
});

test('officer creation rejects duplicates, bad email and short passwords', async () => {
  const app = buildApp();
  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  await admin.post('/api/admin/users')
    .send({ name: 'Officer Bello', email: 'bello@example.com', password: 'Passw0rd!' });

  const dupe = await admin.post('/api/admin/users')
    .send({ name: 'Someone Else', email: 'bello@example.com', password: 'Passw0rd!' });
  expect(dupe.status).toBe(409);

  const badEmail = await admin.post('/api/admin/users')
    .send({ name: 'Nope', email: 'not-an-email', password: 'Passw0rd!' });
  expect(badEmail.status).toBe(400);

  const shortPw = await admin.post('/api/admin/users')
    .send({ name: 'Nope', email: 'fresh@example.com', password: 'short' });
  expect(shortPw.status).toBe(400);
});

test('non-admins cannot create officer accounts', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.post('/api/admin/users')
    .send({ name: 'Mine', email: 'mine@example.com', password: 'Passw0rd!' });
  expect(res.status).toBe(403);
});

test('rejects non-boolean is_active', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const db = app.locals.db;
  const officerId = db.prepare("SELECT id FROM users WHERE email = 'officer@example.com'").get().id;

  const res = await admin.patch(`/api/admin/users/${officerId}/active`).send({ is_active: 'yes' });
  expect(res.status).toBe(400);
});

test('an admin-created officer must set their own password before the account works', async () => {
  const app = buildApp();
  // This suite mounts only auth + reports + admin, so build a full app to exercise
  // the middleware the way server.js wires it.
  const full = express();
  full.use(express.json());
  full.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  full.locals.db = app.locals.db;
  full.use('/api/auth', require('../routes/auth'));
  full.use(require('../middleware/auth').enforcePasswordChange);
  full.use('/api/officer', require('../routes/officer'));
  full.use('/api/admin', require('../routes/admin'));

  const admin = request.agent(full);
  await registerAndLogin(full, admin, { email: 'admin@example.com', role: 'admin' });
  await admin.post('/api/admin/users')
    .send({ name: 'Officer New', email: 'new@example.com', password: 'Handed0ver!' });

  const officer = request.agent(full);
  const login = await officer.post('/api/auth/login')
    .send({ email: 'new@example.com', password: 'Handed0ver!' });
  expect(login.status).toBe(200);
  expect(login.body.user.must_change_password).toBe(true);

  // Signed in, but the account does nothing until the password is replaced.
  const blocked = await officer.get('/api/officer/reports');
  expect(blocked.status).toBe(403);
  expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

  // The three things they must still be able to do all work.
  expect((await officer.get('/api/auth/me')).status).toBe(200);
  expect((await officer.get('/api/auth/me')).body.user.must_change_password).toBe(true);

  const changed = await officer.patch('/api/auth/password')
    .send({ current_password: 'Handed0ver!', new_password: 'MyOwnPassw0rd' });
  expect(changed.status).toBe(200);

  // Unblocked, with no re-login needed.
  expect((await officer.get('/api/officer/reports')).status).toBe(200);
  expect((await officer.get('/api/auth/me')).body.user.must_change_password).toBe(false);
});

test('a self-registered citizen is never forced to change password', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  const login = await registerAndLogin(app, citizen);
  expect(login.body.user.must_change_password).toBe(false);
});
