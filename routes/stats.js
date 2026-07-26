const express = require('express');
const { officerLeaderboard } = require('../lib/officerStats');

const router = express.Router();

// Public, unauthenticated system overview.
//
// This endpoint is deliberately aggregate-only: counts and nothing else. It
// never returns case IDs, identities, locations, descriptions, or dates that
// could be correlated back to an individual report. That restraint is the
// reason it is safe to expose without a session — see PRODUCT.md's first
// principle (anonymity is load-bearing) and the case-ID enumeration fix in
// routes/reports.js, which this endpoint must not quietly undo by leaking
// which cases exist.
router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;

    const total = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n;
    const byStatus = db.prepare(
      'SELECT status, COUNT(*) AS n FROM reports GROUP BY status'
    ).all();

    const counts = { pending: 0, investigating: 0, resolved: 0 };
    for (const row of byStatus) {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
        counts[row.status] = row.n;
      }
    }

    // Distinct incident categories currently on record — a count, never the
    // category names paired with anything identifying.
    const categories = db.prepare(
      'SELECT COUNT(DISTINCT type) AS n FROM reports'
    ).get().n;

    res.json({
      total,
      pending: counts.pending,
      investigating: counts.investigating,
      resolved: counts.resolved,
      categories
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public officer standings, shown on the landing page.
//
// This is the one endpoint in the system that publishes staff names alongside a
// performance measure, and it does so deliberately: a citizen deciding whether to
// report at all is entitled to see whether resolutions here hold up. It carries no
// citizen data of any kind — no case IDs, no reporters, no locations.
//
// See officerLeaderboard's publicView note for what is withheld and why.
router.get('/standings', (req, res) => {
  try {
    res.json(officerLeaderboard(req.app.locals.db, { publicView: true }));
  } catch (err) {
    console.error('GET /api/stats/standings failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
