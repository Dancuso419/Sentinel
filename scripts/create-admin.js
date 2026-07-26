#!/usr/bin/env node
//
// Provision an administrator account.
//
//   npm run create-admin -- "Admin Grace" admin@example.com
//   npm run create-admin -- "Admin Grace" admin@example.com --reset-password
//
// Admins are deliberately unreachable from the web tier: public registration only
// ever creates citizens, and POST /api/admin/users hard-codes the role to 'officer'.
// That means no stolen session can mint a permanent privileged account — but it also
// means there has to be *some* way in, and this is it.
//
// The credential for running this is shell access to the machine hosting the
// database, which is strictly stronger than any web session. Nothing here is
// reachable over HTTP.
//
// A password is generated and printed once rather than accepted as an argument, so
// it never lands in shell history. --password is available if you need a specific
// one; it warns for that reason.

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createDb } = require('../database/db');
const { isValidEmail, isAcceptablePassword, MIN_PASSWORD_LENGTH } = require('../lib/validators');

const SALT_ROUNDS = 10;
const DB_PATH = path.join(__dirname, '..', 'database', 'ccrts.db');

const article = (role) => (/^[aeiou]/i.test(role) ? 'an' : 'a');

function usage(message) {
  if (message) console.error(`\n  Error: ${message}`);
  console.error(`
  Create an administrator account.

    npm run create-admin -- "<full name>" <email> [options]

  Options
    --reset-password    The email already belongs to an admin: set a new password
                        instead of failing. Use this if an admin password is lost.
    --password <value>  Use this password instead of a generated one.
                        Avoid where possible — it lands in your shell history.

  Examples
    npm run create-admin -- "Admin Grace" grace@example.com
    npm run create-admin -- "Admin Grace" grace@example.com --reset-password
`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const opts = { resetPassword: false, password: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset-password') {
      opts.resetPassword = true;
    } else if (arg === '--password') {
      opts.password = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--')) {
      usage(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  return { positional, opts };
}

// base64url over 18 random bytes: 24 characters, no ambiguous shell-quoting issues.
function generatePassword() {
  return crypto.randomBytes(18).toString('base64url');
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const [name, email] = positional;

  if (positional.length < 2) usage('A name and an email address are both required.');
  if (positional.length > 2) {
    usage('Too many values. Quote the name if it contains spaces: "Admin Grace"');
  }
  if (!name.trim()) usage('Name cannot be blank.');
  if (!isValidEmail(email)) usage(`"${email}" is not a valid email address.`);

  const password = opts.password || generatePassword();
  if (!isAcceptablePassword(password)) {
    usage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const db = createDb(DB_PATH);
  try {
    const existing = db.prepare('SELECT id, name, role FROM users WHERE email = ?').get(email);

    if (existing && !opts.resetPassword) {
      console.error(`\n  Error: ${email} already has ${article(existing.role)} ${existing.role} account.`);
      if (existing.role === 'admin') {
        console.error('  To set a new password for it, re-run with --reset-password.\n');
      } else {
        console.error('  This script only manages admin accounts. Pick a different email.\n');
      }
      process.exit(1);
    }

    // Scoped to admins on purpose. Repointing a citizen or officer account at a new
    // password is a different operation with different consequences, and quietly
    // doing it from a script called create-admin would be a trap.
    if (existing && existing.role !== 'admin') {
      console.error(`\n  Error: ${email} belongs to ${article(existing.role)} ${existing.role}, not an admin.`);
      console.error('  This script will not change the password on a non-admin account.\n');
      process.exit(1);
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, name = ?, is_active = 1 WHERE id = ?')
        .run(password_hash, name.trim(), existing.id);
    } else {
      db.prepare("INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', 1)")
        .run(name.trim(), email, password_hash);
    }

    const verb = existing ? 'Password reset for existing admin' : 'Created administrator';
    console.log(`\n  ${verb}\n`);
    console.log(`    Name      ${name.trim()}`);
    console.log(`    Email     ${email}`);
    console.log(`    Password  ${password}`);
    console.log(`\n  ${opts.password
      ? 'You supplied this password, so it is in your shell history. Consider clearing it.'
      : 'This password is shown once and is not stored anywhere in readable form.'}`);
    console.log('  Sign in at /login.html.\n');
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('\n  Failed to create the admin account:', err.message, '\n');
  process.exit(1);
});
