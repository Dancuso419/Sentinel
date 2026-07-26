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
  -- Whether the reporter was the person affected or a witness reporting on someone
  -- else's behalf. This decides how much a reporter's confirmation is worth: a
  -- witness can say a report was acted on, but not that the harm was put right.
  reporter_relationship TEXT CHECK(reporter_relationship IN ('affected','witness')),
  -- The reporter's response to a resolution. Evidence, never a gate: an anonymous
  -- or unreachable reporter must not be able to hold a case open by silence.
  reporter_verdict TEXT CHECK(reporter_verdict IN ('confirmed','disputed')),
  reporter_verdict_note TEXT,
  reporter_verdict_at TEXT,
  -- Admin sign-off. The universal backstop, applied to every resolved case
  -- regardless of whether the reporter ever responds.
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Despite the name this is the full case-event log, not only status transitions.
-- `event` distinguishes them: 'status' for a workflow move, 'note' for a revision
-- of the resolution note, 'verdict' for the reporter's response, 'review' for admin
-- sign-off. Keeping them in one append-only table is what makes the trail able to
-- show the whole chain of custody in order.
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  status TEXT NOT NULL,
  event TEXT NOT NULL DEFAULT 'status',
  detail TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_counters (
  year INTEGER PRIMARY KEY,
  count INTEGER NOT NULL
);
