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

test('rejects wrong evidence file type and does not leave orphaned file on disk', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const beforeFiles = new Set(fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []);

  const badFile = path.join(os.tmpdir(), 'evidence.txt');
  fs.writeFileSync(badFile, 'not an allowed file type');

  const res = await agent.post('/api/reports')
    .field('type', 'Theft')
    .field('location', 'Main Market')
    .field('description', 'desc')
    .field('incident_time', '2026-07-20T10:00')
    .attach('evidence', badFile);

  expect(res.status).toBe(400);
  fs.unlinkSync(badFile);

  const afterFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  const newFiles = afterFiles.filter((f) => !beforeFiles.has(f));
  expect(newFiles).toHaveLength(0);
});

test('rejects valid evidence file when required fields are missing and does not leave orphaned file on disk', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const beforeFiles = new Set(fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []);

  const goodFile = path.join(os.tmpdir(), 'evidence-valid.png');
  fs.writeFileSync(goodFile, Buffer.alloc(1024));

  const res = await agent.post('/api/reports')
    .field('type', 'Theft')
    .attach('evidence', goodFile);

  expect(res.status).toBe(400);
  fs.unlinkSync(goodFile);

  const afterFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  const newFiles = afterFiles.filter((f) => !beforeFiles.has(f));
  expect(newFiles).toHaveLength(0);
});

test('owner can edit their own pending report', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const edit = await agent.put(`/api/reports/${caseId}`).send({ description: 'Updated: phone and wallet stolen' });
  expect(edit.status).toBe(200);

  const db = app.locals.db;
  const row = db.prepare('SELECT description FROM reports WHERE case_id = ?').get(caseId);
  expect(row.description).toBe('Updated: phone and wallet stolen');
});

test('cannot edit a report once status has moved past pending', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  app.locals.db.prepare("UPDATE reports SET status = 'investigating' WHERE case_id = ?").run(caseId);

  const edit = await agent.put(`/api/reports/${caseId}`).send({ description: 'trying to edit' });
  expect(edit.status).toBe(409);
});

test('non-owner cannot edit or withdraw a report', async () => {
  const app = buildApp();
  const ownerAgent = request.agent(app);
  await registerAndLogin(ownerAgent);
  const create = await ownerAgent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const otherAgent = request.agent(app);
  await registerAndLogin(otherAgent, { email: 'other@example.com' });
  const res = await otherAgent.delete(`/api/reports/${caseId}`);
  expect(res.status).toBe(403);
});

test('owner can withdraw (delete) their own pending report', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await agent.delete(`/api/reports/${caseId}`);
  expect(res.status).toBe(200);

  const row = app.locals.db.prepare('SELECT * FROM reports WHERE case_id = ?').get(caseId);
  expect(row).toBeUndefined();
});
