# Demo accounts and a guided tour

Everything on this page is created by one command, and **every name, account and case
here is invented.** No real person or crime appears anywhere in it.

New to the project? Start with **[README.md](README.md)** — it covers installing
Node.js, opening a terminal, and getting Sentinel running.

```bash
npm run seed      # loads the demo data — erases anything already there
npm start         # then open http://localhost:3000
```

---

## The password

**Every demo account uses the same password:**

```
Passw0rd!
```

Capital P, zero instead of the letter o, exclamation mark at the end.

This is a convenience for demonstrating, not how the system is meant to work. In real
use each person sets their own from their account page, and the tool that creates
administrators generates a random password precisely so that shared ones never happen.

---

## The accounts

`npm run seed` creates **11 accounts**: one administrator, five officers, five
citizens.

### Administrator

| Email | Name |
|---|---|
| `admin@example.com` | Admin Grace |

Signs in to the **Oversight** screen: analytics, the sign-off queue, officer
standings, both lists of people, and the form for creating officer accounts. She also
holds officer permissions, so she can work the case queue — and the queue tells her so
when she does.

### Officers

| Email | Name | Can sign in? | Their record |
|---|---|---|---|
| `officer@example.com` | Officer Bello | Yes | 10 picked up, 8 closed, **0 disputed** |
| `adaeze@example.com` | Officer Adaeze Umeh | Yes | 12 picked up, 10 closed, 2 disputed |
| `musa@example.com` | Officer Musa Danladi | Yes | 6 picked up, 5 closed, 1 disputed |
| `chika@example.com` | Officer Chika Obi | Yes | 3 picked up, 2 closed, 0 disputed |
| `nwosu@example.com` | Officer Nwosu | **No** | 1 closed, before access was withdrawn |

**Officer Nwosu cannot sign in** — the login says *"Account is deactivated"*. That is
intentional, and worth showing: it demonstrates that access can be withdrawn, and that
a former officer's past work stays on the standings board rather than vanishing.

> **The demo officers are not asked to change their password.** That requirement
> applies to accounts an administrator creates, where somebody else chose the password.
> Applying it to the demo accounts would just block the tour. To see it working, create
> an officer yourself — that is step 5 below.

### Citizens

| Email | Name | Worth knowing |
|---|---|---|
| `citizen@example.com` | Chinedu Okafor | The busiest reporter — one pending case, one being investigated, several resolved |
| `ify@example.com` | Ifeoma Eze | Filed **CR-2026-0014**, and disputed the outcome |
| `emeka@example.com` | Emeka Nwankwo | A mix of open and closed cases |
| `blessing@example.com` | Blessing Adeyemi | A mix of open and closed cases |
| `tunde@example.com` | Tunde Bakare | Filed **CR-2026-0017** (disputed) and **CR-2026-0024** (rewritten explanation) |

---

## The demo data

**38 crime reports** — 6 pending, 6 being investigated, 26 resolved. Eleven of them
are anonymous, with no account attached at all.

The dates are spread across the last five weeks and are calculated relative to
whatever today is, so the charts always have a sensible shape and the demo never looks
stale.

### Cases worth opening

| Case number | Why it is interesting |
|---|---|
| **CR-2026-0024** | An officer closed it, then **rewrote their explanation afterwards.** Open the history. This is the single best illustration of what the system is for. |
| **CR-2026-0014** | Ifeoma **disputed** the outcome. Sits at the top of the administrator's sign-off queue, flagged in red. |
| **CR-2026-0017** | A second dispute — Tunde says names were given and never followed up. |
| **CR-2026-0031** | A third dispute, this one against Officer Musa. |
| **CR-2026-0013** | The **complete chain**: resolved → confirmed by the reporter → signed off by the administrator. |
| **CR-2026-0015** | Anonymous, resolved, **nobody has answered it and nobody has signed it off.** Confirm or dispute it using just the number, then watch it appear in the administrator's queue. |
| **CR-2026-0001** | Pending and filed by a citizen, so Edit and Withdraw are both available. |
| **CR-2026-0002** | Pending, anonymous, and filed by a **witness** rather than a victim. |

`CR-2026-0033` is a second anonymous case in the same unanswered state, so you can run
the tour twice without reloading the data.

Four other resolved anonymous cases (`CR-2026-0018`, `CR-2026-0021`, `CR-2026-0025`,
`CR-2026-0028`) can still be answered publicly, but have already been signed off — so
answering them will not move anything into the administrator's queue.

---

## A ten-minute tour

### 1. The public path, with no account (2 min)

Open **http://localhost:3000**.

- The five tiles across the top are read from the real database. They are not
  hard-coded numbers.
- Scroll to **Try it — track a case** and enter `CR-2026-0013`. The history fills in
  and names the officer who handled it. That is a real lookup, not a mock-up.
- Keep scrolling to **Who is working these cases** — the officer standings, public,
  no login. Adaeze leads on closures, 10 to Bello's 8, but they are **level on score**,
  because two of hers were disputed. Officer Nwosu is missing: officers who have lost
  access are withheld from the public board.
- Click **Report an incident**. Notice the question *"Were you the one affected?"* —
  the answer decides how much weight your later confirmation carries.
- Submit it. The case number appears **once**, in black, with a copy button.

### 2. Verifying an outcome with only a case number (1 min)

Go to **Track** and enter `CR-2026-0015` — a resolved anonymous case nobody has
answered yet.

The handling officer is named, and you are asked *"Does this match what happened?"*
**Dispute it.** Then sign in as `admin@example.com` and it is waiting at the top of the
sign-off queue, in red.

### 3. The officer queue (2 min)

Sign in as `officer@example.com`.

- Tap the **Pending** tile — the queue filters to it. The tiles are the filter.
- Find `CR-2026-0024` and press **Trail**. The history shows the case being resolved
  with *"Two suspects cautioned and the shutter repaired at their cost"*, and then a
  separate entry revising it to *"No further action taken."*

  **Both versions are kept. Both are timestamped. Both name the officer.** This is the
  answer to "how do you know the officer actually solved it?"
- Any resolved case the reporter rejected carries a red **Disputed by reporter** label
  in the queue itself — not tucked away behind a click.

### 4. Officer standings (2 min)

Open **Standings** from the sidebar.

Adaeze closed **10** cases and Bello closed **8**, but they are **level on score**,
because two of hers were disputed and none of his were. The tie is broken on speed
alone.

Under each officer, a three-part bar shows what became of their closures: confirmed,
unanswered, disputed.

### 5. Oversight, and creating an officer (2 min)

Sign in as `admin@example.com`.

- Headcounts first, then **Where the case load sits** — those bars are real
  proportions.
- **Sign-off queue**: the three disputed cases come first, then resolutions nobody
  answered. Sign one off and watch the queue and the counts update together.
- **Add an officer** — create one with any starting password, then sign in as them in
  a private browser window.

  You will be sent straight to the account page and told to set your own password.
  The queue, the standings and everything else stay shut until you do. This is enforced
  by the server, so it still holds if you try to go to the officer dashboard address
  directly. Set a password and the dashboard opens immediately, with no second sign-in.
- **Citizen accounts**: names, emails, join dates — and deliberately **no report
  counts.** An administrator can already read the whole queue, so a per-person count
  would let the two views be cross-referenced back to an individual.

### 6. The account page (1 min)

Any signed-in user: click the account chip at the bottom of the sidebar. Name, email,
role, join date, and a password change that requires the current password first.

Collapse the sidebar with the chevron — it remembers your choice next time.

---

## Creating your own administrator

The demo gives you `admin@example.com`. To make a real one of your own:

```bash
npm run create-admin -- "Your Name" you@example.com
```

It prints a randomly generated password **once**. Copy it before closing the window.

Lost it?

```bash
npm run create-admin -- "Your Name" you@example.com --reset-password
```

**There is no way to do this from the website, by design** — if a web page could
create administrators, a stolen administrator login could be used to quietly create a
second one and keep a way in even after the first was shut down.

The full explanation, including what each error message means and why those two dashes
are there, is in **[README.md](README.md#creating-an-administrator)**.

---

## Starting over

```bash
npm run seed
```

Rebuilds everything on this page from scratch.

> ⚠️ **This erases all existing data**, including any reports or accounts you created
> yourself. If you have been entering your own, copy `database/ccrts.db` somewhere safe
> first.
