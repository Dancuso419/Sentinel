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
  return app;
}

async function registerAndLogin(agent, overrides = {}) {
  const user = { name: 'User', email: 'user@example.com', password: 'secret123', role: 'citizen', ...overrides };
  await agent.post('/api/auth/register').send(user);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

test('non-officer cannot access officer routes', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const res = await agent.get('/api/officer/reports');
  expect(res.status).toBe(403);
});

test('officer lists reports and anonymous reports hide identity', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00')
    .field('is_anonymous', 'true');

  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.get('/api/officer/reports');
  expect(res.status).toBe(200);
  expect(res.body.reports).toHaveLength(1);
  expect(res.body.reports[0].citizen_id).toBeUndefined();
  expect(res.body.reports[0].citizen_name).toBeUndefined();
});

test('officer filters reports by status', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');

  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.get('/api/officer/reports?status=investigating');
  expect(res.body.reports).toHaveLength(0);
});

test('officer updates status forward and logs history', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });
  expect(res.status).toBe(200);

  const db = app.locals.db;
  const history = db.prepare('SELECT * FROM status_history WHERE report_id = (SELECT id FROM reports WHERE case_id = ?) ORDER BY id').all(caseId);
  expect(history.map(h => h.status)).toEqual(['pending', 'investigating']);
});

test('rejects skipping backward in the status workflow', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'pending' });
  expect(res.status).toBe(409);
});

test('resolving requires a resolution note', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'resolved' });
  expect(res.status).toBe(400);
});
