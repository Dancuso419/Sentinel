// tests/server.test.js
// Exercises the full app (server.js) rather than a hand-built router mount,
// to cover the app-wide JSON 404 handler and error-handling middleware.
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');

function buildRealApp() {
  // server.js opens database/ccrts.db and reads PORT from process.env at require time,
  // but only calls app.listen() when run as main, so requiring it here is safe and
  // gives us the real middleware chain (json 404 + error handler) to test against.
  jest.resetModules();
  return require('../server');
}

test('unmatched /api route returns a JSON 404', async () => {
  const app = buildRealApp();
  const res = await request(app).get('/api/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Not found' });
});

test('unmatched non-api route falls through to static/plain handling, not a JSON 404', async () => {
  const app = buildRealApp();
  const res = await request(app).get('/this-page-does-not-exist.html');
  expect(res.status).toBe(404);
  expect(res.type).not.toBe('application/json');
});
