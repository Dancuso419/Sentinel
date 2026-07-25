const request = require('supertest');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createDb } = require('../database/db');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.locals.db = createDb(':memory:');
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/reports', require('../routes/reports'));
  return app;
}

async function registerAndLogin(agent, overrides = {}) {
  const user = { name: 'Ada', email: 'ada@example.com', password: 'secret123', role: 'citizen', ...overrides };
  await agent.post('/api/auth/register').send(user);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

test('registered citizen submits a report and receives a case ID', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const res = await agent.post('/api/reports')
    .field('type', 'Theft')
    .field('location', 'Main Market, Aba')
    .field('description', 'Phone stolen at the market')
    .field('incident_time', '2026-07-20T10:00')
    .field('is_anonymous', 'false');

  expect(res.status).toBe(201);
  expect(res.body.case_id).toMatch(/^CR-\d{4}-\d{4}$/);
});

test('citizen report requires auth', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/reports').field('type', 'Theft');
  expect(res.status).toBe(401);
});

test('citizen report rejects missing required fields', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const res = await agent.post('/api/reports').field('type', 'Theft');
  expect(res.status).toBe(400);
});

test('walk-in report requires no auth and stores no citizen_id', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/reports/walkin')
    .field('type', 'Assault')
    .field('location', 'Bank Road')
    .field('description', 'Witnessed an assault')
    .field('incident_time', '2026-07-21T14:00');

  expect(res.status).toBe(201);
  const db = app.locals.db;
  const row = db.prepare('SELECT citizen_id, is_anonymous FROM reports WHERE case_id = ?').get(res.body.case_id);
  expect(row.citizen_id).toBeNull();
  expect(row.is_anonymous).toBe(1);
});

test('rejects evidence file over 5MB', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const bigFile = path.join(os.tmpdir(), 'big-evidence.png');
  fs.writeFileSync(bigFile, Buffer.alloc(5 * 1024 * 1024 + 1));

  const res = await agent.post('/api/reports')
    .field('type', 'Theft')
    .field('location', 'Main Market')
    .field('description', 'desc')
    .field('incident_time', '2026-07-20T10:00')
    .attach('evidence', bigFile);

  expect(res.status).toBe(400);
  fs.unlinkSync(bigFile);
});
