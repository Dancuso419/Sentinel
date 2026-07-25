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

app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/officer', require('./routes/officer'));
app.use('/api/admin', require('./routes/admin'));

app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Sentinel CCRTS listening on http://localhost:${port}`));
}

module.exports = app;
