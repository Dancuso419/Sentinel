// Officer performance, derived entirely from the case-event log.
//
// A caution that shapes this whole module: ranking officers by cases closed
// rewards closing cases, not solving them — the well-known failure mode of raw
// clearance-rate targets. So "resolved" is never reported on its own here. Every
// officer's resolved count travels with what happened to those resolutions:
// confirmed by the reporter, disputed by the reporter, signed off by an admin.
//
// A disputed case is a resolution the reporter says did not happen. An officer
// with 20 resolutions and 8 disputes has not out-performed one with 12 and none,
// and the ranking must not be able to say otherwise.

// Officers are ranked on resolutions the reporter did not reject. Disputes are
// subtracted rather than ignored, so closing cases badly cannot buy a higher
// position than closing fewer cases well.
function score(row) {
  return row.resolved - row.disputed;
}

function collect(db) {
  const staff = db.prepare(
    "SELECT id, name, email, role, is_active FROM users WHERE role IN ('officer', 'admin')"
  ).all();

  // Cases this actor moved into 'investigating' — picked up, whether or not they
  // went on to close it.
  const pickedUp = new Map(
    db.prepare(`
      SELECT updated_by AS actor, COUNT(DISTINCT report_id) AS n
      FROM status_history
      WHERE event = 'status' AND status = 'investigating'
      GROUP BY updated_by
    `).all().map((r) => [String(r.actor), r.n])
  );

  // Cases this actor closed, with the outcome of each close.
  const closed = new Map(
    db.prepare(`
      SELECT sh.updated_by AS actor,
             COUNT(*) AS resolved,
             SUM(CASE WHEN r.reporter_verdict = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
             SUM(CASE WHEN r.reporter_verdict = 'disputed'  THEN 1 ELSE 0 END) AS disputed,
             SUM(CASE WHEN r.reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS signed_off,
             AVG(julianday(sh.updated_at) - julianday(r.created_at)) AS avg_days
      FROM status_history sh
      JOIN reports r ON r.id = sh.report_id
      WHERE sh.event = 'status' AND sh.status = 'resolved'
      GROUP BY sh.updated_by
    `).all().map((r) => [String(r.actor), r])
  );

  // Notes revised after the fact. Not a wrongdoing on its own — an officer may be
  // correcting a genuine mistake — but it is the kind of thing oversight should be
  // able to see rather than have to go looking for.
  const revisions = new Map(
    db.prepare(`
      SELECT updated_by AS actor, COUNT(*) AS n
      FROM status_history WHERE event = 'note' GROUP BY updated_by
    `).all().map((r) => [String(r.actor), r.n])
  );

  const hasActivity = (id) => pickedUp.has(String(id)) || closed.has(String(id));

  return staff
    // Officers always appear, even at zero — a new officer belongs on the board.
    // Admins appear only if they have actually worked cases: an admin who has never
    // touched the queue is not an absent performer, they are not a performer at all.
    .filter((u) => u.role === 'officer' || hasActivity(u.id))
    .map((u) => {
    const key = String(u.id);
    const c = closed.get(key);
    const resolved = c ? c.resolved : 0;
    const disputed = c ? c.disputed : 0;

    return {
      id: u.id,
      name: u.name,
      role: u.role,
      is_active: Boolean(u.is_active),
      picked_up: pickedUp.get(key) || 0,
      resolved,
      confirmed: c ? c.confirmed : 0,
      disputed,
      signed_off: c ? c.signed_off : 0,
      note_revisions: revisions.get(key) || 0,
      // Null, not zero, when nothing has been closed — an officer with no
      // resolutions has no average, and zero would read as "instant".
      avg_days_to_resolve: c && c.avg_days !== null ? Math.round(c.avg_days * 10) / 10 : null,
      score: resolved - disputed
    };
  });
}

// `publicView` is for the landing page, where the board is readable by anyone.
//
// Two things are withheld there, and neither is the dispute count. Publishing
// resolutions while hiding disputes would turn the board back into a pure volume
// ranking — the exact incentive this measure exists to avoid — so a sanitised
// public board would be worse than either publishing all of it or none of it.
//
// What is withheld is personnel information that is nobody's business outside the
// force: deactivated officers (their absence is an employment matter, not a
// performance one) and the note-revision count (an internal oversight signal that
// reads as an accusation without the case context an officer or admin has).
function officerLeaderboard(db, { publicView = false } = {}) {
  let rows = collect(db);

  if (publicView) {
    rows = rows
      .filter((o) => o.is_active)
      .map(({ note_revisions, id, ...rest }) => rest);
  }

  rows.sort((a, b) => {
    if (score(b) !== score(a)) return score(b) - score(a);
    // Tie-break on speed, then name, so the order is stable between requests
    // rather than dependent on row order coming out of SQLite.
    const aSpeed = a.avg_days_to_resolve ?? Infinity;
    const bSpeed = b.avg_days_to_resolve ?? Infinity;
    if (aSpeed !== bSpeed) return aSpeed - bSpeed;
    return a.name.localeCompare(b.name);
  });

  let rank = 0;
  let lastScore = null;
  rows.forEach((row, i) => {
    // Equal scores share a rank rather than being ordered arbitrarily.
    if (row.score !== lastScore) {
      rank = i + 1;
      lastScore = row.score;
    }
    row.rank = row.resolved === 0 && row.picked_up === 0 ? null : rank;
  });

  const totals = rows.reduce((acc, r) => ({
    resolved: acc.resolved + r.resolved,
    confirmed: acc.confirmed + r.confirmed,
    disputed: acc.disputed + r.disputed,
    picked_up: acc.picked_up + r.picked_up
  }), { resolved: 0, confirmed: 0, disputed: 0, picked_up: 0 });

  return { officers: rows, totals };
}

module.exports = { officerLeaderboard };
