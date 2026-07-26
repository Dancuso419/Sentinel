const path = require('path');
const bcrypt = require('bcryptjs');
const { createDb } = require('./db');
const { nextCaseId } = require('../lib/caseId');
const { recordEvent, ACTOR_WALKIN, ACTOR_REPORTER } = require('../lib/caseTrail');

// Demo data for a live defence. Every case below is a state the interface has to
// render, so the whole lifecycle can be walked through without anyone typing a
// report first — including the two states that only exist because of the
// verification chain: a resolution the reporter disputed, and a resolution note
// that was revised after the case closed.
//
// DESTRUCTIVE: clears the tables before inserting. Back up ccrts.db first if it
// holds anything worth keeping.

const PASSWORD = 'Passw0rd!';

function clear(db) {
  // Children before parents: status_history references reports, reports references users.
  db.exec('DELETE FROM status_history');
  db.exec('DELETE FROM reports');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM case_counters');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('users','reports','status_history')");
}

// created_at/updated_at default to datetime('now'), which would stack every case on
// today and flatten the "reports filed by day" chart. Set explicitly so the demo has
// a shape to point at, and relative to today so it never goes stale.
function daysAgo(n, time = '10:00:00') {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.toISOString().slice(0, 10)} ${time}`;
}

function incidentAt(n, time = 'T09:30') {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.toISOString().slice(0, 10)}${time}`;
}

async function seed() {
  const db = createDb(path.join(__dirname, 'ccrts.db'));
  clear(db);

  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)'
  );

  const chinedu = insertUser.run('Chinedu Okafor', 'citizen@example.com', password_hash, 'citizen', 1).lastInsertRowid;
  const ifeoma = insertUser.run('Ifeoma Eze', 'ify@example.com', password_hash, 'citizen', 1).lastInsertRowid;
  const bello = insertUser.run('Officer Bello', 'officer@example.com', password_hash, 'officer', 1).lastInsertRowid;
  // One deactivated officer, so the admin roster shows both access states.
  insertUser.run('Officer Nwosu', 'nwosu@example.com', password_hash, 'officer', 0);
  const grace = insertUser.run('Admin Grace', 'admin@example.com', password_hash, 'admin', 1).lastInsertRowid;

  const insertReport = db.prepare(`
    INSERT INTO reports (case_id, citizen_id, is_anonymous, type, location, description,
                         incident_time, status, resolution_note, reporter_relationship,
                         reporter_verdict, reporter_verdict_note, reporter_verdict_at,
                         reviewed_by, reviewed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const year = new Date().getFullYear();

  function addCase(c) {
    const case_id = nextCaseId(db, year);
    const filed = daysAgo(c.filedDaysAgo);
    const touched = daysAgo(c.touchedDaysAgo ?? c.filedDaysAgo);

    const id = insertReport.run(
      case_id,
      c.citizen_id ?? null,
      c.is_anonymous ? 1 : 0,
      c.type,
      c.location,
      c.description,
      incidentAt(c.filedDaysAgo),
      c.status,
      c.resolution_note ?? null,
      c.reporter_relationship,
      c.reporter_verdict ?? null,
      c.reporter_verdict_note ?? null,
      c.reporter_verdict ? daysAgo(c.touchedDaysAgo, '14:20:00') : null,
      c.reviewed ? grace : null,
      c.reviewed ? daysAgo(c.touchedDaysAgo, '16:05:00') : null,
      filed,
      touched
    ).lastInsertRowid;

    // The trail is rebuilt event by event rather than faked, so the timeline shown
    // is the same shape the running system produces.
    recordEvent(db, {
      reportId: id,
      status: 'pending',
      event: 'status',
      actor: c.citizen_id ? c.citizen_id : ACTOR_WALKIN
    });

    if (c.status === 'investigating' || c.status === 'resolved') {
      recordEvent(db, { reportId: id, status: 'investigating', event: 'status', actor: bello });
    }
    if (c.status === 'resolved') {
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'status',
        detail: c.original_note ?? c.resolution_note,
        actor: bello
      });
    }
    if (c.original_note) {
      // The note was revised after the case closed. This is the case that shows the
      // trail catching something the manual system could not.
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'note',
        detail: c.resolution_note,
        actor: bello
      });
    }
    if (c.reporter_verdict) {
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'verdict',
        detail: c.reporter_verdict_note
          ? `${c.reporter_verdict}: ${c.reporter_verdict_note}`
          : c.reporter_verdict,
        actor: ACTOR_REPORTER
      });
    }
    if (c.reviewed) {
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'review',
        detail: 'Note and reporter response both checked against the file.',
        actor: grace
      });
    }

    return case_id;
  }

  const cases = [
    {
      citizen_id: chinedu, is_anonymous: 0, reporter_relationship: 'affected',
      type: 'Theft', location: 'Main Market, Aba',
      description: 'Phone taken from my stall while I was serving a customer.',
      status: 'pending', filedDaysAgo: 1
    },
    {
      citizen_id: null, is_anonymous: 1, reporter_relationship: 'witness',
      type: 'Vandalism', location: 'School Gate',
      description: 'Two men broke the perimeter fence overnight. I did not want to give my name.',
      status: 'investigating', filedDaysAgo: 3, touchedDaysAgo: 2
    },
    {
      citizen_id: chinedu, is_anonymous: 0, reporter_relationship: 'affected',
      type: 'Assault', location: 'Bank Road',
      description: 'Physical altercation outside the bank entrance.',
      status: 'resolved', filedDaysAgo: 9, touchedDaysAgo: 5,
      resolution_note: 'Suspect identified and handed to the local authority.',
      reporter_verdict: 'confirmed',
      reporter_verdict_note: 'Yes, an officer came and took a statement.',
      reviewed: true
    },
    {
      citizen_id: ifeoma, is_anonymous: 0, reporter_relationship: 'affected',
      type: 'Fraud', location: 'Ariaria Market',
      description: 'Paid for goods by transfer and the seller closed the shop the next day.',
      status: 'resolved', filedDaysAgo: 7, touchedDaysAgo: 3,
      resolution_note: 'Seller could not be traced at the address given. Case closed.',
      reporter_verdict: 'disputed',
      reporter_verdict_note: 'The seller is still trading at the same shop. Nobody contacted me.'
    },
    {
      citizen_id: null, is_anonymous: 1, reporter_relationship: 'witness',
      type: 'Theft', location: 'Ngwa Road',
      description: 'Saw a bag snatched from a parked car. Reporting as a passer-by.',
      status: 'resolved', filedDaysAgo: 6, touchedDaysAgo: 2,
      resolution_note: 'Bag recovered nearby and returned to the owner.'
    },
    {
      citizen_id: chinedu, is_anonymous: 0, reporter_relationship: 'affected',
      type: 'Vandalism', location: 'Faulks Road',
      description: 'Shop shutter damaged during the night.',
      status: 'resolved', filedDaysAgo: 4, touchedDaysAgo: 1,
      original_note: 'Two suspects cautioned and the shutter repaired at their cost.',
      resolution_note: 'No further action taken.'
    }
  ];

  const ids = cases.map(addCase);

  console.log('Seeded Sentinel demo data.\n');
  console.log(`  Accounts (password: ${PASSWORD})`);
  console.log('    citizen@example.com   Chinedu Okafor    citizen');
  console.log('    ify@example.com       Ifeoma Eze        citizen');
  console.log('    officer@example.com   Officer Bello     officer');
  console.log('    nwosu@example.com     Officer Nwosu     officer (deactivated)');
  console.log('    admin@example.com     Admin Grace       admin\n');
  console.log('  Cases');
  console.log(`    ${ids[0]}  pending        filed by a citizen`);
  console.log(`    ${ids[1]}  investigating  anonymous walk-in, witness`);
  console.log(`    ${ids[2]}  resolved       confirmed by reporter, signed off`);
  console.log(`    ${ids[3]}  resolved       DISPUTED by reporter, awaiting sign-off`);
  console.log(`    ${ids[4]}  resolved       walk-in witness, no response, awaiting sign-off`);
  console.log(`    ${ids[5]}  resolved       resolution note was revised — see the trail`);

  db.close();
}

seed();
