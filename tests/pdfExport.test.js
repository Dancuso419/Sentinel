const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { createDb } = require('../database/db');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.locals.db = createDb(':memory:');
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/reports', require('../routes/reports'));
  app.use('/api/officer', require('../routes/officer'));
  app.use('/api/cases', require('../routes/cases'));
  return app;
}

async function registerAndLogin(agent, overrides = {}) {
  const user = { name: 'User', email: 'user@example.com', password: 'secret123', role: 'citizen', ...overrides };
  await agent.post('/api/auth/register').send(user);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

test('officer can export a case summary PDF', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.get(`/api/officer/reports/${caseId}/pdf`);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('application/pdf');
});

test('citizen can export their own case summary PDF', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await citizen.get(`/api/cases/${caseId}/pdf`);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('application/pdf');
});

test('unauthenticated request to citizen pdf export is rejected', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await request(app).get(`/api/cases/${caseId}/pdf`);
  expect(res.status).toBe(401);
});

test('citizen cannot export a case they do not own (404, not 403)', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const other = request.agent(app);
  await registerAndLogin(other, { email: 'other@example.com' });

  const res = await other.get(`/api/cases/${caseId}/pdf`);
  expect(res.status).toBe(404);
});

test('exporting a nonexistent case returns 404 for both officer and citizen routes', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer2@example.com', role: 'officer' });
  const resOfficer = await officer.get('/api/officer/reports/CR-2026-9999/pdf');
  expect(resOfficer.status).toBe(404);

  const citizen = request.agent(app);
  await registerAndLogin(citizen, { email: 'citizen2@example.com' });
  const resCitizen = await citizen.get('/api/cases/CR-2026-9999/pdf');
  expect(resCitizen.status).toBe(404);
});

test('/:case_id/pdf route is not swallowed by the /:case_id route', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await citizen.get(`/api/cases/${caseId}/pdf`);
  expect(res.headers['content-type']).toBe('application/pdf');
  expect(res.headers['content-type']).not.toBe('application/json; charset=utf-8');
});
