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
