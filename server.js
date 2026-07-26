const path = require('path');
const express = require('express');
const session = require('express-session');
const { createDb } = require('./database/db');

const app = express();
const db = createDb(path.join(__dirname, 'database', 'ccrts.db'));
app.locals.db = db;

app.use(express.json());
app.use(session({
  name: 'ccrts.sid',
  secret: process.env.SESSION_SECRET || 'sentinel-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 }
}));

app.use('/api/stats', require('./routes/stats'));
app.use('/api/auth', require('./routes/auth'));

// Everything below this line is unreachable while an account still holds a password
// someone else set. /api/auth is above it so the holder can still read their own
// account, change the password, and log out.
app.use(require('./middleware/auth').enforcePasswordChange);

app.use('/api/reports', require('./routes/reports'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/officer', require('./routes/officer'));
app.use('/api/admin', require('./routes/admin'));

// Any /api/* request that didn't match a router above gets a JSON 404, not the
// default Express HTML 404 page.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, 'public')));

// Generic error-handling middleware: a safety net alongside the try/catch blocks
// in each route so an unexpected thrown error never crashes the process or leaks
// internals to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).send('Internal server error');
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Sentinel CCRTS listening on http://localhost:${port}`));
}

module.exports = app;
