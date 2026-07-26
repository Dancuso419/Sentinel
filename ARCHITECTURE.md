# Architecture — how Sentinel is built

**How to read this page.** Every section starts with a plain-English explanation that
assumes no computing background. Underneath each one is a collapsed block marked
*"The technical detail"* — click it to expand. If you are not a programmer you can
read straight through and skip every one of them without missing the argument.

---

## What Sentinel is made of

Sentinel has three parts.

**1. The database.** A single file on disk that holds everything: accounts, crime
reports, and the history of every change. It is one ordinary file, which means the
whole system can be copied, backed up, or wiped and rebuilt in one command.

**2. The server.** A program that runs on the computer and does the actual work:
checking who you are, deciding what you are allowed to see, reading and writing to the
database. The server is the only thing that touches the database. Nothing in your web
browser ever gets to it directly, which is what makes the security rules meaningful.

**3. The web pages.** Ordinary HTML files sent to your browser. When a page needs
information it asks the server for it, and the server answers with data — not with a
finished page.

There is **no build step**: the files in the `public/` folder are exactly, character
for character, what your browser receives. Nothing is compiled, bundled or
transformed on the way. That was a requirement of the project, not an accident, and it
shapes almost every decision below.

<details>
<summary><strong>The technical detail</strong> — the stack</summary>

An Express JSON API with a static vanilla-JavaScript front end. No framework, no
bundler, no server-side rendering.

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
| Tests | **Jest** + **supertest** | ^29 / ^7 | 114 tests over the HTTP surface. |

</details>

---

## Why these tools and not the obvious alternatives

**The database is a single file rather than a separate database program.** Systems
like Postgres or MySQL run as their own server that has to be installed, configured
and kept running. Sentinel's database is one file that travels with the project. For
something that has to be demonstrated live on a machine nobody has prepared in
advance, "nothing to install" is a genuine feature.

**Two components were chosen specifically because they are slower.** The usual
libraries for the database and for password scrambling are written in C and have to be
compiled for each computer — which fails in environments without the right build
tools. The versions used here are written in plain JavaScript instead. They are
measurably slower, and at this scale that difference is invisible.

**No framework on the web pages.** Required by the project brief. It also has a real
benefit: the audit trail, the sidebar and the charts are all readable as plain,
ordinary code — which matters for a project that gets *read* as evidence of work
rather than only used.

<details>
<summary><strong>The technical detail</strong> — the specific swaps</summary>

**`node:sqlite` rather than `better-sqlite3`.** The usual choice needs native
compilation, which is unavailable in this environment. `node:sqlite` ships inside Node
from 22.5 and offers the same synchronous prepared-statement API, so the code reads
identically with zero install risk.

**`bcryptjs` rather than `bcrypt`.** Same reason: `bcrypt` is a native addon.
`bcryptjs` is pure JavaScript, slower, and irrelevant at this scale.

**SQLite rather than Postgres or MySQL.** The database is a single file that can be
deleted and reseeded in one command, and it travels with the repository.

</details>

---

## What is in each folder

- **`database/`** — the data itself, plus the description of its shape and the demo-data loader
- **`routes/`** — the server's answers, one file per topic (accounts, reports, cases, officer, admin, public statistics)
- **`lib/`** — shared logic that must behave identically no matter who calls it
- **`middleware/`** — the checks that run before a request is allowed through
- **`scripts/`** — the administrator-creation tool, the one thing not reachable from the web
- **`public/`** — everything the browser receives: pages, styling, images, fonts
- **`tests/`** — the automated checks

<details>
<summary><strong>The technical detail</strong> — full directory map</summary>

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
  js/                  One script per page, plus shared ones
  fonts/               Self-hosted woff2

tests/                 Jest + supertest, one suite per concern
```

</details>

---

## What happens when you click something

Say an officer clicks a case.

1. The browser asks the server for that case.
2. The server works out **who is asking** from a small token stored in the browser.
3. It checks **whether their account is still active** — not whether it was active when
   they signed in, but whether it is active *right now*, at this exact request.
4. It checks **whether their role is allowed** to see this.
5. Only then does it read the database and send back the answer.

Step 3 is the important one. It means that switching off an account takes effect
immediately, including for someone already signed in and looking at the screen. They do
not keep their access until they next log out.

If anything goes wrong, the server sends back a plain, generic failure message.
Internal details never reach the browser, because error messages are one of the classic
ways systems leak information about themselves.

<details>
<summary><strong>The technical detail</strong> — request pipeline</summary>

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

Unmatched `/api/*` requests return a JSON `404` rather than Express's HTML error page,
so the front end's `apiRequest()` can always parse the body. A final error-handling
middleware catches anything thrown, logs it, and returns a generic `500`.

</details>

---

## Where the information lives

Think of it as four lists.

**People** — everyone with an account: their name, email, scrambled password, and
whether they are a citizen, an officer or an administrator.

**Cases** — the reports themselves. What happened, where, when, the current stage, the
officer's explanation, and the reporter's answer to it.

**History** — every event that has ever happened to every case.

**Counter** — a tally of how many cases exist per year, so that case numbers can start
again at 0001 each January.

**The History list is the one that matters.** Nothing is ever erased from it or edited
in place — entries are only ever added. That single property is what makes the record
trustworthy, and it is the direct answer to the paper system's "no audit trail"
weakness that this project set out to fix.

### Two things deliberately *not* stored

**Who is handling a case** is worked out from the history each time it is asked for —
the last staff member who moved it — rather than kept in its own column. A stored
column goes out of date the moment a case changes hands. The history cannot.

**The officer standings** are recalculated from that same history every time somebody
looks. There is no stored score to drift out of date, and no nightly job to run.

<details>
<summary><strong>The technical detail</strong> — tables and derived values</summary>

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

`officerLeaderboard(db, { publicView })` serves both the internal board
(`GET /api/officer/performance`) and the public one (`GET /api/stats/standings`, no
session). One function rather than two, so the ranking can never differ between them —
only the columns do. The public view drops deactivated officers and the note-revision
count; it keeps disputes, because a board showing closures without rejections would be
a volume ranking.

**Migrations.** `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so an existing database
never picks up new columns from it. `database/db.js` therefore carries an explicit
migration list, checked against `PRAGMA table_info` on every open and applied with
`ALTER TABLE ADD COLUMN`. Existing data is preserved; running it twice is a no-op.

</details>

---

## Signing in, and who may do what

When you sign in, the server gives your browser a small sealed token. It is signed, so
it cannot be edited or forged — changing so much as one character invalidates it. Your
password is never stored: only a scrambled version that cannot be turned back.

Three levels of permission:

- **Any signed-in person** — their own account and their own cases
- **Officers** (and administrators, who hold officer permissions too) — the case queue
- **Administrators only** — oversight, analytics, and creating officer accounts

<details>
<summary><strong>The technical detail</strong> — sessions and guards</summary>

Session-based. On login the user's `{id, name, email, role}` is written to
`req.session.user` and a signed cookie is returned (4-hour lifetime).

Every guarded request re-reads `is_active` from the database. A session is not trusted
on its own, so deactivating an account ends its access immediately rather than at next
login — including sessions already open.

- `requireAuth` — any signed-in, active user
- `requireRole('officer', 'admin')` — the officer routes
- `requireRole('admin')` — the admin router, applied at router level

</details>

---

## How accounts get created

Three kinds of account, each needing a stronger credential than the last.

| Account | Who creates it | What they need |
|---|---|---|
| **Citizen** | Anyone, from the website | Nothing |
| **Officer** | An administrator, from the admin page | To be signed in as an administrator |
| **Administrator** | Whoever runs the command | Access to the computer holding the database |

**No web page anywhere can create an administrator.** This is the single most
important rule in the system. If a web page could do it, then anyone who stole an
administrator's login could quietly create a second administrator account and keep
their way in even after the first was shut down.

So there has to be exactly one way in from outside the web, and it is a command run
on the machine itself. Whoever can run that command can already read and write the
database file directly, so the tool grants them nothing they did not already have.

> **Step-by-step instructions for creating an administrator are in
> [README.md](README.md#creating-an-administrator).**

<details>
<summary><strong>The technical detail</strong> — provisioning boundaries</summary>

`POST /api/auth/register` refuses any role but `citizen`. `POST /api/admin/users`
takes **no role field at all** — `'officer'` is written into the SQL literal, so no
request body can escalate past it.

The out-of-band path is `scripts/create-admin.js`. It generates the password and
prints it once rather than accepting it as an argument, so it never lands in shell
history. `--reset-password` handles a lost admin password and is scoped to admin
accounts only: silently repointing a citizen or officer password from a script named
`create-admin` would be a trap.

</details>

---

## Why a new officer must change their password

When an administrator creates an officer account, they choose the starting password
and then have to tell the officer what it is. That means the password is known to at
least two people before it has ever been used once.

So the account is **completely inert until the officer sets their own.** Not
restricted, not warned — genuinely unable to do anything. Every part of the system
turns them away except the three things they need: seeing who they are, changing their
password, and logging out.

This is enforced by the server rather than by a message on the screen, and the
distinction matters: a message drawn by the browser can simply be ignored by anyone
who knows how to ask the server directly. The account has to be genuinely locked, not
merely inconvenient.

The moment they set a password, everything opens up on the same session. No second
sign-in.

<details>
<summary><strong>The technical detail</strong> — the gate</summary>

`must_change_password` is set on creation. `enforcePasswordChange` sits in `server.js`
above every router except `/api/auth` and `/api/stats`, and returns `403` with
`code: 'PASSWORD_CHANGE_REQUIRED'`.

```js
app.use('/api/auth',  require('./routes/auth'));   // reachable
app.use(enforcePasswordChange);                    // ← the gate
app.use('/api/reports', ...);                      // everything below is blocked
```

`/api/auth` stays above the gate so the holder can read `/me`, change the password,
and log out. Changing it clears the flag and the same session immediately works.

On the client, `apiRequest()` in `js/api.js` intercepts that code globally and
redirects to `account.html?first=1`, so no page handles it individually. The banner
there is driven by the server's flag, never by the query string.

</details>

---

## The web pages

Every page is a plain HTML file. Each one loads a small shared helper first, then its
own script.

Anything typed by a user — a name, a location, a description of an incident — is
passed through an escaping step before it is put on screen. Without that step, someone
could type something that the browser mistakes for instructions rather than text.
This is one of the most common security holes on the web, and the defence is applied
in one place so it cannot be forgotten on an individual page.

<details>
<summary><strong>The technical detail</strong> — shared scripts</summary>

**`js/api.js`** — `apiRequest()` (fetch wrapper that throws on non-2xx with the
server's message) and `escapeHtml()`. Every piece of server data passes through
`escapeHtml` before reaching `innerHTML`.

**`js/rail.js`** — the retractable sidebar, account chip, and the admin's in-page
section navigation. The open state is written to `<html>` by a small inline `<head>`
script **before first paint**, because a class applied by a deferred script makes the
sidebar visibly snap open on every navigation.

**`js/table-cards.js`** — mirrors each table's column headers onto its cells as
`data-label`, which is what lets a wide table render as labelled cards on a phone. It
runs as an observer because the table renderers replace their contents wholesale.

**`js/password-toggle.js`** — attaches a show/hide control to every
`input[type=password]`, so the password fields across three pages cannot drift apart.

**`css/style.css`** — the whole design system: tokens in `:root`, then components.
Documented in [DESIGN.md](DESIGN.md).

</details>

---

## Testing

```bash
npm test
```

**114 automated checks, in 14 groups.** Most of them drive the real system exactly as a
browser would — signing in, submitting reports, changing statuses — against a
temporary database created fresh for each run. They are not simulations of the system;
they are the system, being used.

Several exist specifically to lock down privacy decisions, so that a future change
cannot quietly undo them. For example, one asserts the exact set of fields in the
administrator's citizen list, so nothing report-shaped can be added there by accident.

<details>
<summary><strong>The technical detail</strong> — suites and a known wart</summary>

Run with `--runInBand` because they share a database file pattern. Most exercise the
real HTTP surface through supertest against an in-memory SQLite database (`:memory:`),
so routing, session handling and SQL are all covered rather than mocked.

| Suite | Covers |
|---|---|
| `verification.test.js` | The officer → reporter → admin chain, and the anonymity boundaries around it |
| `performance.test.js` | That the ranking refuses to reward volume over quality |
| `officer.test.js` | Queue filters, forward-only workflow, and that note revisions are logged |
| `admin.test.js` | Provisioning, roster shape, privilege boundaries |
| `authMiddleware.test.js` | That deactivation ends live sessions |
| `pageScripts.test.js` | That each page's scripts share one global scope without colliding |

**One known wart:** the evidence-upload tests write into the real `uploads/` directory
and do not clean up, so it accumulates small files across runs. Harmless, but real.
The fix is pointing multer at a temp directory during tests.

</details>

---

## The four commands

| Command | What it does |
|---|---|
| `npm start` | Starts Sentinel at http://localhost:3000 |
| `npm test` | Runs all 114 automated checks |
| `npm run seed` | **Erases the database** and reloads the demo data |
| `npm run create-admin -- "Name" email@example.com` | Creates an administrator |

`SESSION_SECRET` should be set in any real deployment; it falls back to a development
default.
