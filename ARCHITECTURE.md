# Architecture — the stack, and what each part does

Sentinel is a server-rendered-nothing application: an Express JSON API with a static
vanilla-JavaScript front end. There is **no build step, no framework, and no
bundler**. What is in `public/` is exactly what the browser receives.

That constraint is a project requirement, not an accident, and it shapes every
decision below.

---

## The stack at a glance

| Layer | Tool | Version | What it does here |
|---|---|---|---|
| Runtime | **Node.js** | ≥ 22.5 | Runs the server. The floor is 22.5 because `node:sqlite` is only available from there. |
| HTTP server | **Express** | ^4.19 | Routing, JSON parsing, static file serving, error handling. |
| Database | **SQLite** via `node:sqlite` | built in | All persistence. Built into Node, so no native compilation. |
| Sessions | **express-session** | ^1.18 | Signed session cookie, in-memory store. |
| Passwords | **bcryptjs** | ^2.4 | Hashing. Pure JS, so no native build. |
| File upload | **multer** | ^1.4 | Evidence uploads to `uploads/`. |
| PDF export | **pdfkit** | ^0.15 | Per-case PDF summaries, streamed. |
| Front end | **Vanilla HTML/CSS/JS** | — | No framework. Static files under `public/`. |
| Fonts | **Archivo**, **Spline Sans Mono** | self-hosted | Committed as `.woff2`. Never a CDN — the demo may run offline. |
| Tests | **Jest** + **supertest** | ^29 / ^7 | 96 tests over the HTTP surface. |

### Why these and not the obvious alternatives

**`node:sqlite` rather than `better-sqlite3`.** The usual choice needs native
compilation, which is unavailable in this environment. `node:sqlite` ships inside
Node from 22.5 and offers the same synchronous prepared-statement API, so the code
reads identically with zero install risk.

**`bcryptjs` rather than `bcrypt`.** Same reason: `bcrypt` is a native addon.
`bcryptjs` is pure JavaScript, slower, and irrelevant at this scale.

**SQLite rather than Postgres or MySQL.** The database is a single file that can be
deleted and reseeded in one command, and it travels with the repository. For a
project that must be demonstrated live on an unknown machine, no server to install
is a feature.

**No framework on the front end.** A required constraint. It also means the audit
trail, the rail, and the charts are all readable as plain DOM code, which matters
for a project that gets read as evidence of work rather than only used.

---

## Directory map

```
server.js              Express app: session config, route mounting, error handling
package.json           Dependencies and the four npm scripts

database/
  db.js                Opens SQLite, applies schema.sql, runs column migrations
  schema.sql           Table definitions (idempotent: CREATE TABLE IF NOT EXISTS)
  seed.js              Destructive demo-data loader
  ccrts.db             The database itself (gitignored)

routes/                One router per resource, mounted under /api
  auth.js              register, login, logout, me, change password
  reports.js           create (citizen + walk-in), edit, withdraw
  cases.js             citizen's own cases, public lookup, reporter verdict
  officer.js           queue, filters, status changes, trail, standings
  admin.js             analytics, sign-off queue, rosters, officer provisioning
  stats.js             public: aggregate counts and officer standings (landing page)

lib/                   Logic that must not differ between callers
  caseTrail.js         Writes and reads the case-event log; resolves actor names
  officerStats.js      Builds the officer leaderboard
  caseId.js            Allocates CR-YYYY-NNNN identifiers
  casePdf.js           Streams a case summary as PDF
  validators.js        Email, password, and evidence-file rules

middleware/
  auth.js              requireAuth / requireRole; re-reads is_active every request

scripts/
  create-admin.js      The only path to an administrator account

public/                Served verbatim by express.static
  *.html               One file per surface
  css/style.css        The entire design system
  js/                  One script per page, plus three shared ones
  fonts/               Self-hosted woff2

tests/                 Jest + supertest, one suite per concern
```

---

## Request flow

```
Browser
   │  fetch()  →  /api/*
   ▼
express.json() ──► express-session ──► route matcher
                                            │
                              requireAuth / requireRole
                              (re-reads is_active from the DB)
                                            │
                                      route handler
                                            │
                            lib/* for anything shared
                                            │
                                   node:sqlite (synchronous)
                                            │
                                       JSON response
```

Unmatched `/api/*` requests return a JSON `404` rather than Express's HTML error
page, so the front end's `apiRequest()` can always parse the body. A final
error-handling middleware catches anything thrown, logs it, and returns a generic
`500` — internals never reach the client.

---

## Data model

Four tables.

**`users`** — `id`, `name`, `email` (unique), `password_hash`, `role`
(`citizen` | `officer` | `admin`), `is_active`, `created_at`.

**`reports`** — the case itself. `case_id` (`CR-YYYY-NNNN`, unique), `citizen_id`
(null for walk-ins), `is_anonymous`, incident fields, `status`, `resolution_note`,
`unseen_status_change`, plus the verification columns: `reporter_relationship`
(`affected` | `witness`), `reporter_verdict` (`confirmed` | `disputed`),
`reporter_verdict_note`, `reporter_verdict_at`, `reviewed_by`, `reviewed_at`.

**`status_history`** — despite the name, the **full case-event log**. `report_id`,
`status`, `event` (`status` | `note` | `verdict` | `review`), `detail`, `updated_by`,
`updated_at`. Append-only; nothing updates or deletes a row except withdrawing a
still-pending report, which removes the case entirely.

**`case_counters`** — `year` → `count`, so case IDs restart at `0001` each January
without scanning the reports table.

### Two derived values, deliberately not stored

**The handling officer** is computed from the trail — the last staff member to move
the case — rather than kept in a column. A stored column drifts the moment a case
changes hands; the log is the record of truth.

**Officer standings** are computed per request from the same log. There is no score
column to fall out of date, and no recalculation job.

`officerLeaderboard(db, { publicView })` serves both the internal board
(`GET /api/officer/performance`, officers and admins) and the public one
(`GET /api/stats/standings`, no session). One function rather than two so the
ranking can never differ between them — only the columns do. The public view drops
deactivated officers and the note-revision count; it keeps disputes, because a board
showing closures without rejections would be a volume ranking.

### Migrations

`schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so an existing database never picks
up new columns from it. `database/db.js` therefore carries an explicit migration
list, checked against `PRAGMA table_info` on every open and applied with
`ALTER TABLE ADD COLUMN`. Existing data is preserved; running it twice is a no-op.

---

## Authentication and authorisation

Session-based. On login the user's `{id, name, email, role}` is written to
`req.session.user` and a signed cookie is returned (4-hour lifetime).

**Every guarded request re-reads `is_active` from the database.** A session is not
trusted on its own, so deactivating an account ends its access immediately rather
than at the next login — including sessions already open.

- `requireAuth` — any signed-in, active user
- `requireRole('officer', 'admin')` — the officer routes; admins hold officer permissions
- `requireRole('admin')` — the admin router, applied at the router level

### Account provisioning

Three tiers, each requiring a strictly stronger credential:

| Account | Created by | Credential needed |
|---|---|---|
| Citizen | `POST /api/auth/register` | none |
| Officer | `POST /api/admin/users` | an admin session |
| Admin | `npm run create-admin` | shell access to the host |

`POST /api/auth/register` refuses any role but `citizen`. `POST /api/admin/users`
takes **no role field at all** — `'officer'` is written into the SQL literal, so no
request body can escalate past it.

### First-login password change

An officer account is created with a password the **admin** chose and then has to
communicate — so it is known to at least two people before it has ever been used.
`must_change_password` is set on creation, and the account is genuinely unusable
until it is cleared:

```js
app.use('/api/auth',  require('./routes/auth'));   // reachable
app.use(enforcePasswordChange);                    // ← the gate
app.use('/api/reports', ...);                      // everything below is blocked
```

`enforcePasswordChange` sits in `server.js` above every router except `/api/auth`
and `/api/stats`, and returns `403` with `code: 'PASSWORD_CHANGE_REQUIRED'`. It is
server-side rather than a prompt in the interface because a prompt the browser draws
is bypassed by calling the API directly — the account has to be genuinely inert, not
merely awkward.

`/api/auth` stays above the gate so the holder can still do the only three things
they need: read `/me`, change the password, and log out. Changing the password
clears the flag, and the same session immediately works — no re-login.

On the client, `apiRequest()` in `js/api.js` intercepts that code globally and
redirects to `account.html?first=1`, so no page has to handle it individually. The
banner there is driven by the server's flag, never by the query string.

**No HTTP endpoint anywhere can create an administrator.** That is what stops a
stolen admin session from minting a permanent backdoor. The one out-of-band path is
`scripts/create-admin.js`, whose credential is shell access to the machine holding
the database — which already implies full read/write over that database, so the
script grants nothing its operator did not already have.

---

## The front end

No framework, no build. Each page loads `js/api.js` first, then its own script.

**`js/api.js`** — `apiRequest()` (fetch wrapper that throws on non-2xx with the
server's message) and `escapeHtml()`. Every piece of server data passes through
`escapeHtml` before reaching `innerHTML`.

**`js/rail.js`** — shared by every signed-in page: the retractable sidebar, the
account chip, and the admin's in-page section navigation. The rail's open state is
written to `<html>` by a small inline `<head>` script **before first paint**,
because a class applied by a deferred script makes the sidebar visibly snap open on
every navigation.

**`js/password-toggle.js`** — attaches a show/hide control to every
`input[type=password]` on the page, so the five password fields across three pages
cannot drift apart.

**`css/style.css`** — the whole design system: tokens in `:root`, then components.
Documented in [DESIGN.md](DESIGN.md).

---

## Testing

```bash
npm test
```

96 tests in 13 suites, run with `--runInBand` because they share a database file
pattern. Most exercise the real HTTP surface through supertest against an in-memory
SQLite database (`:memory:`), so routing, session handling, and SQL are all covered
rather than mocked.

The suites worth knowing about:

| Suite | Covers |
|---|---|
| `verification.test.js` | The officer → reporter → admin chain, and the anonymity boundaries around it |
| `performance.test.js` | That the ranking refuses to reward volume over quality |
| `officer.test.js` | Queue filters, forward-only workflow, and that note revisions are logged |
| `admin.test.js` | Provisioning, roster shape, privilege boundaries |
| `authMiddleware.test.js` | That deactivation ends live sessions |

Several tests exist specifically to lock in privacy decisions — for example
`admin.test.js` asserts the exact key set of the citizen roster, so nothing
report-shaped can be added to it by accident later.

**One known wart:** the evidence-upload tests write into the real `uploads/`
directory and do not clean up, so it accumulates small files across runs. Harmless,
but real. The fix is pointing multer at a temp directory during tests.

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | Serves on `http://localhost:3000` (`PORT` to override) |
| `npm test` | The full Jest suite |
| `npm run seed` | **Destroys** the database and loads demo data |
| `npm run create-admin -- "Name" email@example.com` | Creates an administrator |

`SESSION_SECRET` should be set in any real deployment; it falls back to a
development default.
