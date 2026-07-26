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

test('GET /me names the signed-in account and 401s when anonymous', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'ada@example.com', password: 'secret123'
  });

  const anon = await request(app).get('/api/auth/me');
  expect(anon.status).toBe(401);

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: 'secret123' });

  const res = await agent.get('/api/auth/me');
  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ name: 'Ada', email: 'ada@example.com', role: 'citizen' });
  expect(res.body.user.password_hash).toBeUndefined();
});

test('GET /me stops answering once the account is deactivated', async () => {
  const app = buildApp();
  const db = app.locals.db;
  createUserDirectly(db, { name: 'Bello', email: 'bello@example.com', password: 'secret123', role: 'officer' });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'bello@example.com', password: 'secret123' });
  expect((await agent.get('/api/auth/me')).status).toBe(200);

  db.prepare("UPDATE users SET is_active = 0 WHERE email = 'bello@example.com'").run();
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

test('changes own password and requires the current one', async () => {
  const app = buildApp();
  await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'ada@example.com', password: 'secret123'
  });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'ada@example.com', password: 'secret123' });

  const wrong = await agent.patch('/api/auth/password')
    .send({ current_password: 'nope12345', new_password: 'brandnew123' });
  expect(wrong.status).toBe(403);

  const short = await agent.patch('/api/auth/password')
    .send({ current_password: 'secret123', new_password: 'tiny' });
  expect(short.status).toBe(400);

  const same = await agent.patch('/api/auth/password')
    .send({ current_password: 'secret123', new_password: 'secret123' });
  expect(same.status).toBe(400);

  const ok = await agent.patch('/api/auth/password')
    .send({ current_password: 'secret123', new_password: 'brandnew123' });
  expect(ok.status).toBe(200);

  // The old password must stop working and the new one must start.
  const stale = await request(app).post('/api/auth/login')
    .send({ email: 'ada@example.com', password: 'secret123' });
  expect(stale.status).toBe(401);

  const fresh = await request(app).post('/api/auth/login')
    .send({ email: 'ada@example.com', password: 'brandnew123' });
  expect(fresh.status).toBe(200);
});

test('anonymous callers cannot change a password', async () => {
  const app = buildApp();
  const res = await request(app).patch('/api/auth/password')
    .send({ current_password: 'secret123', new_password: 'brandnew123' });
  expect(res.status).toBe(401);
});

test('registration enforces the 8-character minimum it advertises', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    name: 'Ada', email: 'short@example.com', password: 'tiny'
  });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/8 characters/);
});
