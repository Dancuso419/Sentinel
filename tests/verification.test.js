// tests/verification.test.js
// The verification chain: officer claim -> reporter response -> admin sign-off.
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
  app.use('/api/officer', require('../routes/officer'));
  app.use('/api/admin', require('../routes/admin'));
  return app;
}

async function resolvedWalkIn(app, relationship = 'affected') {
  const create = await request(app).post('/api/reports/walkin')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00')
    .field('reporter_relationship', relationship);
  const caseId = create.body.case_id;

  const officer = request.agent(app);
  await registerAndLogin(app, officer, {
    name: 'Officer Bello', email: 'officer@example.com', role: 'officer'
  });
  await officer.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });
  await officer.patch(`/api/officer/reports/${caseId}/status`)
    .send({ status: 'resolved', resolution_note: 'Suspect identified.' });

  return { caseId, officer };
}

test('the handling officer is named on the public case lookup', async () => {
  const app = buildApp();
  const { caseId } = await resolvedWalkIn(app);

  const res = await request(app).get(`/api/cases/${caseId}`);
  expect(res.status).toBe(200);
  expect(res.body.handled_by).toBe('Officer Bello');
  // Still no reporter identity, and no internal row id, on a public payload.
  expect(res.body.citizen_id).toBeUndefined();
  expect(res.body.id).toBeUndefined();
});

test('a walk-in reporter can confirm a resolution with the case ID alone', async () => {
  const app = buildApp();
  const { caseId } = await resolvedWalkIn(app);

  const before = await request(app).get(`/api/cases/${caseId}`);
  expect(before.body.can_verify).toBe(true);

  const res = await request(app).post(`/api/cases/${caseId}/verify`)
    .send({ verdict: 'confirmed', note: 'Phone was returned.' });
  expect(res.status).toBe(200);

  const after = await request(app).get(`/api/cases/${caseId}`);
  expect(after.body.reporter_verdict).toBe('confirmed');
  expect(after.body.can_verify).toBe(false);

  // Recorded once and only once.
  const again = await request(app).post(`/api/cases/${caseId}/verify`).send({ verdict: 'disputed' });
  expect(again.status).toBe(409);
});

test('a case belonging to an account cannot be verified by case ID alone', async () => {
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
    .send({ status: 'resolved', resolution_note: 'Suspect identified.' });

  // Case IDs are sequential and guessable, so an owned case must not be writable
  // by anyone who happens to hold one. 404, never 403.
  const stranger = await request(app).post(`/api/cases/${caseId}/verify`).send({ verdict: 'disputed' });
  expect(stranger.status).toBe(404);

  // The owner, signed in, can.
  const owner = await citizen.post(`/api/cases/mine/${caseId}/verify`)
    .send({ verdict: 'disputed', note: 'Never contacted me.' });
  expect(owner.status).toBe(200);

  const mine = await citizen.get('/api/cases/mine');
  expect(mine.body.reports[0].reporter_verdict).toBe('disputed');
  expect(mine.body.reports[0].handled_by).toBeTruthy();
});

test('a case cannot be verified before it is resolved', async () => {
  const app = buildApp();
  const create = await request(app).post('/api/reports/walkin')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');

  const res = await request(app).post(`/api/cases/${create.body.case_id}/verify`)
    .send({ verdict: 'confirmed' });
  expect(res.status).toBe(409);
});

test('admin sign-off works even when the reporter never responds', async () => {
  const app = buildApp();
  // A witness reporter: not in a position to judge the outcome, and here they
  // never come back at all. Sign-off must not depend on them.
  const { caseId } = await resolvedWalkIn(app, 'witness');

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });

  const queue = await admin.get('/api/admin/reviews');
  expect(queue.status).toBe(200);
  expect(queue.body.pending.map(r => r.case_id)).toContain(caseId);
  expect(queue.body.pending[0].reporter_relationship).toBe('witness');
  expect(queue.body.pending[0].reporter_verdict).toBeNull();

  const signOff = await admin.post(`/api/admin/reviews/${caseId}`).send({ note: 'Checked the file.' });
  expect(signOff.status).toBe(200);

  const after = await admin.get('/api/admin/reviews');
  expect(after.body.pending.map(r => r.case_id)).not.toContain(caseId);

  // Signing off twice is refused.
  expect((await admin.post(`/api/admin/reviews/${caseId}`).send({})).status).toBe(409);
});

test('a disputed case is counted for the admin', async () => {
  const app = buildApp();
  const { caseId } = await resolvedWalkIn(app);
  await request(app).post(`/api/cases/${caseId}/verify`)
    .send({ verdict: 'disputed', note: 'Nothing was ever returned.' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });
  const queue = await admin.get('/api/admin/reviews');
  expect(queue.body.disputed).toBe(1);
});

test('the trail records the whole chain in order and names only staff', async () => {
  const app = buildApp();
  const { caseId, officer } = await resolvedWalkIn(app);
  await request(app).post(`/api/cases/${caseId}/verify`).send({ verdict: 'confirmed', note: 'All good.' });

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { name: 'Admin Grace', email: 'admin@example.com', role: 'admin' });
  await admin.post(`/api/admin/reviews/${caseId}`).send({});

  const res = await officer.get(`/api/officer/reports/${caseId}/history`);
  const events = res.body.history.map(h => h.event);
  expect(events).toEqual(['status', 'status', 'status', 'verdict', 'review']);

  const byEvent = Object.fromEntries(res.body.history.map(h => [h.event, h]));
  expect(byEvent.verdict.updated_by).toBe('The reporter');
  expect(byEvent.verdict.detail).toBe('confirmed: All good.');
  expect(byEvent.review.updated_by).toBe('Admin Grace (admin)');

  // A walk-in has no account, so the opening row is the submission itself.
  expect(res.body.history[0].updated_by).toBe('Walk-in submission');
});

test('non-admins cannot reach the review queue', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, { email: 'officer@example.com', role: 'officer' });
  expect((await officer.get('/api/admin/reviews')).status).toBe(403);
});
