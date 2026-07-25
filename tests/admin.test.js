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
