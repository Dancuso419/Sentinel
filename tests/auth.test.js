// tests/auth.test.js
const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { createDb } = require('../database/db');
const { createUserDirectly } = require('./helpers');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.locals.db = createDb(':memory:');
  app.use('/api/auth', require('../routes/auth'));
  return app;
}

test('registers a new citizen and rejects duplicate email', async () => {
  const app = buildApp();
  const res1 = await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'ada@example.com', password: 'secret123', role: 'citizen'
  });
  expect(res1.status).toBe(201);

  const res2 = await request(app).post('/api/auth/register').send({
    name: 'Ada 2', email: 'ada@example.com', password: 'other456', role: 'citizen'
  });
  expect(res2.status).toBe(409);
  expect(res2.body.error).toMatch(/email/i);
});

test('rejects register with missing fields', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({ name: 'Ada' });
  expect(res.status).toBe(400);
});

test('rejects self-registration as officer/admin and only ever creates a citizen', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    name: 'Wannabe Admin', email: 'wannabe@example.com', password: 'secret123', role: 'admin'
  });
  expect(res.status).toBe(400);

  const db = app.locals.db;
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get('wannabe@example.com');
  expect(row).toBeUndefined();
});

test('register omitting role defaults to citizen', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'ada@example.com', password: 'secret123'
  });
  expect(res.status).toBe(201);
  expect(res.body.role).toBe('citizen');
});

test('register does not crash on malformed non-string fields', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    name: { nested: true }, email: 'ada@example.com', password: 'secret123', role: 'citizen'
  });
  expect(res.status).toBe(400);
});

test('login does not crash on malformed non-string fields', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/login').send({ email: { nested: true }, password: 'x' });
  expect(res.status).toBe(400);
});

test('logs in with correct credentials and rejects wrong password', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'ada@example.com', password: 'secret123', role: 'citizen'
  });

  const agent = request.agent(app);
  const good = await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: 'secret123' });
  expect(good.status).toBe(200);
  expect(good.body.user.role).toBe('citizen');

  const bad = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'wrong' });
  expect(bad.status).toBe(401);
});

test('rejects login for deactivated account', async () => {
  const app = buildApp();
  createUserDirectly(app.locals.db, { name: 'Bob', email: 'bob@example.com', password: 'secret123', role: 'officer' });
  app.locals.db.prepare("UPDATE users SET is_active = 0 WHERE email = ?").run('bob@example.com');

  const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'secret123' });
  expect(res.status).toBe(403);
});

test('logout clears the session', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'ada@example.com', password: 'secret123', role: 'citizen'
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: 'secret123' });
  const res = await agent.post('/api/auth/logout');
  expect(res.status).toBe(200);
});
