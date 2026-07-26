# Demo accounts and walkthrough

Every account below is created by `npm run seed`. All of them are fictional.

```bash
npm run seed      # DESTROYS the current database and reloads this data
npm start         # http://localhost:3000
```

## The password

**Every account uses the same password:**

```
Passw0rd!
```

This is a demonstration convenience, not a design choice. In real use each account
would set its own from the account page, and `scripts/create-admin.js` generates a
random one precisely so that shared passwords do not happen.

---

## Accounts

### Administrator — 1

| Email | Name | Status |
|---|---|---|
| `admin@example.com` | Admin Grace | Active |

Signs in to **Oversight**. Sees analytics, the sign-off queue, officer standings, both
rosters, and can create officer accounts. Also holds officer permissions, so she can
work the case queue — the queue tells her so when she does.

### Officers — 5

| Email | Name | Status | Case work |
|---|---|---|---|
| `officer@example.com` | Officer Bello | Active | 10 picked up, 8 closed, **0 disputed** |
| `adaeze@example.com` | Officer Adaeze Umeh | Active | 12 picked up, 10 closed, 2 disputed |
| `musa@example.com` | Officer Musa Danladi | Active | 6 picked up, 5 closed, 1 disputed |
| `chika@example.com` | Officer Chika Obi | Active | 3 picked up, 2 closed, 0 disputed |
| `nwosu@example.com` | Officer Nwosu | **Deactivated** | 1 closed, before access was withdrawn |

`nwosu@example.com` **cannot sign in** — the login returns *"Account is deactivated"*.
That is intentional: it demonstrates account control, and that a deactivated officer's
past work is still on the standings board.

**The seeded officers above are not prompted to change their password.** The
first-login requirement applies to accounts an admin provisions, where the password
was chosen by someone else; seeded demo accounts would only break the walkthrough. To
see it, create an officer from the admin page and sign in as them — see step 5 below.

### Citizens — 5

| Email | Name | Notable |
|---|---|---|
| `citizen@example.com` | Chinedu Okafor | The busiest reporter — a pending case, an investigating case, and several resolved |
| `ify@example.com` | Ifeoma Eze | Filed **CR-2026-0014**, which she disputed |
| `emeka@example.com` | Emeka Nwankwo | Mixed open and closed cases |
| `blessing@example.com` | Blessing Adeyemi | Mixed open and closed cases |
| `tunde@example.com` | Tunde Bakare | Filed **CR-2026-0017** (disputed) and **CR-2026-0024** (revised note) |

---

## The data

**38 cases** — 6 pending, 6 investigating, 26 resolved. Eleven are anonymous walk-ins
with no account attached at all. Dates are spread over the last five weeks and are
computed relative to today, so the charts always have shape and never go stale.

### Cases worth opening

| Case ID | Why it is interesting |
|---|---|
| **CR-2026-0024** | An officer closed it, then **rewrote the resolution note afterwards**. Open the trail. |
| **CR-2026-0014** | Ifeoma **disputed** the resolution. Top of the admin sign-off queue, flagged red. |
| **CR-2026-0017** | Second dispute — Tunde says names were given and never followed up. |
| **CR-2026-0031** | Third dispute, this one against Officer Musa. |
| **CR-2026-0013** | The **complete chain**: resolved → confirmed by reporter → signed off by admin. |
| **CR-2026-0015** | Walk-in, resolved, **not yet answered and not yet signed off** — confirm or dispute it publicly with just the ID, then watch it reach the admin queue. |
| **CR-2026-0001** | Pending and citizen-filed, so Edit and Withdraw are both live. |
| **CR-2026-0002** | Pending anonymous walk-in, filed by a **witness** rather than a victim. |

`CR-2026-0033` is a second walk-in in the same unanswered, unsigned state, so the
walkthrough can be run twice without reseeding.

Other resolved walk-ins (`CR-2026-0018`, `CR-2026-0021`, `CR-2026-0025`,
`CR-2026-0028`) are still open to a public verdict but have already been signed off,
so answering them will not move anything into the admin queue.

---

## A 10-minute walkthrough

### 1. The public path — no account (2 min)

Open `http://localhost:3000`.

- The five tiles read live from the database. They are not hard-coded.
- Scroll to **Try it — track a case** and enter `CR-2026-0013`. The trail fills in and
  names the officer who handled it. That is a real query, not a mock.
- Keep scrolling to **Who is working these cases** — the officer standings, public and
  with no login. Adaeze leads on 10 closures to Bello's 8, but they are level on score
  because two of hers were disputed. Officer Nwosu is absent: deactivated officers are
  withheld from the public board.
- Click **Report an incident**. Note the *"Were you the one affected?"* question — the
  answer decides how much your later confirmation is worth.
- Submit it. The case ID appears **once**, in black, with a copy button.

### 2. Verify a resolution with only a case ID (1 min)

Go to **Track**, enter `CR-2026-0015` — a resolved walk-in nobody has answered yet.

The handling officer is named, and you are asked **"Does this match what happened?"**
Dispute it. Now sign in as `admin@example.com` and it is sitting at the top of the
sign-off queue in red.

### 3. The officer queue (2 min)

Sign in as `officer@example.com`.

- Click the **Pending** tile — the queue filters to it.
- Find `CR-2026-0024` and press **Trail**. The log shows the case resolved with
  *"Two suspects cautioned and the shutter repaired at their cost"*, then a separate
  **note** event revising it to *"No further action taken."* Both are kept, both
  timestamped, both attributed. **This is the answer to "how do you know the officer
  actually solved it?"**
- Any resolved case a reporter rejected carries a red **Disputed by reporter** pill in
  the queue itself, not hidden behind an expander.

### 4. Officer standings (2 min)

Open **Standings** from the rail.

Adaeze closed **10** cases; Bello closed **8**. Adaeze is not ahead on that basis —
they are **level on score**, because two of hers were disputed and none of Bello's
were. The tie is broken on speed only.

Under each officer, a three-part bar shows what became of their closures: confirmed,
unanswered, disputed.

### 5. Oversight (2 min)

Sign in as `admin@example.com`.

- Headcounts, then **Where the case load sits** — the bars are real proportions.
- **Sign-off queue**: three disputed cases first, then resolutions nobody answered.
  Sign one off and watch the queue and the counts update together.
- **Add an officer**: create one with any starting password, then sign in as them in a
  private window. You will be sent straight to the account page and told to set your
  own password — the queue, the standings and everything else stay closed until you
  do. That is enforced on the server, so it holds even if you go to
  `officer-dashboard.html` directly. Set a password and the dashboard opens on the
  same session, no second sign-in.
- **Citizen accounts**: names, emails, join dates — and deliberately **no report
  counts**, because an admin can already read the whole queue and a per-person count
  would let an anonymous report be traced back to a person.

### 6. Account (1 min)

Any signed-in user: click the account chip at the bottom of the rail. Name, email,
role, join date, and a password change that requires the current one. Toggle the
sidebar with the chevron; it remembers the setting.

---

## Creating your own admin

There is no way to do this through the web interface, by design — no HTTP endpoint
can create an administrator, so a stolen admin session cannot mint a backdoor.

```bash
npm run create-admin -- "Your Name" you@example.com
```

The password is generated and printed **once**. Lost an admin password?

```bash
npm run create-admin -- "Your Name" you@example.com --reset-password
```

It refuses to touch citizen or officer accounts.

---

## Resetting

```bash
npm run seed
```

Rebuilds everything above from scratch. It **deletes all existing data** — back up
`database/ccrts.db` first if you have been entering your own reports.
