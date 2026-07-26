// The case trail: one append-only log of everything that happened to a case.
//
// Every write to a case goes through here so no path can quietly skip the log —
// that was exactly the defect this module was written to close, where revising a
// resolution note updated the case but recorded nothing.

const EVENTS = ['status', 'note', 'verdict', 'review'];

// updated_by stores a raw user id, or one of these sentinels for actors that have
// no account. Resolved to display names in describeActor below.
const ACTOR_WALKIN = 'system';
const ACTOR_REPORTER = 'reporter';

// `at` exists for seeding only: the running system always wants the column default
// of datetime('now'), but demo data has to sit on real historical dates or every
// resolution looks like it happened today and time-to-resolve is meaningless.
function recordEvent(db, { reportId, status, event = 'status', detail = null, actor, at = null }) {
  if (!EVENTS.includes(event)) throw new Error(`Unknown case event: ${event}`);

  if (at) {
    db.prepare(`
      INSERT INTO status_history (report_id, status, event, detail, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reportId, status, event, detail, String(actor), at);
    return;
  }

  db.prepare(`
    INSERT INTO status_history (report_id, status, event, detail, updated_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(reportId, status, event, detail, String(actor));
}

// Staff are named; everyone else collapses to a generic label.
//
// This asymmetry is deliberate and load-bearing. Officers must be identifiable so a
// resolution can be held to someone. Citizens must NOT be, because an anonymous
// report still carries its reporter's id on the opening row — resolving that to a
// name would leak the identity the officer queries strip.
function buildActorLookup(db) {
  const staff = new Map(
    db.prepare("SELECT id, name, role FROM users WHERE role IN ('officer', 'admin')")
      .all()
      .map((u) => [String(u.id), `${u.name} (${u.role})`])
  );

  return function describeActor(updatedBy) {
    if (updatedBy === ACTOR_WALKIN) return 'Walk-in submission';
    if (updatedBy === ACTOR_REPORTER) return 'The reporter';
    return staff.get(String(updatedBy)) || 'The reporter';
  };
}

function readTrail(db, reportId) {
  const rows = db.prepare(`
    SELECT status, event, detail, updated_by, updated_at
    FROM status_history WHERE report_id = ? ORDER BY id ASC
  `).all(reportId);

  const describeActor = buildActorLookup(db);
  return rows.map((row) => ({ ...row, updated_by: describeActor(row.updated_by) }));
}

// Who is handling this case, derived from the log rather than stored on the report.
// Derived because a denormalised column drifts the moment a case changes hands; the
// log is the record of truth and this is just the last staff member to move it.
function handlingOfficer(db, reportId) {
  const rows = db.prepare(`
    SELECT updated_by FROM status_history
    WHERE report_id = ? AND event = 'status' ORDER BY id DESC
  `).all(reportId);

  const staff = new Map(
    db.prepare("SELECT id, name FROM users WHERE role IN ('officer', 'admin')")
      .all()
      .map((u) => [String(u.id), u.name])
  );

  for (const row of rows) {
    const name = staff.get(String(row.updated_by));
    if (name) return name;
  }
  return null;
}

module.exports = {
  recordEvent,
  readTrail,
  handlingOfficer,
  buildActorLookup,
  ACTOR_WALKIN,
  ACTOR_REPORTER
};
