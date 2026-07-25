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
  app.use('/api/officer', require('../routes/officer'));
  return app;
}

test('non-officer cannot access officer routes', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(app, agent);
  const res = await agent.get('/api/officer/reports');
  expect(res.status).toBe(403);
});

test('officer lists reports and anonymous reports hide identity', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00')
    .field('is_anonymous', 'true');

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.get('/api/officer/reports');
  expect(res.status).toBe(200);
  expect(res.body.reports).toHaveLength(1);
  expect(res.body.reports[0].citizen_id).toBeUndefined();
  expect(res.body.reports[0].citizen_name).toBeUndefined();
});

test('officer filters reports by status', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.get('/api/officer/reports?status=investigating');
  expect(res.body.reports).toHaveLength(0);
});

test('officer updates status forward and logs history', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });
  expect(res.status).toBe(200);

  const db = app.locals.db;
  const history = db.prepare('SELECT * FROM status_history WHERE report_id = (SELECT id FROM reports WHERE case_id = ?) ORDER BY id').all(caseId);
  expect(history.map(h => h.status)).toEqual(['pending', 'investigating']);
});

test('rejects skipping backward in the status workflow', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'pending' });
  expect(res.status).toBe(409);
});

test('resolving requires a resolution note', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'resolved' });
  expect(res.status).toBe(400);
});

test('resubmitting the same status is a no-op and does not duplicate history', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  const db = app.locals.db;
  db.prepare('UPDATE reports SET unseen_status_change = 0 WHERE case_id = ?').run(caseId);

  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });
  expect(res.status).toBe(200);

  const history = db.prepare('SELECT * FROM status_history WHERE report_id = (SELECT id FROM reports WHERE case_id = ?) ORDER BY id').all(caseId);
  expect(history.map(h => h.status)).toEqual(['pending', 'investigating']);

  const row = db.prepare('SELECT unseen_status_change FROM reports WHERE case_id = ?').get(caseId);
  expect(row.unseen_status_change).toBe(0);
});

test('same-status resubmission with a changed resolution_note still persists the note', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  // Dashboard always submits status + resolution_note together. Officer edits only the
  // note here; the status is resubmitted unchanged.
  const res = await officer.patch(`/api/officer/reports/${caseId}/status`)
    .send({ status: 'investigating', resolution_note: 'Spoke to two witnesses near the market entrance.' });
  expect(res.status).toBe(200);

  const db = app.locals.db;
  const row = db.prepare('SELECT resolution_note FROM reports WHERE case_id = ?').get(caseId);
  expect(row.resolution_note).toBe('Spoke to two witnesses near the market entrance.');

  // Fetching via the officer list endpoint should reflect the persisted note too.
  const list = await officer.get('/api/officer/reports');
  const report = list.body.reports.find(r => r.case_id === caseId);
  expect(report.resolution_note).toBe('Spoke to two witnesses near the market entrance.');

  // A same-status note update must not spam the audit trail with a duplicate row.
  const history = db.prepare('SELECT * FROM status_history WHERE report_id = (SELECT id FROM reports WHERE case_id = ?) ORDER BY id').all(caseId);
  expect(history.map(h => h.status)).toEqual(['pending', 'investigating']);
});

test('same-status resubmission of resolved with an already-set note does not spuriously 400', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });
  await officer.patch(`/api/officer/reports/${caseId}/status`)
    .send({ status: 'resolved', resolution_note: 'Case closed, suspect apprehended.' });

  // Resubmit 'resolved' again without refilling the note field.
  const res = await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'resolved' });
  expect(res.status).toBe(200);

  const db = app.locals.db;
  const row = db.prepare('SELECT resolution_note FROM reports WHERE case_id = ?').get(caseId);
  expect(row.resolution_note).toBe('Case closed, suspect apprehended.');
});

test('officer can fetch the status-history audit trail for a report', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  const create = await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });

  const res = await officer.get(`/api/officer/reports/${caseId}/history`);
  expect(res.status).toBe(200);
  expect(res.body.history.map(h => h.status)).toEqual(['pending', 'investigating']);
});

test('history for an unknown case returns 404', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  const res = await officer.get('/api/officer/reports/CR-2026-9999/history');
  expect(res.status).toBe(404);
});
