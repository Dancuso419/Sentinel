const path = require('path');
const bcrypt = require('bcryptjs');
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
