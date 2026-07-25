# Sentinel (CCRTS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Computerized Crime Reporting and Tracking System (CCRTS) described in `build.md` — a small-scale Node/Express + SQLite web app for citizens to report crimes, officers to track/resolve cases, and admins to manage users and view analytics.

**Architecture:** Server-rendered-free SPA-lite: static HTML/CSS/vanilla-JS pages in `public/` call a JSON REST API (`/api/*`) served by Express. SQLite (via `better-sqlite3`, synchronous) is the single data store. Session-based auth with role guards on API routes. File uploads go to local disk via multer.

**Tech Stack:** Node.js ≥ 18, Express, better-sqlite3, express-session, bcrypt, multer, pdfkit. Dev/test: Jest + Supertest.

## Global Constraints

- Node.js >= 18, CommonJS modules (`require`/`module.exports`) throughout — matches Express ecosystem convention, no build step.
- Runtime deps: `express`, `express-session`, `bcrypt`, `multer`, `pdfkit`, `better-sqlite3`. Dev deps: `jest`, `supertest`.
- Case ID format: `CR-YYYY-NNNN`, auto-incrementing per calendar year, zero-padded to 4 digits (e.g. `CR-2026-0001`).
- Evidence uploads: `.jpg`, `.jpeg`, `.png`, `.pdf` only, 5MB max file size, stored under `uploads/` (gitignored).
- Passwords hashed with bcrypt, cost factor 10. Never store or log plaintext passwords.
- Auth is session-based (`express-session`, default `MemoryStore` — acceptable at this single-process demo scale). Session cookie name: `ccrts.sid`.
- Roles: `citizen`, `officer`, `admin`. Route guards enforce role via `middleware/auth.js`.
- Status workflow is strictly linear: `pending -> investigating -> resolved`. No skipping backward.
- No email notifications (project decision 2026-07-25) — on-screen banner only, driven by an `unseen_status_change` flag checked on dashboard load.
- All `/api/*` routes return JSON (`{ error: "..." }` on failure with appropriate HTTP status). Static pages live in `public/*.html`, served via `express.static`.
- SQLite file at `database/ccrts.db` (gitignored). Tests always use an in-memory DB (`:memory:`), never the real file.
- `.gitignore` must cover: `node_modules/`, `database/ccrts.db`, `uploads/*` (keep `uploads/.gitkeep`).

---

## File Structure

```
Sentinel Project/
├── server.js                    # Express app assembly, mounts routers
├── package.json
├── .gitignore
├── database/
│   ├── ccrts.db                 # generated, gitignored
│   ├── schema.sql                # all table definitions
│   ├── db.js                     # createDb(filePath) -> better-sqlite3 instance
│   └── seed.js                   # sample users + reports, run via `node database/seed.js`
├── lib/
│   ├── caseId.js                  # nextCaseId(db, year) -> "CR-YYYY-NNNN"
│   └── validators.js              # shared field validators (email, required fields, file type/size)
├── middleware/
│   └── auth.js                    # requireAuth, requireRole(...roles)
├── routes/
│   ├── auth.js                    # register, login, logout
│   ├── reports.js                 # citizen + walk-in report submission, edit/withdraw
│   ├── cases.js                   # track-by-case-id, citizen dashboard listing
│   ├── officer.js                 # officer list/search/filter, status update, PDF export
│   ├── admin.js                   # analytics, user activation/deactivation
├── public/
│   ├── css/style.css
│   ├── js/
│   │   ├── api.js                 # small fetch() wrapper used by all pages
│   │   ├── register.js
│   │   ├── login.js
│   │   ├── report-form.js          # shared by citizen + walk-in report pages
│   │   ├── track-case.js
│   │   ├── citizen-dashboard.js
│   │   ├── officer-dashboard.js
│   │   └── admin-dashboard.js
│   ├── index.html
│   ├── register.html
│   ├── login.html
│   ├── report.html                 # walk-in, no auth
│   ├── report-citizen.html         # registered citizen, requires auth (checked client-side + server-side)
│   ├── track.html                  # public track-by-case-id
│   ├── citizen-dashboard.html
│   ├── officer-dashboard.html
│   └── admin-dashboard.html
├── uploads/                        # evidence files, gitignored (keep .gitkeep)
└── tests/
    ├── caseId.test.js
    ├── validators.test.js
    ├── auth.test.js
    ├── reports.test.js
    ├── cases.test.js
    ├── officer.test.js
    └── admin.test.js
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `server.js`
- Create: `uploads/.gitkeep`

**Interfaces:**
- Produces: `server.js` exports nothing (entry point); when run, listens on `process.env.PORT || 3000`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sentinel-ccrts",
  "version": "1.0.0",
  "description": "Computerized Crime Reporting and Tracking System",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "seed": "node database/seed.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^11.3.0",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "multer": "^1.4.5-lts.1",
    "pdfkit": "^0.15.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
database/ccrts.db
uploads/*
!uploads/.gitkeep
```

- [ ] **Step 3: Create `uploads/.gitkeep`**

Empty file.

- [ ] **Step 4: Create `server.js`**

```javascript
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
```

- [ ] **Step 5: Install dependencies and verify server boots**

Run: `npm install`
Then run: `node server.js` (will fail — `./database/db`, route files don't exist yet). Expected: `Error: Cannot find module './database/db'`. This confirms scaffold wiring is in place; Task 2 creates that module.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore server.js uploads/.gitkeep
git commit -m "chore: project scaffold and server entry point"
```

---

### Task 2: Database Schema & Connection Module

**Files:**
- Create: `database/schema.sql`
- Create: `database/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `createDb(filePath)` from `database/db.js` — returns a `better-sqlite3` `Database` instance with schema applied and `foreign_keys` pragma on. Pass `':memory:'` for tests.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/db.test.js
const { createDb } = require('../database/db');

test('createDb applies schema and returns a usable connection', () => {
  const db = createDb(':memory:');
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  expect(tables).toEqual(expect.arrayContaining(['users', 'reports', 'status_history', 'case_counters']));
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/db.test.js`
Expected: FAIL with `Cannot find module '../database/db'`

- [ ] **Step 3: Write `database/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('citizen','officer','admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL UNIQUE,
  citizen_id INTEGER REFERENCES users(id),
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  incident_time TEXT NOT NULL,
  evidence_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','investigating','resolved')),
  resolution_note TEXT,
  unseen_status_change INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  status TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_counters (
  year INTEGER PRIMARY KEY,
  count INTEGER NOT NULL
);
```

- [ ] **Step 4: Write `database/db.js`**

```javascript
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createDb(filePath) {
  const db = new Database(filePath);
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

module.exports = { createDb };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/db.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add database/schema.sql database/db.js tests/db.test.js
git commit -m "feat: database schema and connection module"
```

---

### Task 3: Case ID Generator

**Files:**
- Create: `lib/caseId.js`
- Test: `tests/caseId.test.js`

**Interfaces:**
- Consumes: a `better-sqlite3` `Database` instance from Task 2's `createDb`.
- Produces: `nextCaseId(db, year)` -> `string` in format `CR-YYYY-NNNN`. Later tasks (report submission) call this to assign `case_id`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/caseId.test.js
const { createDb } = require('../database/db');
const { nextCaseId } = require('../lib/caseId');

test('generates sequential zero-padded case IDs per year', () => {
  const db = createDb(':memory:');
  expect(nextCaseId(db, 2026)).toBe('CR-2026-0001');
  expect(nextCaseId(db, 2026)).toBe('CR-2026-0002');
  expect(nextCaseId(db, 2027)).toBe('CR-2027-0001');
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/caseId.test.js`
Expected: FAIL with `Cannot find module '../lib/caseId'`

- [ ] **Step 3: Write `lib/caseId.js`**

```javascript
function nextCaseId(db, year) {
  const bump = db.transaction((yr) => {
    const row = db.prepare('SELECT count FROM case_counters WHERE year = ?').get(yr);
    const next = row ? row.count + 1 : 1;
    if (row) {
      db.prepare('UPDATE case_counters SET count = ? WHERE year = ?').run(next, yr);
    } else {
      db.prepare('INSERT INTO case_counters (year, count) VALUES (?, ?)').run(yr, next);
    }
    return next;
  });
  const n = bump(year);
  return `CR-${year}-${String(n).padStart(4, '0')}`;
}

module.exports = { nextCaseId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/caseId.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/caseId.js tests/caseId.test.js
git commit -m "feat: per-year sequential case ID generator"
```

---

### Task 4: Shared Validators

**Files:**
- Create: `lib/validators.js`
- Test: `tests/validators.test.js`

**Interfaces:**
- Produces: `isValidEmail(str)`, `requireFields(obj, fieldNames)` -> `string[]` (missing field names), `isAllowedEvidenceFile(mimetype, sizeBytes)` -> `boolean`. Used by Task 5 (auth) and Task 6 (reports).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/validators.test.js
const { isValidEmail, requireFields, isAllowedEvidenceFile } = require('../lib/validators');

test('isValidEmail accepts well-formed addresses and rejects malformed ones', () => {
  expect(isValidEmail('a@b.com')).toBe(true);
  expect(isValidEmail('not-an-email')).toBe(false);
  expect(isValidEmail('')).toBe(false);
});

test('requireFields lists missing/empty fields', () => {
  expect(requireFields({ name: 'Jo', email: '' }, ['name', 'email', 'password'])).toEqual(['email', 'password']);
  expect(requireFields({ name: 'Jo', email: 'a@b.com', password: 'x' }, ['name', 'email', 'password'])).toEqual([]);
});

test('isAllowedEvidenceFile enforces type and 5MB size limit', () => {
  expect(isAllowedEvidenceFile('image/jpeg', 1024)).toBe(true);
  expect(isAllowedEvidenceFile('application/pdf', 5 * 1024 * 1024)).toBe(true);
  expect(isAllowedEvidenceFile('application/pdf', 5 * 1024 * 1024 + 1)).toBe(false);
  expect(isAllowedEvidenceFile('text/plain', 1024)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/validators.test.js`
Expected: FAIL with `Cannot find module '../lib/validators'`

- [ ] **Step 3: Write `lib/validators.js`**

```javascript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

function isValidEmail(str) {
  return typeof str === 'string' && EMAIL_RE.test(str);
}

function requireFields(obj, fieldNames) {
  return fieldNames.filter((f) => {
    const v = obj[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

function isAllowedEvidenceFile(mimetype, sizeBytes) {
  return ALLOWED_MIME.has(mimetype) && sizeBytes <= MAX_EVIDENCE_BYTES;
}

module.exports = { isValidEmail, requireFields, isAllowedEvidenceFile, MAX_EVIDENCE_BYTES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/validators.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/validators.js tests/validators.test.js
git commit -m "feat: shared field and file validators"
```

---

### Task 5: Auth Middleware

**Files:**
- Create: `middleware/auth.js`
- Test: `tests/authMiddleware.test.js`

**Interfaces:**
- Produces: `requireAuth(req, res, next)`, `requireRole(...roles)(req, res, next)`. Expects `req.session.user = { id, name, email, role }` to be set by the login route (Task 6). Consumed by routes/reports.js, routes/cases.js, routes/officer.js, routes/admin.js.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/authMiddleware.test.js
const { requireAuth, requireRole } = require('../middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('requireAuth blocks when no session user', () => {
  const req = { session: {} };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth calls next when session user present', () => {
  const req = { session: { user: { id: 1, role: 'citizen' } } };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(next).toHaveBeenCalled();
});

test('requireRole blocks users without an allowed role', () => {
  const req = { session: { user: { id: 1, role: 'citizen' } } };
  const res = mockRes();
  const next = jest.fn();
  requireRole('officer', 'admin')(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('requireRole allows users with an allowed role', () => {
  const req = { session: { user: { id: 1, role: 'officer' } } };
  const res = mockRes();
  const next = jest.fn();
  requireRole('officer', 'admin')(req, res, next);
  expect(next).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/authMiddleware.test.js`
Expected: FAIL with `Cannot find module '../middleware/auth'`

- [ ] **Step 3: Write `middleware/auth.js`**

```javascript
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/authMiddleware.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add middleware/auth.js tests/authMiddleware.test.js
git commit -m "feat: session auth and role-guard middleware"
```

---

### Task 6: Auth Routes (Register, Login, Logout)

**Files:**
- Create: `routes/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: `db` via `req.app.locals.db` (set in `server.js`), `isValidEmail`/`requireFields` from Task 4.
- Produces: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`. On login success, sets `req.session.user = { id, name, email, role }`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/auth.test.js
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
  await request(app).post('/api/auth/register').send({
    name: 'Bob', email: 'bob@example.com', password: 'secret123', role: 'officer'
  });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/auth.test.js`
Expected: FAIL with `Cannot find module '../routes/auth'`

- [ ] **Step 3: Write `routes/auth.js`**

```javascript
const express = require('express');
const bcrypt = require('bcrypt');
const { isValidEmail, requireFields } = require('../lib/validators');

const router = express.Router();
const SALT_ROUNDS = 10;
const ALLOWED_ROLES = new Set(['citizen', 'officer', 'admin']);

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const missing = requireFields({ name, email, password, role }, ['name', 'email', 'password', 'role']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });

  const db = req.app.locals.db;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, password_hash, role);

  res.status(201).json({ id: result.lastInsertRowid, name, email, role });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const missing = requireFields({ email, password }, ['email', 'password']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/auth.js tests/auth.test.js
git commit -m "feat: register, login, logout routes"
```

---

### Task 7: Report Submission (Citizen + Walk-in, Evidence Upload, Anonymous Flag)

**Files:**
- Create: `routes/reports.js`
- Modify: `server.js:20` (already mounts `/api/reports` from Task 1 — no change needed, verify wiring)
- Test: `tests/reports.test.js`

**Interfaces:**
- Consumes: `nextCaseId` (Task 3), `requireFields`/`isAllowedEvidenceFile` (Task 4), `requireAuth` (Task 5).
- Produces: `POST /api/reports` (citizen, requires auth, `multipart/form-data` with optional `evidence` file field), `POST /api/reports/walkin` (no auth, same shape, forces `is_anonymous=1` and `citizen_id=null`). Both return `{ case_id }`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/reports.test.js
const request = require('supertest');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createDb } = require('../database/db');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.locals.db = createDb(':memory:');
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/reports', require('../routes/reports'));
  return app;
}

async function registerAndLogin(agent, overrides = {}) {
  const user = { name: 'Ada', email: 'ada@example.com', password: 'secret123', role: 'citizen', ...overrides };
  await agent.post('/api/auth/register').send(user);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

test('registered citizen submits a report and receives a case ID', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const res = await agent.post('/api/reports')
    .field('type', 'Theft')
    .field('location', 'Main Market, Aba')
    .field('description', 'Phone stolen at the market')
    .field('incident_time', '2026-07-20T10:00')
    .field('is_anonymous', 'false');

  expect(res.status).toBe(201);
  expect(res.body.case_id).toMatch(/^CR-\d{4}-\d{4}$/);
});

test('citizen report requires auth', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/reports').field('type', 'Theft');
  expect(res.status).toBe(401);
});

test('citizen report rejects missing required fields', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const res = await agent.post('/api/reports').field('type', 'Theft');
  expect(res.status).toBe(400);
});

test('walk-in report requires no auth and stores no citizen_id', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/reports/walkin')
    .field('type', 'Assault')
    .field('location', 'Bank Road')
    .field('description', 'Witnessed an assault')
    .field('incident_time', '2026-07-21T14:00');

  expect(res.status).toBe(201);
  const db = app.locals.db;
  const row = db.prepare('SELECT citizen_id, is_anonymous FROM reports WHERE case_id = ?').get(res.body.case_id);
  expect(row.citizen_id).toBeNull();
  expect(row.is_anonymous).toBe(1);
});

test('rejects evidence file over 5MB', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const bigFile = path.join(os.tmpdir(), 'big-evidence.png');
  fs.writeFileSync(bigFile, Buffer.alloc(5 * 1024 * 1024 + 1));

  const res = await agent.post('/api/reports')
    .field('type', 'Theft')
    .field('location', 'Main Market')
    .field('description', 'desc')
    .field('incident_time', '2026-07-20T10:00')
    .attach('evidence', bigFile);

  expect(res.status).toBe(400);
  fs.unlinkSync(bigFile);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/reports.test.js`
Expected: FAIL with `Cannot find module '../routes/reports'`

- [ ] **Step 3: Write `routes/reports.js`**

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { requireFields, isAllowedEvidenceFile, MAX_EVIDENCE_BYTES } = require('../lib/validators');
const { nextCaseId } = require('../lib/caseId');

const router = express.Router();
const REQUIRED = ['type', 'location', 'description', 'incident_time'];

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: MAX_EVIDENCE_BYTES }
}).single('evidence');

function handleUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Evidence file too large (max 5MB)' });
    if (req.file && !isAllowedEvidenceFile(req.file.mimetype, req.file.size)) {
      return res.status(400).json({ error: 'Evidence must be jpg, png, or pdf, max 5MB' });
    }
    next();
  });
}

function insertReport(db, { citizen_id, is_anonymous, type, location, description, incident_time, evidence_path }) {
  const year = new Date().getFullYear();
  const case_id = nextCaseId(db, year);
  db.prepare(`
    INSERT INTO reports (case_id, citizen_id, is_anonymous, type, location, description, incident_time, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(case_id, citizen_id, is_anonymous ? 1 : 0, type, location, description, incident_time, evidence_path || null);

  const reportId = db.prepare('SELECT id FROM reports WHERE case_id = ?').get(case_id).id;
  db.prepare('INSERT INTO status_history (report_id, status, updated_by) VALUES (?, ?, ?)')
    .run(reportId, 'pending', citizen_id ? String(citizen_id) : 'system');

  return case_id;
}

router.post('/', requireAuth, handleUpload, (req, res) => {
  const { type, location, description, incident_time, is_anonymous } = req.body;
  const missing = requireFields({ type, location, description, incident_time }, REQUIRED);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const db = req.app.locals.db;
  const case_id = insertReport(db, {
    citizen_id: req.session.user.id,
    is_anonymous: is_anonymous === 'true' || is_anonymous === true,
    type, location, description, incident_time,
    evidence_path: req.file ? req.file.filename : null
  });

  res.status(201).json({ case_id });
});

router.post('/walkin', handleUpload, (req, res) => {
  const { type, location, description, incident_time } = req.body;
  const missing = requireFields({ type, location, description, incident_time }, REQUIRED);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const db = req.app.locals.db;
  const case_id = insertReport(db, {
    citizen_id: null,
    is_anonymous: true,
    type, location, description, incident_time,
    evidence_path: req.file ? req.file.filename : null
  });

  res.status(201).json({ case_id });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/reports.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/reports.js tests/reports.test.js
git commit -m "feat: citizen and walk-in report submission with evidence upload"
```

---

### Task 8: Report Edit/Withdraw (Pending Only)

**Files:**
- Modify: `routes/reports.js` (add two routes)
- Modify: `tests/reports.test.js` (add tests)

**Interfaces:**
- Produces: `PUT /api/reports/:case_id` (citizen, requires auth + ownership + `status='pending'`), `DELETE /api/reports/:case_id` (same guards).

- [ ] **Step 1: Write the failing test**

```javascript
// append to tests/reports.test.js

test('owner can edit their own pending report', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const edit = await agent.put(`/api/reports/${caseId}`).send({ description: 'Updated: phone and wallet stolen' });
  expect(edit.status).toBe(200);

  const db = app.locals.db;
  const row = db.prepare('SELECT description FROM reports WHERE case_id = ?').get(caseId);
  expect(row.description).toBe('Updated: phone and wallet stolen');
});

test('cannot edit a report once status has moved past pending', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  app.locals.db.prepare("UPDATE reports SET status = 'investigating' WHERE case_id = ?").run(caseId);

  const edit = await agent.put(`/api/reports/${caseId}`).send({ description: 'trying to edit' });
  expect(edit.status).toBe(409);
});

test('non-owner cannot edit or withdraw a report', async () => {
  const app = buildApp();
  const ownerAgent = request.agent(app);
  await registerAndLogin(ownerAgent);
  const create = await ownerAgent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const otherAgent = request.agent(app);
  await registerAndLogin(otherAgent, { email: 'other@example.com' });
  const res = await otherAgent.delete(`/api/reports/${caseId}`);
  expect(res.status).toBe(403);
});

test('owner can withdraw (delete) their own pending report', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await agent.delete(`/api/reports/${caseId}`);
  expect(res.status).toBe(200);

  const row = app.locals.db.prepare('SELECT * FROM reports WHERE case_id = ?').get(caseId);
  expect(row).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/reports.test.js`
Expected: FAIL — `PUT`/`DELETE` return 404 (no matching route yet)

- [ ] **Step 3: Add edit/withdraw routes to `routes/reports.js`**

Insert before `module.exports = router;`:

```javascript
function loadOwnedPendingReport(req, res, next) {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  if (report.citizen_id !== req.session.user.id) return res.status(403).json({ error: 'Not your report' });
  if (report.status !== 'pending') return res.status(409).json({ error: 'Report is locked once status has moved past pending' });
  req.report = report;
  next();
}

router.put('/:case_id', requireAuth, loadOwnedPendingReport, (req, res) => {
  const { type, location, description, incident_time } = req.body;
  const db = req.app.locals.db;
  db.prepare(`
    UPDATE reports SET
      type = COALESCE(?, type),
      location = COALESCE(?, location),
      description = COALESCE(?, description),
      incident_time = COALESCE(?, incident_time),
      updated_at = datetime('now')
    WHERE case_id = ?
  `).run(type || null, location || null, description || null, incident_time || null, req.params.case_id);

  res.json({ ok: true });
});

router.delete('/:case_id', requireAuth, loadOwnedPendingReport, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM status_history WHERE report_id = ?').run(req.report.id);
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.report.id);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/reports.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/reports.js tests/reports.test.js
git commit -m "feat: citizen edit/withdraw for pending reports"
```

---

### Task 9: Track-by-Case-ID and Citizen Dashboard Listing

**Files:**
- Create: `routes/cases.js`
- Test: `tests/cases.test.js`

**Interfaces:**
- Consumes: `requireAuth` (Task 5).
- Produces: `GET /api/cases/:case_id` (public — no auth; returns status, type, resolution_note, but never citizen identity), `GET /api/cases/mine` (requires auth; lists the logged-in citizen's own reports, and clears `unseen_status_change` as a side effect of being read — matches Task 11's banner mechanism).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/cases.test.js
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
  app.use('/api/cases', require('../routes/cases'));
  return app;
}

async function registerAndLogin(agent, overrides = {}) {
  const user = { name: 'Ada', email: 'ada@example.com', password: 'secret123', role: 'citizen', ...overrides };
  await agent.post('/api/auth/register').send(user);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

test('public case lookup returns status without citizen identity', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  const create = await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  const caseId = create.body.case_id;

  const res = await request(app).get(`/api/cases/${caseId}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('pending');
  expect(res.body.citizen_id).toBeUndefined();
  expect(res.body.citizen_name).toBeUndefined();
});

test('public case lookup 404s for unknown case ID', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/cases/CR-2026-9999');
  expect(res.status).toBe(404);
});

test('citizen dashboard lists only their own reports', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent);
  await agent.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');

  const other = request.agent(app);
  await registerAndLogin(other, { email: 'other@example.com' });
  await other.post('/api/reports')
    .field('type', 'Vandalism').field('location', 'School Gate')
    .field('description', 'Fence damaged').field('incident_time', '2026-07-21T08:00');

  const res = await agent.get('/api/cases/mine');
  expect(res.status).toBe(200);
  expect(res.body.reports).toHaveLength(1);
  expect(res.body.reports[0].type).toBe('Theft');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cases.test.js`
Expected: FAIL with `Cannot find module '../routes/cases'`

- [ ] **Step 3: Write `routes/cases.js`**

```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const reports = db.prepare(`
    SELECT case_id, type, location, status, resolution_note, created_at, updated_at, unseen_status_change
    FROM reports WHERE citizen_id = ? ORDER BY created_at DESC
  `).all(req.session.user.id);

  db.prepare('UPDATE reports SET unseen_status_change = 0 WHERE citizen_id = ?').run(req.session.user.id);
  res.json({ reports });
});

router.get('/:case_id', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare(`
    SELECT case_id, type, status, resolution_note, created_at, updated_at
    FROM reports WHERE case_id = ?
  `).get(req.params.case_id);

  if (!report) return res.status(404).json({ error: 'Case not found' });
  res.json(report);
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/cases.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/cases.js tests/cases.test.js
git commit -m "feat: public case tracking and citizen dashboard listing"
```

---

### Task 10: Officer Routes — List/Search/Filter, Status Update, History Logging

**Files:**
- Create: `routes/officer.js`
- Test: `tests/officer.test.js`

**Interfaces:**
- Consumes: `requireRole` (Task 5).
- Produces: `GET /api/officer/reports?status=&type=&from=&to=` (officer/admin only, strips citizen identity on anonymous reports), `PATCH /api/officer/reports/:case_id/status` (officer/admin only; body `{ status, resolution_note }`; enforces linear workflow; writes `status_history`; sets `unseen_status_change=1` on the report).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/officer.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/officer.test.js`
Expected: FAIL with `Cannot find module '../routes/officer'`

- [ ] **Step 3: Write `routes/officer.js`**

```javascript
const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const WORKFLOW = ['pending', 'investigating', 'resolved'];

router.use(requireRole('officer', 'admin'));

router.get('/reports', (req, res) => {
  const { status, type, from, to } = req.query;
  const db = req.app.locals.db;

  let sql = `
    SELECT r.id, r.case_id, r.is_anonymous, r.type, r.location, r.description,
           r.incident_time, r.status, r.resolution_note, r.created_at, r.updated_at,
           u.name AS citizen_name
    FROM reports r
    LEFT JOIN users u ON u.id = r.citizen_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (type) { sql += ' AND r.type = ?'; params.push(type); }
  if (from) { sql += ' AND r.incident_time >= ?'; params.push(from); }
  if (to) { sql += ' AND r.incident_time <= ?'; params.push(to); }
  sql += ' ORDER BY r.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  const reports = rows.map((r) => {
    if (r.is_anonymous) delete r.citizen_name;
    return r;
  });
  res.json({ reports });
});

router.patch('/reports/:case_id/status', (req, res) => {
  const { status, resolution_note } = req.body;
  if (!WORKFLOW.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });

  const currentIdx = WORKFLOW.indexOf(report.status);
  const nextIdx = WORKFLOW.indexOf(status);
  if (nextIdx < currentIdx) return res.status(409).json({ error: 'Cannot move status backward' });
  if (status === 'resolved' && !resolution_note?.trim()) {
    return res.status(400).json({ error: 'Resolution note is required to resolve a case' });
  }

  db.prepare(`
    UPDATE reports SET status = ?, resolution_note = COALESCE(?, resolution_note),
      unseen_status_change = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, resolution_note || null, report.id);

  db.prepare('INSERT INTO status_history (report_id, status, updated_by) VALUES (?, ?, ?)')
    .run(report.id, status, String(req.session.user.id));

  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/officer.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/officer.js tests/officer.test.js
git commit -m "feat: officer list/search/filter and status update with history logging"
```

---

### Task 11: Admin Routes — Analytics + User Activation/Deactivation

**Files:**
- Create: `routes/admin.js`
- Test: `tests/admin.test.js`

**Interfaces:**
- Consumes: `requireRole` (Task 5).
- Produces: `GET /api/admin/analytics` (admin only; counts by type, by status, by date), `GET /api/admin/users` (admin only; lists officer accounts), `PATCH /api/admin/users/:id/active` (admin only; body `{ is_active }`).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/admin.test.js
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
  app.use('/api/admin', require('../routes/admin'));
  return app;
}

async function registerAndLogin(agent, overrides = {}) {
  const user = { name: 'User', email: 'user@example.com', password: 'secret123', role: 'citizen', ...overrides };
  await agent.post('/api/auth/register').send(user);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
}

test('officer cannot access admin routes', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await registerAndLogin(agent, { email: 'officer@example.com', role: 'officer' });
  const res = await agent.get('/api/admin/analytics');
  expect(res.status).toBe(403);
});

test('analytics returns counts by type and status', async () => {
  const app = buildApp();
  const citizen = request.agent(app);
  await registerAndLogin(citizen);
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Main Market')
    .field('description', 'Phone stolen').field('incident_time', '2026-07-20T10:00');
  await citizen.post('/api/reports')
    .field('type', 'Theft').field('location', 'Bank Rd')
    .field('description', 'Wallet stolen').field('incident_time', '2026-07-21T10:00');

  const admin = request.agent(app);
  await registerAndLogin(admin, { email: 'admin@example.com', role: 'admin' });

  const res = await admin.get('/api/admin/analytics');
  expect(res.status).toBe(200);
  expect(res.body.byType).toEqual(expect.arrayContaining([{ type: 'Theft', count: 2 }]));
  expect(res.body.byStatus).toEqual(expect.arrayContaining([{ status: 'pending', count: 2 }]));
});

test('admin can deactivate an officer account', async () => {
  const app = buildApp();
  const officer = request.agent(app);
  await registerAndLogin(officer, { email: 'officer@example.com', role: 'officer' });

  const admin = request.agent(app);
  await registerAndLogin(admin, { email: 'admin@example.com', role: 'admin' });

  const db = app.locals.db;
  const officerId = db.prepare("SELECT id FROM users WHERE email = 'officer@example.com'").get().id;

  const res = await admin.patch(`/api/admin/users/${officerId}/active`).send({ is_active: false });
  expect(res.status).toBe(200);

  const row = db.prepare('SELECT is_active FROM users WHERE id = ?').get(officerId);
  expect(row.is_active).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/admin.test.js`
Expected: FAIL with `Cannot find module '../routes/admin'`

- [ ] **Step 3: Write `routes/admin.js`**

```javascript
const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/analytics', (req, res) => {
  const db = req.app.locals.db;
  const byType = db.prepare('SELECT type, COUNT(*) AS count FROM reports GROUP BY type').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status').all();
  const byDate = db.prepare(`
    SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
    FROM reports GROUP BY date ORDER BY date
  `).all();
  res.json({ byType, byStatus, byDate });
});

router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare("SELECT id, name, email, role, is_active FROM users WHERE role = 'officer'").all();
  res.json({ users });
});

router.patch('/users/:id/active', (req, res) => {
  const { is_active } = req.body;
  const db = req.app.locals.db;
  const result = db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/admin.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/admin.js tests/admin.test.js
git commit -m "feat: admin analytics and officer account activation"
```

---

### Task 12: PDF Export

**Files:**
- Modify: `routes/officer.js` (add export route, shared by officer and citizen — mount also from `routes/cases.js`)
- Modify: `routes/cases.js` (add citizen-facing export route)
- Test: `tests/pdfExport.test.js`

**Interfaces:**
- Produces: `GET /api/officer/reports/:case_id/pdf` (officer/admin), `GET /api/cases/:case_id/pdf?citizen=1` (requires auth, owner-only). Both stream a PDF with case ID, type, status, description, resolution note.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pdfExport.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/pdfExport.test.js`
Expected: FAIL — both routes 404

- [ ] **Step 3: Add shared PDF helper `lib/casePdf.js`**

```javascript
const PDFDocument = require('pdfkit');

function streamCaseSummary(res, report) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${report.case_id}.pdf`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(18).text('Sentinel CCRTS — Case Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`Case ID: ${report.case_id}`);
  doc.text(`Type: ${report.type}`);
  doc.text(`Status: ${report.status}`);
  doc.moveDown();
  doc.text('Description:', { underline: true });
  doc.text(report.description || '');
  doc.moveDown();
  doc.text('Resolution Note:', { underline: true });
  doc.text(report.resolution_note || 'N/A');
  doc.end();
}

module.exports = { streamCaseSummary };
```

- [ ] **Step 4: Add export route to `routes/officer.js`** (insert before `module.exports`)

```javascript
const { streamCaseSummary } = require('../lib/casePdf');

router.get('/reports/:case_id/pdf', (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  streamCaseSummary(res, report);
});
```

- [ ] **Step 5: Add export route to `routes/cases.js`** (insert before `module.exports`, requires the `requireAuth` import already present)

```javascript
const { streamCaseSummary } = require('../lib/casePdf');

router.get('/:case_id/pdf', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE case_id = ?').get(req.params.case_id);
  if (!report) return res.status(404).json({ error: 'Case not found' });
  if (report.citizen_id !== req.session.user.id) return res.status(403).json({ error: 'Not your report' });
  streamCaseSummary(res, report);
});
```

Note: this route must be registered in `routes/cases.js` **before** the existing `GET /:case_id` route, since Express matches `/:case_id/pdf` against `/:case_id` first otherwise. Place it directly after `router.get('/mine', ...)`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/pdfExport.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/casePdf.js routes/officer.js routes/cases.js tests/pdfExport.test.js
git commit -m "feat: PDF case summary export for officers and citizens"
```

---

### Task 13: Seed Script

**Files:**
- Create: `database/seed.js`

**Interfaces:**
- Produces: a script run via `npm run seed` that populates `database/ccrts.db` with sample users (one citizen, one officer, one admin — password `Passw0rd!` for all) and sample reports across all three statuses.

- [ ] **Step 1: Write `database/seed.js`**

```javascript
const path = require('path');
const bcrypt = require('bcrypt');
const { createDb } = require('./db');
const { nextCaseId } = require('../lib/caseId');

async function seed() {
  const db = createDb(path.join(__dirname, 'ccrts.db'));
  const password_hash = await bcrypt.hash('Passw0rd!', 10);

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  const citizen = insertUser.run('Chinedu Okafor', 'citizen@example.com', password_hash, 'citizen');
  insertUser.run('Officer Bello', 'officer@example.com', password_hash, 'officer');
  insertUser.run('Admin Grace', 'admin@example.com', password_hash, 'admin');

  const year = new Date().getFullYear();
  const insertReport = db.prepare(`
    INSERT INTO reports (case_id, citizen_id, is_anonymous, type, location, description, incident_time, status, resolution_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHistory = db.prepare(
    'INSERT INTO status_history (report_id, status, updated_by) VALUES (?, ?, ?)'
  );

  const samples = [
    { type: 'Theft', location: 'Main Market, Aba', description: 'Phone stolen from stall', status: 'pending', note: null },
    { type: 'Vandalism', location: 'School Gate', description: 'Fence damaged overnight', status: 'investigating', note: null },
    { type: 'Assault', location: 'Bank Road', description: 'Physical altercation reported', status: 'resolved', note: 'Suspect identified and handed to local authority.' }
  ];

  for (const s of samples) {
    const case_id = nextCaseId(db, year);
    const result = insertReport.run(case_id, citizen.lastInsertRowid, 0, s.type, s.location, s.description, '2026-07-20T10:00', s.status, s.note);
    insertHistory.run(result.lastInsertRowid, 'pending', String(citizen.lastInsertRowid));
    if (s.status !== 'pending') insertHistory.run(result.lastInsertRowid, s.status, 'system');
  }

  console.log('Seeded 3 users (citizen@example.com / officer@example.com / admin@example.com, password: Passw0rd!) and 3 sample reports.');
  db.close();
}

seed();
```

- [ ] **Step 2: Run and verify**

Run: `npm run seed`
Expected: Console prints the seed confirmation message; `database/ccrts.db` now contains the sample rows (spot-check with `sqlite3 database/ccrts.db "SELECT case_id, status FROM reports;"` if the `sqlite3` CLI is available, otherwise verify via a throwaway `node -e` script using `better-sqlite3`).

- [ ] **Step 3: Commit**

```bash
git add database/seed.js
git commit -m "feat: seed script for sample users and reports"
```

---

### Task 14: Frontend Pages — Auth, Report Forms, Track

**Files:**
- Create: `public/js/api.js`
- Create: `public/css/style.css` (base only — full polish in Task 16)
- Create: `public/index.html`, `public/register.html`, `public/login.html`, `public/report.html`, `public/report-citizen.html`, `public/track.html`
- Create: `public/js/register.js`, `public/js/login.js`, `public/js/report-form.js`, `public/js/track-case.js`

**Interfaces:**
- Consumes: `/api/auth/*`, `/api/reports`, `/api/reports/walkin`, `/api/cases/:case_id` from Tasks 6, 7, 9.
- Produces: working browser pages. No automated tests for static markup (manual verification per step below) — the JS files' fetch-calling logic is thin enough that TDD adds no signal at this scope (`build.md` has no JS unit test tooling for the frontend and none is warranted here); verify by running the app and exercising each page.

- [ ] **Step 1: Write `public/js/api.js`**

```javascript
async function apiRequest(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
```

- [ ] **Step 2: Write `public/css/style.css`** (base layout, expanded in Task 16)

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #f4f6f8; color: #1a1a1a; }
header { background: #0b2545; color: #fff; padding: 1rem 2rem; }
main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
form { display: flex; flex-direction: column; gap: 0.75rem; background: #fff; padding: 1.5rem; border-radius: 6px; }
input, select, textarea, button { font-size: 1rem; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
button { background: #0b2545; color: #fff; cursor: pointer; border: none; }
.error { color: #b00020; }
.success { color: #146c2e; }
```

- [ ] **Step 3: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sentinel CCRTS</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Sentinel — Crime Reporting and Tracking System</h1></header>
  <main>
    <p><a href="report.html">Report a Crime (no account needed)</a></p>
    <p><a href="track.html">Track an Existing Case</a></p>
    <p><a href="login.html">Citizen / Officer / Admin Login</a></p>
    <p><a href="register.html">Register as a Citizen</a></p>
  </main>
</body>
</html>
```

- [ ] **Step 4: Write `public/register.html` and `public/js/register.js`**

`public/register.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Register — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Register</h1></header>
  <main>
    <form id="register-form">
      <input name="name" placeholder="Full name" required>
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password" required>
      <button type="submit">Register</button>
      <p id="message"></p>
    </form>
  </main>
  <script src="js/api.js"></script>
  <script src="js/register.js"></script>
</body>
</html>
```

`public/js/register.js`:
```javascript
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const message = document.getElementById('message');
  try {
    await apiRequest('POST', '/api/auth/register', {
      name: form.get('name'), email: form.get('email'), password: form.get('password'), role: 'citizen'
    });
    message.textContent = 'Registered! You can now log in.';
    message.className = 'success';
  } catch (err) {
    message.textContent = err.message;
    message.className = 'error';
  }
});
```

- [ ] **Step 5: Write `public/login.html` and `public/js/login.js`**

`public/login.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Login — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Login</h1></header>
  <main>
    <form id="login-form">
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password" required>
      <button type="submit">Login</button>
      <p id="message"></p>
    </form>
  </main>
  <script src="js/api.js"></script>
  <script src="js/login.js"></script>
</body>
</html>
```

`public/js/login.js`:
```javascript
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const message = document.getElementById('message');
  try {
    const { user } = await apiRequest('POST', '/api/auth/login', {
      email: form.get('email'), password: form.get('password')
    });
    const destinations = { citizen: 'citizen-dashboard.html', officer: 'officer-dashboard.html', admin: 'admin-dashboard.html' };
    window.location.href = destinations[user.role];
  } catch (err) {
    message.textContent = err.message;
    message.className = 'error';
  }
});
```

- [ ] **Step 6: Write `public/report.html` (walk-in) and `public/report-citizen.html`, sharing `public/js/report-form.js`**

`public/js/report-form.js` (reads a `data-endpoint` attribute on the form so the same script serves both pages):
```javascript
document.getElementById('report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const endpoint = form.dataset.endpoint;
  const data = new FormData(form);
  const message = document.getElementById('message');
  try {
    const res = await fetch(endpoint, { method: 'POST', body: data });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Submission failed');
    message.textContent = `Report submitted. Your case ID is ${body.case_id}. Save this — it is shown only once.`;
    message.className = 'success';
    form.reset();
  } catch (err) {
    message.textContent = err.message;
    message.className = 'error';
  }
});
```

`public/report.html` (walk-in, no login, `data-endpoint="/api/reports/walkin"`):
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Report a Crime — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Report a Crime (Anonymous)</h1></header>
  <main>
    <form id="report-form" data-endpoint="/api/reports/walkin">
      <select name="type" required>
        <option value="">Type of incident</option>
        <option>Theft</option><option>Assault</option><option>Vandalism</option><option>Fraud</option><option>Other</option>
      </select>
      <input name="location" placeholder="Location" required>
      <textarea name="description" placeholder="Description" required></textarea>
      <input name="incident_time" type="datetime-local" required>
      <label>Evidence (jpg, png, or pdf, max 5MB): <input name="evidence" type="file" accept=".jpg,.jpeg,.png,.pdf"></label>
      <button type="submit">Submit Report</button>
      <p id="message"></p>
    </form>
  </main>
  <script src="js/report-form.js"></script>
</body>
</html>
```

`public/report-citizen.html` (registered citizen, `data-endpoint="/api/reports"`, adds the anonymous checkbox):
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Submit Report — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Submit a Crime Report</h1></header>
  <main>
    <form id="report-form" data-endpoint="/api/reports">
      <select name="type" required>
        <option value="">Type of incident</option>
        <option>Theft</option><option>Assault</option><option>Vandalism</option><option>Fraud</option><option>Other</option>
      </select>
      <input name="location" placeholder="Location" required>
      <textarea name="description" placeholder="Description" required></textarea>
      <input name="incident_time" type="datetime-local" required>
      <label>Evidence (jpg, png, or pdf, max 5MB): <input name="evidence" type="file" accept=".jpg,.jpeg,.png,.pdf"></label>
      <label><input name="is_anonymous" type="checkbox" value="true"> Submit anonymously</label>
      <button type="submit">Submit Report</button>
      <p id="message"></p>
    </form>
  </main>
  <script src="js/report-form.js"></script>
</body>
</html>
```

Note: `report-citizen.html` requires an active session server-side (the `POST /api/reports` route already enforces `requireAuth` — a logged-out user submitting gets a 401, surfaced via `message.textContent`). No client-side gate needed beyond that.

- [ ] **Step 7: Write `public/track.html` and `public/js/track-case.js`**

`public/track.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Track a Case — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Track a Case</h1></header>
  <main>
    <form id="track-form">
      <input name="case_id" placeholder="Case ID (e.g. CR-2026-0001)" required>
      <button type="submit">Check Status</button>
    </form>
    <div id="result"></div>
  </main>
  <script src="js/api.js"></script>
  <script src="js/track-case.js"></script>
</body>
</html>
```

`public/js/track-case.js`:
```javascript
document.getElementById('track-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const caseId = new FormData(e.target).get('case_id').trim();
  const result = document.getElementById('result');
  try {
    const report = await apiRequest('GET', `/api/cases/${encodeURIComponent(caseId)}`);
    result.innerHTML = `
      <p><strong>Case:</strong> ${report.case_id}</p>
      <p><strong>Type:</strong> ${report.type}</p>
      <p><strong>Status:</strong> ${report.status}</p>
      ${report.status === 'resolved' ? `<p><strong>Resolution:</strong> ${report.resolution_note}</p>` : ''}
    `;
    result.className = '';
  } catch (err) {
    result.textContent = err.message;
    result.className = 'error';
  }
});
```

- [ ] **Step 8: Manual verification**

Run: `npm run seed && npm start`, then in a browser:
- Visit `/register.html`, register a citizen, confirm success message.
- Visit `/login.html`, log in as `citizen@example.com` / `Passw0rd!`, confirm redirect to `citizen-dashboard.html` (404 until Task 15 — expected at this point).
- Visit `/report.html`, submit a walk-in report, confirm a `CR-YYYY-NNNN` case ID is shown.
- Visit `/track.html`, enter that case ID, confirm status displays as `pending`.

- [ ] **Step 9: Commit**

```bash
git add public/
git commit -m "feat: auth, report submission, and track-case frontend pages"
```

---

### Task 15: Frontend Dashboards — Citizen, Officer, Admin (with Status-Change Banner)

**Files:**
- Create: `public/citizen-dashboard.html`, `public/js/citizen-dashboard.js`
- Create: `public/officer-dashboard.html`, `public/js/officer-dashboard.js`
- Create: `public/admin-dashboard.html`, `public/js/admin-dashboard.js`

**Interfaces:**
- Consumes: `GET /api/cases/mine` (Task 9, also returns `unseen_status_change` per report — drives the banner), `GET/PATCH /api/officer/*` (Task 10), `GET /api/admin/*` (Task 11), `GET /api/cases/:case_id/pdf` and `GET /api/officer/reports/:case_id/pdf` (Task 12).

- [ ] **Step 1: Write `public/citizen-dashboard.html` and `public/js/citizen-dashboard.js`**

`public/citizen-dashboard.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>My Reports — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>My Reports</h1><a href="report-citizen.html">Submit New Report</a></header>
  <main>
    <div id="banner" style="display:none" class="success"></div>
    <table id="reports-table"><thead><tr><th>Case ID</th><th>Type</th><th>Status</th><th>Updated</th><th>PDF</th></tr></thead><tbody></tbody></table>
  </main>
  <script src="js/api.js"></script>
  <script src="js/citizen-dashboard.js"></script>
</body>
</html>
```

`public/js/citizen-dashboard.js`:
```javascript
(async () => {
  const { reports } = await apiRequest('GET', '/api/cases/mine');
  const banner = document.getElementById('banner');
  const anyUnseen = reports.some(r => r.unseen_status_change);
  if (anyUnseen) {
    banner.textContent = 'One or more of your reports has a status update.';
    banner.style.display = 'block';
  }

  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${r.case_id}</td><td>${r.type}</td><td>${r.status}</td><td>${r.updated_at}</td>
      <td><a href="/api/cases/${r.case_id}/pdf">Download</a></td>
    </tr>
  `).join('');
})();
```

- [ ] **Step 2: Write `public/officer-dashboard.html` and `public/js/officer-dashboard.js`**

`public/officer-dashboard.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Officer Dashboard — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Officer Dashboard</h1></header>
  <main>
    <form id="filter-form">
      <select name="status"><option value="">All statuses</option><option>pending</option><option>investigating</option><option>resolved</option></select>
      <input name="type" placeholder="Type (e.g. Theft)">
      <input name="from" type="date"><input name="to" type="date">
      <button type="submit">Filter</button>
    </form>
    <table id="reports-table"><thead><tr><th>Case ID</th><th>Type</th><th>Reporter</th><th>Status</th><th>Update</th><th>PDF</th></tr></thead><tbody></tbody></table>
  </main>
  <script src="js/api.js"></script>
  <script src="js/officer-dashboard.js"></script>
</body>
</html>
```

`public/js/officer-dashboard.js`:
```javascript
async function loadReports(params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const { reports } = await apiRequest('GET', `/api/officer/reports?${qs}`);
  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${r.case_id}</td><td>${r.type}</td><td>${r.is_anonymous ? 'Anonymous' : (r.citizen_name || 'Walk-in')}</td>
      <td>${r.status}</td>
      <td>
        <select data-case="${r.case_id}" class="status-select">
          <option ${r.status === 'pending' ? 'selected' : ''}>pending</option>
          <option ${r.status === 'investigating' ? 'selected' : ''}>investigating</option>
          <option ${r.status === 'resolved' ? 'selected' : ''}>resolved</option>
        </select>
        <input data-case="${r.case_id}" class="note-input" placeholder="Resolution note" value="${r.resolution_note || ''}">
        <button data-case="${r.case_id}" class="save-btn">Save</button>
      </td>
      <td><a href="/api/officer/reports/${r.case_id}/pdf">Download</a></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-btn').forEach(btn => btn.addEventListener('click', async () => {
    const caseId = btn.dataset.case;
    const status = tbody.querySelector(`.status-select[data-case="${caseId}"]`).value;
    const resolution_note = tbody.querySelector(`.note-input[data-case="${caseId}"]`).value;
    try {
      await apiRequest('PATCH', `/api/officer/reports/${caseId}/status`, { status, resolution_note });
      loadReports(Object.fromEntries(new FormData(document.getElementById('filter-form'))));
    } catch (err) {
      alert(err.message);
    }
  }));
}

document.getElementById('filter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  loadReports(Object.fromEntries(new FormData(e.target)));
});

loadReports();
```

- [ ] **Step 3: Write `public/admin-dashboard.html` and `public/js/admin-dashboard.js`**

`public/admin-dashboard.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Admin Dashboard — Sentinel</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <header><h1>Admin Dashboard</h1></header>
  <main>
    <section><h2>Reports by Type</h2><ul id="by-type"></ul></section>
    <section><h2>Reports by Status</h2><ul id="by-status"></ul></section>
    <section><h2>Officer Accounts</h2><table id="users-table"><thead><tr><th>Name</th><th>Email</th><th>Active</th><th></th></tr></thead><tbody></tbody></table></section>
  </main>
  <script src="js/api.js"></script>
  <script src="js/admin-dashboard.js"></script>
</body>
</html>
```

`public/js/admin-dashboard.js`:
```javascript
async function loadAnalytics() {
  const { byType, byStatus } = await apiRequest('GET', '/api/admin/analytics');
  document.getElementById('by-type').innerHTML = byType.map(r => `<li>${r.type}: ${r.count}</li>`).join('');
  document.getElementById('by-status').innerHTML = byStatus.map(r => `<li>${r.status}: ${r.count}</li>`).join('');
}

async function loadUsers() {
  const { users } = await apiRequest('GET', '/api/admin/users');
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.name}</td><td>${u.email}</td><td>${u.is_active ? 'Yes' : 'No'}</td>
      <td><button data-id="${u.id}" data-active="${u.is_active}" class="toggle-btn">${u.is_active ? 'Deactivate' : 'Activate'}</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.toggle-btn').forEach(btn => btn.addEventListener('click', async () => {
    await apiRequest('PATCH', `/api/admin/users/${btn.dataset.id}/active`, { is_active: btn.dataset.active !== 'true' });
    loadUsers();
  }));
}

loadAnalytics();
loadUsers();
```

- [ ] **Step 4: Manual verification**

Run: `npm run seed && npm start`. Log in as each seeded account and confirm:
- `citizen@example.com`: dashboard lists the 3 seeded reports; status-change banner logic doesn't error (won't show until Task 10's PATCH sets `unseen_status_change`).
- `officer@example.com`: dashboard lists all reports, filter form works, changing a status + saving updates the row and, for `resolved`, requires a note (server returns 400 without one — confirm the `alert()` fires).
- `admin@example.com`: analytics lists match seed data counts; deactivating the officer account then attempting to log in as that officer returns a 403.

- [ ] **Step 5: Commit**

```bash
git add public/
git commit -m "feat: citizen, officer, and admin dashboards with status-change banner"
```

---

### Task 16: UI Polish and Final Manual Testing Pass

**Files:**
- Modify: `public/css/style.css` (expand to full navy/white government styling)
- Modify: `public/index.html` (add banner/nav styling hooks if needed)

**Interfaces:** None new — this task only touches presentation.

- [ ] **Step 1: Expand `public/css/style.css`**

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #f4f6f8; color: #1a1a1a; }
header { background: #0b2545; color: #fff; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
header h1 { margin: 0; font-size: 1.25rem; }
header a { color: #cfe0ff; text-decoration: none; margin-left: 1rem; }
header a:hover { text-decoration: underline; }
main { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
form { display: flex; flex-direction: column; gap: 0.75rem; background: #fff; padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 480px; }
input, select, textarea, button { font-size: 1rem; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
button { background: #0b2545; color: #fff; cursor: pointer; border: none; }
button:hover { background: #123a6b; }
table { width: 100%; border-collapse: collapse; background: #fff; margin-top: 1rem; }
th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #e0e0e0; }
th { background: #eef2f7; }
.error { color: #b00020; }
.success { color: #146c2e; background: #e8f5e9; padding: 0.75rem; border-radius: 4px; }
section { background: #fff; padding: 1rem 1.5rem; border-radius: 6px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
```

- [ ] **Step 2: Full manual testing pass**

Exercise every flow end to end against the running app (`npm run seed && npm start`) and record results as pass/fail — this is the evaluation evidence for Objective 4 (usability, security, response time):

1. Register with a duplicate email → expect inline error, no duplicate row created.
2. Login with wrong password → expect inline error, no session set (verify by attempting a protected page immediately after).
3. Walk-in report with a 6MB PNG → expect rejection before any DB row is created.
4. Walk-in report with a `.exe` file renamed `.jpg` (wrong mimetype) → expect rejection (multer/browser reports the real mimetype from file content headers where available; note any gap here in the evaluation write-up if mimetype spoofing isn't caught — this is expected scope for a demo-level system).
5. Citizen edits a pending report → succeeds; officer moves it to `investigating`; citizen attempts another edit → expect 409, form should surface the error.
6. Officer attempts to resolve without a note → expect 400, blocked client-side alert.
7. Anonymous walk-in case tracked via `/track.html` → confirm no citizen identity ever appears in the response.
8. Admin deactivates the officer account → officer login now fails with 403; admin reactivates → officer can log in again.
9. PDF export from both citizen dashboard and officer dashboard → confirm downloaded file opens and contains correct case ID/status/resolution note.
10. Time a few requests (login, report submission, dashboard load) informally to confirm sub-second response — record for the Objective 4 write-up.

- [ ] **Step 3: Run full automated test suite**

Run: `npm test`
Expected: All test files pass (`db`, `caseId`, `validators`, `authMiddleware`, `auth`, `reports`, `cases`, `officer`, `admin`, `pdfExport`).

- [ ] **Step 4: Commit**

```bash
git add public/css/style.css
git commit -m "style: navy/white government visual polish and final manual testing pass"
```

---

## Plan Self-Review Notes

- **Spec coverage:** All 9 features and both explicitly-in-scope traceability items (Objectives 2–4) map to at least one task. Objectives 1 and 5 are documentation-only per `build.md` and are not build tasks.
- **Type/interface consistency:** `case_id` string format, `status` enum values, and session-user shape (`{id, name, email, role}`) are used identically across all route files and tests.
- **No email notifications**, per the 2026-07-25 decision — banner-only, driven by `unseen_status_change`.
- **Deferred to manual-only testing:** static HTML/CSS and the thin fetch-wrapper JS in `public/` (Tasks 14–16) — there's no business logic there worth a DOM test harness at this project's scope; all server-side logic (auth, validation, workflow, PDF, analytics) is TDD'd with Jest + Supertest.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-25-sentinel-ccrts.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
