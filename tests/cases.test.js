// tests/cases.test.js
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
  app.use('/api/cases', require('../routes/cases'));
  return app;
}

test('public case lookup returns status without citizen identity', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await request(app).get(`/api/cases/${caseId}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('pending');
  expect(res.body.citizen_id).toBeUndefined();
  expect(res.body.citizen_name).toBeUndefined();
});

test('public case lookup 404s for unknown case ID', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/cases/CR-2026-9999');
  expect(res.status).toBe(404);
});

test('citizen dashboard lists only their own reports', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent);
  await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');

  const other = request.agent(app);
  await registerAndLogin(app, other, { email: 'other@example.com' });
  await other.post('/api/reports')
    .field('type', 'Vandalism').field('location', 'School Gate')
    .field('description', 'Fence damaged').field('incident_time', '2026-07-21T08:00');

  const res = await agent.get('/api/cases/mine');
  expect(res.status).toBe(200);
  expect(res.body.reports).toHaveLength(1);
  expect(res.body.reports[0].type).toBe('Theft');
  expect(res.body.reports[0].description).toBe('Phone stolen');
  expect(res.body.reports[0].incident_time).toBe('2026-07-20T10:00');
});

test('citizen can view and download their own evidence file', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent);

  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const evidenceFile = path.join(os.tmpdir(), 'cases-evidence.png');
  fs.writeFileSync(evidenceFile, Buffer.alloc(1024));

  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00')
    .attach('evidence', evidenceFile);
  fs.unlinkSync(evidenceFile);
  const caseId = create.body.case_id;

  const res = await agent.get(`/api/cases/${caseId}/evidence`);
  expect(res.status).toBe(200);
});

test('evidence route 404s when no evidence was uploaded', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await agent.get(`/api/cases/${caseId}/evidence`);
  expect(res.status).toBe(404);
});

test('non-owner cannot fetch another citizen\'s evidence', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const other = request.agent(app);
  await registerAndLogin(app, other, { email: 'other@example.com' });
  const res = await other.get(`/api/cases/${caseId}/evidence`);
  expect(res.status).toBe(404);
});
