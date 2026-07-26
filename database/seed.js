const path = require('path');
const bcrypt = require('bcryptjs');
const { createDb } = require('./db');
const { nextCaseId } = require('../lib/caseId');
const { recordEvent, ACTOR_WALKIN, ACTOR_REPORTER } = require('../lib/caseTrail');

// Demo data for a live defence.
//
// Two jobs. First, cover every state the interface has to render, so the whole
// lifecycle can be walked through without anyone typing a report — including the
// states that only exist because of the verification chain: a resolution the
// reporter disputed, and a resolution note revised after the case closed.
//
// Second, give the officer standings something honest to rank. The distribution
// below is deliberate: Adaeze closes the most cases but collects disputes, Bello
// closes slightly fewer with none. They finish level on score, which is the point
// — raw volume is not performance.
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

// Timestamps default to datetime('now'), which would stack every case on today,
// flatten the "filed by day" chart and make time-to-resolve meaningless. These are
// explicit, and relative to today so the demo never goes stale.
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
  const mk = (name, email, role, active = 1) =>
    insertUser.run(name, email, password_hash, role, active).lastInsertRowid;

  const citizens = {
    chinedu: mk('Chinedu Okafor', 'citizen@example.com', 'citizen'),
    ifeoma: mk('Ifeoma Eze', 'ify@example.com', 'citizen'),
    emeka: mk('Emeka Nwankwo', 'emeka@example.com', 'citizen'),
    blessing: mk('Blessing Adeyemi', 'blessing@example.com', 'citizen'),
    tunde: mk('Tunde Bakare', 'tunde@example.com', 'citizen')
  };

  const officers = {
    bello: mk('Officer Bello', 'officer@example.com', 'officer'),
    adaeze: mk('Officer Adaeze Umeh', 'adaeze@example.com', 'officer'),
    musa: mk('Officer Musa Danladi', 'musa@example.com', 'officer'),
    chika: mk('Officer Chika Obi', 'chika@example.com', 'officer'),
    // Deactivated: the admin roster needs both access states, and the standings
    // need to show that past work does not vanish when access is withdrawn.
    nwosu: mk('Officer Nwosu', 'nwosu@example.com', 'officer', 0)
  };

  const grace = mk('Admin Grace', 'admin@example.com', 'admin');

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
    const filed = daysAgo(c.filed);
    const pickedUp = c.pickedUp !== undefined ? daysAgo(c.pickedUp, '11:15:00') : null;
    const closed = c.closed !== undefined ? daysAgo(c.closed, '15:40:00') : null;
    const touched = closed || pickedUp || filed;

    const id = insertReport.run(
      case_id,
      c.reporter ?? null,
      c.reporter ? (c.hideName ? 1 : 0) : 1,
      c.type,
      c.location,
      c.description,
      incidentAt(c.filed),
      c.status,
      c.note ?? null,
      c.relationship,
      c.verdict ?? null,
      c.verdictNote ?? null,
      c.verdict ? daysAgo(c.closed - 1 >= 0 ? c.closed - 1 : 0, '14:20:00') : null,
      c.reviewed ? grace : null,
      c.reviewed ? daysAgo(c.closed - 1 >= 0 ? c.closed - 1 : 0, '16:05:00') : null,
      filed,
      touched
    ).lastInsertRowid;

    // Rebuilt event by event rather than faked, so the timeline is the same shape
    // the running system produces.
    recordEvent(db, {
      reportId: id,
      status: 'pending',
      event: 'status',
      actor: c.reporter ? c.reporter : ACTOR_WALKIN,
      at: filed
    });

    if (c.status === 'investigating' || c.status === 'resolved') {
      recordEvent(db, {
        reportId: id, status: 'investigating', event: 'status', actor: c.officer, at: pickedUp
      });
    }
    if (c.status === 'resolved') {
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'status',
        detail: c.originalNote ?? c.note,
        actor: c.officer,
        at: closed
      });
    }
    if (c.originalNote) {
      // The note was revised after the case closed. This is the case that shows the
      // trail catching something the manual system could not.
      recordEvent(db, {
        reportId: id, status: 'resolved', event: 'note', detail: c.note, actor: c.officer,
        at: daysAgo(Math.max(c.closed - 1, 0), '09:05:00')
      });
    }
    if (c.verdict) {
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'verdict',
        detail: c.verdictNote ? `${c.verdict}: ${c.verdictNote}` : c.verdict,
        actor: ACTOR_REPORTER,
        at: daysAgo(Math.max(c.closed - 1, 0), '14:20:00')
      });
    }
    if (c.reviewed) {
      recordEvent(db, {
        reportId: id,
        status: 'resolved',
        event: 'review',
        detail: 'Note and reporter response both checked against the file.',
        actor: grace,
        at: daysAgo(Math.max(c.closed - 1, 0), '16:05:00')
      });
    }

    return case_id;
  }

  const A = 'affected';
  const W = 'witness';

  // --- open work ---------------------------------------------------------
  const openCases = [
    { reporter: citizens.chinedu, relationship: A, type: 'Theft', location: 'Main Market, Aba',
      description: 'Phone taken from my stall while I was serving a customer.',
      status: 'pending', filed: 1 },
    { reporter: null, relationship: W, type: 'Vandalism', location: 'School Gate',
      description: 'Two men broke the perimeter fence overnight. I did not want to give my name.',
      status: 'pending', filed: 1 },
    { reporter: citizens.emeka, relationship: A, type: 'Fraud', location: 'Jubilee Road',
      description: 'Paid a deposit for a generator that was never delivered.',
      status: 'pending', filed: 2 },
    { reporter: citizens.blessing, relationship: A, type: 'Theft', location: 'Cemetery Road',
      description: 'Handbag snatched from an okada while in traffic.',
      status: 'pending', filed: 3 },
    { reporter: null, relationship: W, type: 'Assault', location: 'Ohanku Road',
      description: 'A fight outside a bar, one man was badly hurt. Reporting as a passer-by.',
      status: 'pending', filed: 4 },
    { reporter: citizens.tunde, relationship: A, type: 'Other', location: 'Park Road',
      description: 'Persistent threats from a former business partner.',
      status: 'pending', filed: 5 },

    { reporter: citizens.ifeoma, relationship: A, type: 'Theft', location: 'Ariaria Market',
      description: 'Goods taken from my shop overnight, padlock cut.',
      status: 'investigating', filed: 6, pickedUp: 5, officer: officers.adaeze },
    { reporter: null, relationship: W, type: 'Vandalism', location: 'Asa Road',
      description: 'Street lights smashed along the junction.',
      status: 'investigating', filed: 7, pickedUp: 6, officer: officers.adaeze },
    { reporter: citizens.chinedu, relationship: A, type: 'Fraud', location: 'Bank Road',
      description: 'Card cloned after using an ATM at this location.',
      status: 'investigating', filed: 8, pickedUp: 6, officer: officers.bello },
    { reporter: citizens.emeka, relationship: A, type: 'Assault', location: 'Eziukwu Road',
      description: 'Attacked while closing my shop.',
      status: 'investigating', filed: 9, pickedUp: 7, officer: officers.bello },
    { reporter: null, relationship: W, type: 'Theft', location: 'Ngwa Road',
      description: 'Saw a car window broken and a bag taken.',
      status: 'investigating', filed: 10, pickedUp: 8, officer: officers.musa },
    { reporter: citizens.blessing, relationship: A, type: 'Other', location: 'Brass Street',
      description: 'Repeated night-time noise and intimidation from a neighbour.',
      status: 'investigating', filed: 11, pickedUp: 9, officer: officers.chika }
  ];

  // --- Officer Adaeze Umeh: highest volume, but collects disputes ---------
  const adaeze = [
    { reporter: citizens.chinedu, relationship: A, type: 'Assault', location: 'Bank Road',
      description: 'Physical altercation outside the bank entrance.',
      note: 'Suspect identified and handed to the local authority.',
      verdict: 'confirmed', verdictNote: 'Yes, an officer came and took a statement.',
      reviewed: true, filed: 20, pickedUp: 19, closed: 16 },
    { reporter: citizens.ifeoma, relationship: A, type: 'Fraud', location: 'Ariaria Market',
      description: 'Paid for goods by transfer and the seller closed the shop the next day.',
      note: 'Seller could not be traced at the address given. Case closed.',
      verdict: 'disputed', verdictNote: 'The seller is still trading at the same shop. Nobody contacted me.',
      filed: 18, pickedUp: 17, closed: 14 },
    // Deliberately left unverified AND unsigned: the walkthrough needs a walk-in
    // case a visitor can answer with nothing but the case ID, then watch arrive in
    // the admin's sign-off queue.
    { reporter: null, relationship: W, type: 'Theft', location: 'Ngwa Road',
      description: 'Saw a bag snatched from a parked car.',
      note: 'Bag recovered nearby and returned to the owner.',
      filed: 17, pickedUp: 16, closed: 15 },
    { reporter: citizens.emeka, relationship: A, type: 'Theft', location: 'Faulks Road',
      description: 'Motorcycle taken from outside my house.',
      note: 'Recovered at a mechanic workshop. Returned to owner.',
      verdict: 'confirmed', reviewed: true, filed: 22, pickedUp: 21, closed: 19 },
    { reporter: citizens.tunde, relationship: A, type: 'Vandalism', location: 'Milverton Avenue',
      description: 'Wall of my compound defaced overnight.',
      note: 'No suspect identified. Closed for lack of evidence.',
      verdict: 'disputed', verdictNote: 'I gave two names and nobody followed up.',
      filed: 15, pickedUp: 14, closed: 12 },
    { reporter: null, relationship: W, type: 'Assault', location: 'Osusu Road',
      description: 'Saw a woman being harassed near the junction.',
      note: 'Both parties spoken to. No complaint pursued.',
      reviewed: true, filed: 24, pickedUp: 23, closed: 21 },
    { reporter: citizens.blessing, relationship: A, type: 'Fraud', location: 'Aba Town Hall',
      description: 'Charged a fee for a document that should have been free.',
      note: 'Fee refunded and the officer involved reported to their unit.',
      verdict: 'confirmed', reviewed: true, filed: 26, pickedUp: 25, closed: 22 },
    { reporter: citizens.chinedu, relationship: A, type: 'Theft', location: 'Main Market, Aba',
      description: 'Cash taken from the stall while I stepped away.',
      note: 'Reviewed market CCTV, no usable footage. Closed.',
      verdict: 'confirmed', filed: 28, pickedUp: 27, closed: 24 },
    { reporter: null, relationship: W, type: 'Vandalism', location: 'St Michael\'s Road',
      description: 'Church noticeboard destroyed.',
      note: 'Two youths cautioned and the board replaced at their cost.',
      reviewed: true, filed: 30, pickedUp: 29, closed: 26 },
    { reporter: citizens.ifeoma, relationship: A, type: 'Other', location: 'Umuahia Road',
      description: 'Threatening messages after a market dispute.',
      note: 'Parties reconciled at the station. Undertaking signed.',
      verdict: 'confirmed', reviewed: true, filed: 32, pickedUp: 31, closed: 28 }
  ].map((c) => ({ ...c, status: 'resolved', officer: officers.adaeze }));

  // --- Officer Bello: fewer closures, no disputes -------------------------
  const bello = [
    { reporter: citizens.emeka, relationship: A, type: 'Theft', location: 'Cemetery Road',
      description: 'Laptop taken during a break-in.',
      note: 'Recovered from a second-hand dealer and returned.',
      verdict: 'confirmed', reviewed: true, filed: 21, pickedUp: 20, closed: 16 },
    { reporter: citizens.tunde, relationship: A, type: 'Vandalism', location: 'Faulks Road',
      description: 'Shop shutter damaged during the night.',
      // Revised after closing — the case that demonstrates the tamper-evident trail.
      originalNote: 'Two suspects cautioned and the shutter repaired at their cost.',
      note: 'No further action taken.',
      filed: 14, pickedUp: 13, closed: 10 },
    { reporter: null, relationship: W, type: 'Assault', location: 'Jubilee Road',
      description: 'Witnessed a robbery on a passenger.',
      note: 'Two arrests made. File passed to the prosecutor.',
      reviewed: true, filed: 23, pickedUp: 22, closed: 18 },
    { reporter: citizens.blessing, relationship: A, type: 'Fraud', location: 'Asa Road',
      description: 'Sold a phone that turned out to be stolen.',
      note: 'Phone returned to its registered owner, seller charged.',
      verdict: 'confirmed', reviewed: true, filed: 25, pickedUp: 24, closed: 20 },
    { reporter: citizens.chinedu, relationship: A, type: 'Theft', location: 'Park Road',
      description: 'Generator taken from outside the shop.',
      note: 'Recovered the same week. Returned to owner.',
      verdict: 'confirmed', reviewed: true, filed: 27, pickedUp: 26, closed: 23 },
    { reporter: null, relationship: W, type: 'Other', location: 'Brass Street',
      description: 'Reporting a dangerous open drain nobody had acted on.',
      note: 'Referred to the local council and barriers put up.',
      reviewed: true, filed: 29, pickedUp: 28, closed: 25 },
    { reporter: citizens.ifeoma, relationship: A, type: 'Assault', location: 'Ohanku Road',
      description: 'Assaulted by a customer over a price dispute.',
      note: 'Suspect arrested and bound over to keep the peace.',
      verdict: 'confirmed', reviewed: true, filed: 31, pickedUp: 30, closed: 27 },
    { reporter: citizens.emeka, relationship: A, type: 'Vandalism', location: 'Eziukwu Road',
      description: 'Car windscreen smashed while parked.',
      note: 'Suspect identified from a neighbour\'s camera and charged.',
      verdict: 'confirmed', reviewed: true, filed: 34, pickedUp: 33, closed: 30 }
  ].map((c) => ({ ...c, status: 'resolved', officer: officers.bello }));

  // --- Officer Musa Danladi: steady middle ---------------------------------
  const musa = [
    { reporter: citizens.tunde, relationship: A, type: 'Theft', location: 'Osusu Road',
      description: 'Tools taken from a locked van.',
      note: 'No suspect. Closed pending new information.',
      verdict: 'disputed', verdictNote: 'The van was never even examined.',
      filed: 19, pickedUp: 18, closed: 13 },
    { reporter: citizens.blessing, relationship: A, type: 'Fraud', location: 'Main Market, Aba',
      description: 'Counterfeit notes passed at my stall.',
      note: 'Notes seized and passed to the bank for examination.',
      verdict: 'confirmed', reviewed: true, filed: 24, pickedUp: 23, closed: 20 },
    // Second unverified, unsigned walk-in, so the walkthrough has a spare.
    { reporter: null, relationship: W, type: 'Vandalism', location: 'Ngwa Road',
      description: 'Bus stop shelter destroyed overnight.',
      note: 'Repaired by the council. No suspect identified.',
      filed: 26, pickedUp: 25, closed: 22 },
    { reporter: citizens.chinedu, relationship: A, type: 'Assault', location: 'Aba Town Hall',
      description: 'Pushed and threatened during a queue dispute.',
      note: 'Both parties spoken to, apology given and accepted.',
      verdict: 'confirmed', reviewed: true, filed: 30, pickedUp: 29, closed: 26 },
    { reporter: citizens.emeka, relationship: A, type: 'Theft', location: 'Milverton Avenue',
      description: 'Solar panels taken from the roof.',
      note: 'Two recovered from a market trader, one still missing.',
      verdict: 'confirmed', filed: 33, pickedUp: 32, closed: 29 }
  ].map((c) => ({ ...c, status: 'resolved', officer: officers.musa }));

  // --- Officer Chika Obi: newest, low volume -------------------------------
  const chika = [
    { reporter: citizens.ifeoma, relationship: A, type: 'Theft', location: 'Jubilee Road',
      description: 'Purse taken on a crowded bus.',
      note: 'No suspect identified. Closed.',
      reviewed: true, filed: 12, pickedUp: 11, closed: 8 },
    { reporter: null, relationship: W, type: 'Other', location: 'Cemetery Road',
      description: 'Abandoned vehicle being stripped for parts.',
      note: 'Vehicle removed and owner traced.',
      verdict: 'confirmed', reviewed: true, filed: 16, pickedUp: 15, closed: 11 }
  ].map((c) => ({ ...c, status: 'resolved', officer: officers.chika }));

  // --- Officer Nwosu: deactivated, but the record of past work remains ------
  const nwosu = [
    { reporter: citizens.tunde, relationship: A, type: 'Vandalism', location: 'Park Road',
      description: 'Fence panels pulled down.',
      note: 'Repaired privately, complainant did not wish to proceed.',
      reviewed: true, filed: 38, pickedUp: 37, closed: 34 }
  ].map((c) => ({ ...c, status: 'resolved', officer: officers.nwosu }));

  const all = [...openCases, ...adaeze, ...bello, ...musa, ...chika, ...nwosu];
  all.forEach(addCase);

  const counts = db.prepare('SELECT status, COUNT(*) AS n FROM reports GROUP BY status').all();

  console.log('\n  Seeded Sentinel demo data.\n');
  console.log(`  ${all.length} cases: ${counts.map((c) => `${c.n} ${c.status}`).join(', ')}`);
  console.log(`  ${Object.keys(citizens).length} citizens, ${Object.keys(officers).length} officers (1 deactivated), 1 admin`);
  console.log(`\n  All accounts use the password: ${PASSWORD}`);
  console.log('  Full account list and walkthrough: DEMO-ACCOUNTS.md\n');

  db.close();
}

seed();
