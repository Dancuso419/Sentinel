// tests/performance.test.js
// Officer standings. The behaviour under test is mostly about what the ranking
// REFUSES to reward: volume alone, and closures the reporter rejected.
const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { createDb } = require('../database/db');
const { registerAndLogin, createUserDirectly } = require('./helpers');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.locals.db = createDb(':memory:');
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/reports', require('../routes/reports'));
  app.use('/api/cases', require('../routes/cases'));
  app.use('/api/officer', require('../routes/officer'));
  return app;
}

async function walkIn(app) {
  const res = await request(app).post('/api/reports/walkin')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00')
    .field('reporter_relationship', 'affected');
  return res.body.case_id;
}

async function closeCase(app, agent, caseId, note = 'Resolved.') {
  await agent.patch(`/api/officer/reports/${caseId}/status`).send({ status: 'investigating' });
  await agent.patch(`/api/officer/reports/${caseId}/status`)
    .send({ status: 'resolved', resolution_note: note });
}

function find(body, name) {
  return body.officers.find((o) => o.name === name);
}

test('counts pickups, closures and outcomes per officer', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, {
    name: 'Officer Bello', email: 'bello@example.com', role: 'officer'
  });

  const a = await walkIn(app);
  const b = await walkIn(app);
  await closeCase(app, officer, a);
  await closeCase(app, officer, b);
  await request(app).post(`/api/cases/${a}/verify`).send({ verdict: 'confirmed' });
  await request(app).post(`/api/cases/${b}/verify`).send({ verdict: 'disputed' });

  const res = await officer.get('/api/officer/performance');
  expect(res.status).toBe(200);

  const bello = find(res.body, 'Officer Bello');
  expect(bello.picked_up).toBe(2);
  expect(bello.resolved).toBe(2);
  expect(bello.confirmed).toBe(1);
  expect(bello.disputed).toBe(1);
  expect(bello.score).toBe(1); // 2 resolved - 1 disputed
  expect(res.body.totals).toMatchObject({ resolved: 2, confirmed: 1, disputed: 1 });
});

test('volume alone does not outrank quality', async () => {
  const app = buildApp();
  const db = app.locals.db;

  // Sloppy closes four, two of which the reporter rejects  -> score 2
  const sloppy = request.agent(app);
  await registerAndLogin(app, sloppy, {
    name: 'Officer Sloppy', email: 'sloppy@example.com', role: 'officer'
  });
  for (let i = 0; i < 4; i += 1) {
    const c = await walkIn(app);
    await closeCase(app, sloppy, c);
    if (i < 2) await request(app).post(`/api/cases/${c}/verify`).send({ verdict: 'disputed' });
  }

  // Careful closes three, none rejected -> score 3, so ranks above Sloppy despite
  // having closed fewer cases. This is the whole point of the measure.
  const careful = request.agent(app);
  await registerAndLogin(app, careful, {
    name: 'Officer Careful', email: 'careful@example.com', role: 'officer'
  });
  for (let i = 0; i < 3; i += 1) {
    const c = await walkIn(app);
    await closeCase(app, careful, c);
    await request(app).post(`/api/cases/${c}/verify`).send({ verdict: 'confirmed' });
  }

  const res = await careful.get('/api/officer/performance');
  const careful_ = find(res.body, 'Officer Careful');
  const sloppy_ = find(res.body, 'Officer Sloppy');

  expect(sloppy_.resolved).toBeGreaterThan(careful_.resolved);
  expect(careful_.score).toBeGreaterThan(sloppy_.score);
  expect(careful_.rank).toBeLessThan(sloppy_.rank);
  expect(res.body.officers[0].name).toBe('Officer Careful');
  expect(db).toBeTruthy();
});

test('officers with no case work still appear, ranked null', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, {
    name: 'Officer Idle', email: 'idle@example.com', role: 'officer'
  });

  const res = await officer.get('/api/officer/performance');
  const idle = find(res.body, 'Officer Idle');
  expect(idle).toBeTruthy();
  expect(idle.rank).toBeNull();
  // Not zero: no closures means no average, and 0 would read as instant.
  expect(idle.avg_days_to_resolve).toBeNull();
});

test('an admin who has never worked a case is not on the officer board', async () => {
  const app = buildApp();
  const admin = request.agent(app);
  await registerAndLogin(app, admin, {
    name: 'Admin Grace', email: 'admin@example.com', role: 'admin'
  });

  const res = await admin.get('/api/officer/performance');
  expect(find(res.body, 'Admin Grace')).toBeUndefined();
});

test('a deactivated officer keeps the record of work already done', async () => {
  const app = buildApp();
  const db = app.locals.db;
  createUserDirectly(db, {
    name: 'Officer Gone', email: 'gone@example.com', password: 'secret123', role: 'officer'
  });

  const gone = request.agent(app);
  await gone.post('/api/auth/login').send({ email: 'gone@example.com', password: 'secret123' });
  const c = await walkIn(app);
  await closeCase(app, gone, c);

  db.prepare("UPDATE users SET is_active = 0 WHERE email = 'gone@example.com'").run();

  const admin = request.agent(app);
  await registerAndLogin(app, admin, { email: 'admin@example.com', role: 'admin' });
  const res = await admin.get('/api/officer/performance');

  const row = find(res.body, 'Officer Gone');
  expect(row.is_active).toBe(false);
  expect(row.resolved).toBe(1);
});

test('revised resolution notes are surfaced per officer', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(app, officer, {
    name: 'Officer Bello', email: 'bello@example.com', role: 'officer'
  });

  const c = await walkIn(app);
  await closeCase(app, officer, c, 'Suspect arrested.');
  await officer.patch(`/api/officer/reports/${c}/status`)
    .send({ status: 'resolved', resolution_note: 'No further action.' });

  const res = await officer.get('/api/officer/performance');
  expect(find(res.body, 'Officer Bello').note_revisions).toBe(1);
});

test('citizens cannot read officer standings', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(app, citizen);
  expect((await citizen.get('/api/officer/performance')).status).toBe(403);
  expect((await request(app).get('/api/officer/performance')).status).toBe(401);
});
