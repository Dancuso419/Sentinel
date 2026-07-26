# Sentinel

**A computerised crime reporting and tracking system.**

Sentinel replaces the paper crime-report ledger kept at a police station.

Someone reports a crime — either with an account or completely anonymously — and
immediately receives a case number. From that moment on, every person who touches
that case is recorded: who changed it, what they changed, and when. The person who
reported it can look up what happened without going back to the station.

| I want to… | Go to |
|---|---|
| Get it running on my computer | [Seeing it for yourself](#seeing-it-for-yourself), below |
| Create an administrator account | [Creating an administrator](#creating-an-administrator), below |
| Log in and try it out | [DEMO-ACCOUNTS.md](DEMO-ACCOUNTS.md) — accounts, passwords, a guided tour |
| Understand how it is built | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Understand how it looks and why | [DESIGN.md](DESIGN.md) |
| Understand the decisions behind it | [PRODUCT.md](PRODUCT.md) |

---

## The problem this solves

A paper-based crime reporting system has three weaknesses. Sentinel targets each one
directly.

| Problem with the paper system | What Sentinel does instead |
|---|---|
| You report a crime, it goes into a ledger, and you never hear anything again | Every report gets a case number you can check at any time |
| There is no record of who changed a case, or when | Every single change is recorded with the person's name and the time |
| To report anything you must attend a station and give your identity | Reports can be filed anonymously, store no identity at all, and can still be tracked |

---

## Seeing it for yourself

This section assumes no technical background. If you already know what Node.js and a
terminal are, the whole thing is: `npm install`, `npm run seed`, `npm start`.

### What you need first

**Node.js, version 22.5 or newer.** Node.js is the program that runs Sentinel. It is
free.

1. Go to **[nodejs.org](https://nodejs.org)**
2. Download the version labelled **LTS** (it will detect your operating system)
3. Run the installer and accept the defaults

The version matters. Sentinel uses a database feature that only exists in Node.js
22.5 and later, so an older version will not start.

### Opening a terminal

A **terminal** is a window where you type commands instead of clicking buttons. Every
computer has one built in.

- **Windows** — press the Start button, type `PowerShell`, and open it
- **Mac** — press `Cmd + Space`, type `Terminal`, and press Enter
- **Linux** — press `Ctrl + Alt + T`

Now point the terminal at this project folder by typing `cd `, then dragging the
project folder onto the terminal window, then pressing Enter. The `cd` means
"change directory".

### The three commands

Type each one, press Enter, and wait for it to finish before typing the next.

```bash
npm install
```

Downloads the handful of components Sentinel depends on. You only ever do this once.
It prints a lot of text — that is normal.

```bash
npm run seed
```

Fills the database with realistic demo data: 11 accounts and 38 crime reports, all
fictional.

> ⚠️ **This erases anything already in the database.** The first time you run it there
> is nothing to lose. Later on, only run it when you want to wipe everything and start
> fresh.

```bash
npm start
```

Starts the system. Leave this window open — closing it switches Sentinel off.

Now open your web browser and go to:

**http://localhost:3000**

`localhost` means "this computer". Nothing is being published to the internet; the
site is only visible to you.

To stop Sentinel, click the terminal window and press `Ctrl + C`.

### If something goes wrong

| What you see | What it means |
|---|---|
| `npm: command not found` | Node.js is not installed, or the terminal was open before you installed it. Close the terminal, open a new one, and try again. |
| `Cannot find module 'node:sqlite'` | Your Node.js is older than 22.5. Install the current version from nodejs.org. |
| `EADDRINUSE` or `port 3000 already in use` | Sentinel is already running in another terminal window, or another program is using that slot. Close the other window, or run `npm start` with a different door number: `PORT=4000 npm start` |
| The page will not load | Check the terminal still says `Sentinel CCRTS listening on…`. If it has stopped or shows an error, `npm start` again. |

---

## Creating an administrator

Administrators are the oversight role: they see the analytics, sign off resolved
cases, and create officer accounts.

**You cannot create one through the website, and this is deliberate.** There is no
page, button, or hidden URL that makes an administrator — not even for someone
already signed in as one. The reason: if a website could create administrators, then
anyone who stole an administrator's login could quietly create a second one and keep
their way in even after the first was shut down.

So the only way in is from the terminal, on the computer holding the database.

### Doing it

In a terminal pointed at the project folder (same as above), type:

```bash
npm run create-admin -- "Your Name" you@example.com
```

Replace the name and email with your own. Keep the quote marks around the name.

**Those two dashes in the middle are not a typo.** `--` tells npm that everything
after it belongs to Sentinel rather than to npm itself. Leave them in, with a space
either side.

You will see:

```
  Created administrator

    Name      Your Name
    Email     you@example.com
    Password  kQ7bTn2xR4vLpZ8mW3yF6dHc

  This password is shown once and is not stored anywhere in readable form.
  Sign in at /login.html.
```

**Copy that password somewhere safe before closing the window.** Sentinel generates
it randomly and never shows it again — it is stored scrambled, so nobody, including
the system itself, can read it back. It is generated rather than chosen by you so
that it never gets typed into your terminal history.

Now go to **http://localhost:3000/login.html** and sign in with that email and
password.

### If you lose the password

```bash
npm run create-admin -- "Your Name" you@example.com --reset-password
```

Same command with `--reset-password` on the end. It generates a fresh password and
prints it once. Everything else about the account stays as it was.

This only works on administrator accounts. Pointed at a citizen or officer, it
refuses and tells you so — a script called `create-admin` silently changing an
ordinary person's password would be a trap.

### Common messages

| What you see | What it means |
|---|---|
| `A name and an email address are both required` | You left one out, or forgot the `--`. |
| `Too many values. Quote the name if it contains spaces` | The name needs quote marks: `"Grace Adeyemi"`, not `Grace Adeyemi`. |
| `already has an admin account` | That email is already an administrator. Add `--reset-password` to set a new password for it. |
| `belongs to a citizen, not an admin` | That email is already in use by an ordinary account. Pick a different email. |

There is a full walkthrough, including the demo accounts, in
**[DEMO-ACCOUNTS.md](DEMO-ACCOUNTS.md)**.

---

## The two ideas that make this different

### 1. Anonymous reports that can still be tracked

Normally these two things trade off against each other. To be told what happened to
your report, someone has to be able to reach you — which means they know who you are.

Sentinel breaks that trade-off.

An anonymous report stores **no identity whatsoever**: no account, no name, nothing
that points back to the person who filed it. It still produces a case number, and
that number on its own opens the case record on a public page that needs no login.

There is a real cost to this, and the system says so plainly on screen: **the case
number is shown once and cannot be recovered.** There is no account to recover it
from. That is the price of storing nothing about you.

### 2. A complete history that cannot be quietly rewritten

Every case carries a running log. Entries are only ever added, never edited or
deleted. Four kinds of thing get written to it:

| Entry | Written when |
|---|---|
| **Status change** | The case moves from pending → investigating → resolved |
| **Note revision** | An officer rewrites their explanation *after* closing the case |
| **Reporter's verdict** | The person who reported it confirms or disputes the outcome |
| **Sign-off** | An administrator approves the resolution |

The second one matters more than it looks. Without it, an officer could close a case
with one account of what they did and quietly rewrite it later — the case would look
cleanly resolved and the edit would be invisible. Every version is kept, so the
original wording sits in the history right next to whatever replaced it.

Officers and administrators are **named** in the history. Citizens never are, even
when the system knows who they are — naming them would undo the anonymity everywhere
else.

---

## How a case moves

```
   CITIZEN                    OFFICER                     ADMIN
   ───────                    ───────                     ─────
   files a report
        │
        ▼
     PENDING ─────────────── picks it up
   (can still be              │
    edited or                 ▼
    withdrawn)          INVESTIGATING
                        (now locked for
                         the citizen)
                              │
                              ▼
                          RESOLVED
                    (an explanation is
                     required to close)
                              │
        ┌─────────────────────┴────────────────────┐
        ▼                                          ▼
   confirms or disputes                      signs off
   (optional)                            (always required)
```

A case only ever moves forward. It can never be sent back to an earlier stage — the
system rejects the attempt.

A citizen can correct or withdraw their report only while it is still **pending**.
Once an officer picks it up, it locks.

---

## Proving a case was actually solved

**Sentinel cannot prove a crime was solved.** No record-keeping system can, and
software claiming otherwise would simply be lying.

What it *can* prove is **who claimed it was solved, when, on what stated grounds, and
who else agreed.** Three mechanisms, weakest to strongest:

**1. The claim has a name attached and cannot be silently changed.** Closing a case
requires the officer to write what they did, and every later rewrite of that
explanation is logged against them.

**2. The person who reported it gets to answer.** They can confirm or dispute the
outcome. A disputed case is flagged in the officer's queue and jumps to the top of the
administrator's review list.

This is **evidence, not a veto.** An anonymous reporter who never comes back must not
be able to hold a case open forever through silence.

**3. An administrator signs it off.** Every resolved case, no exceptions. This is the
backstop that applies whether or not the reporter ever responds.

### Why the reporter's answer cannot be the only check

Someone is not always in a position to judge the outcome. A person who *witnessed* a
crime, or reported it on somebody else's behalf, can tell you a case was **handled**
— but not whether the harm was **put right**. Only the person actually affected knows
that.

So both report forms ask: **"Were you the one affected?"** The answer is stored with
the case and shown to the administrator, so that a bystander's confirmation is
weighted for what it is rather than mistaken for the victim's word.

> **A known limitation, stated rather than hidden:** the system has no concept of two
> reports describing the same incident. If a victim and a witness both report the same
> event, they get two unrelated case numbers. Linking them is not a small feature —
> connecting an anonymous report to an identified one would itself leak anonymity,
> because the link reveals that the anonymous person and the named person described the
> same event.

---

## Who uses it

### People reporting anonymously

No account needed. File a report, get a case number on screen once, check it later on
a public page. Nothing stored connects the record to them.

### Registered citizens

A dashboard of every report they have filed, with live status. While a report is
pending they can correct or withdraw it. When an officer moves it, a message tells
them. When it is resolved they can confirm or dispute the outcome.

Filing with an account still allows hiding your name from the handling officer — the
case stays on your dashboard, but the officer just sees "Anonymous".

### Police officers

A queue of every report in the system. There is **no assignment of cases to specific
officers** — any officer can act on any case, matching the paper system being
replaced. They filter by status, type and date, move cases forward, write
explanations, and open the full history of any case.

### Administrators

Oversight rather than case work: overall trends, the sign-off queue, staff and citizen
lists, creating officer accounts, and the officer standings. Administrators can also
work the case queue, and when they do the queue tells them so — otherwise the screen
looks like somebody else's account.

---

## Officer standings

A ranked board of who picks up work, who closes it, and **what became of the cases
they closed.**

**Cases closed is deliberately not the ranking.** Ranking officers purely on volume
rewards closing cases, not solving them — the well-known failure of raw clearance-rate
targets. Position is:

```
score = cases resolved − cases the reporter disputed
```

So closing many cases badly cannot outrank closing fewer well. Average time to close
only breaks ties; it never sets the order.

An officer who loses access keeps their record — withdrawing someone's login does not
erase work they already did. The board is visible to officers as well as
administrators: a performance measure that people are ranked by but not allowed to see
is worse than no measure at all.

### Part of the board is public

A summary sits on the front page, readable with no account. The reasoning: someone
deciding whether to report a crime at all deserves to see whether resolutions here
hold up.

That is a real exposure decision, so what it does and does not publish is deliberate.

**Published** — officer name, cases picked up, cases closed, confirmed, **disputed**,
average days to close, and score. Disputes are published *because* closures are.
Showing closures while hiding rejections would turn the public board back into a
volume ranking, which is exactly the incentive this measure exists to avoid.

**Withheld** — officers who have lost access, whose absence is an employment matter
rather than a performance one, and the count of rewritten explanations, which is an
internal oversight signal that reads as an accusation without the context an officer
or administrator has. Both stay on the internal board.

The public page carries no citizen or case information of any kind — no case numbers,
no reporters, no locations, no emails. There is an automated test that checks exactly
this.

---

## Everything the system does

<details>
<summary><strong>Without an account</strong></summary>

- Submit an anonymous report, optionally attaching evidence (JPG, PNG or PDF, up to 5MB)
- Receive a case number once, with a copy button
- Look up any case by its number: status, type of incident, dates, handling officer, and the officer's explanation
- Confirm or dispute the outcome of an anonymous case
- See live system status on the front page, read from the real database
- See the officer standings, including disputed counts

</details>

<details>
<summary><strong>Citizens</strong></summary>

- Register, sign in, change password
- File reports, optionally hiding their name from the handling officer
- A dashboard with counts per status and their full case list
- Edit or withdraw a report while it is still pending
- A message when a case status changes
- Confirm or dispute a resolution
- Download a PDF summary of a case; view evidence they uploaded

</details>

<details>
<summary><strong>Officers</strong></summary>

- Required to replace the administrator-issued password at first sign-in; the account does nothing at all until they do
- The full case queue, with filters for status, type and date, and clickable status tiles
- Move a case forward; write and revise explanations
- Read the complete history of any case
- See disputed resolutions flagged directly in the queue
- The officer standings
- Download case PDFs and view evidence

</details>

<details>
<summary><strong>Administrators</strong></summary>

- Overall analytics: by status, by type of incident, by day
- A sign-off queue for every resolved case, disputes first
- Create officer accounts; grant and withdraw access
- Officer and citizen lists
- The officer standings
- Everything an officer can do

</details>

**Deliberately not built** — recorded as future work rather than gaps: live GPS
mapping, AI crime prediction, push notifications, a phone app, connections to other
agencies' databases, forgotten-password recovery, and email notifications.

---

## Privacy rules the code enforces

These are behaviours with automated tests attached, not good intentions.

1. **Guessing a case number never confirms anything.** Asking for a case that does not
   exist and asking for one that exists but is not yours produce the identical
   response, so neither answer reveals which is which.
2. **The public statistics are totals only.** Counts, never case numbers — so the page
   cannot be used to work out which cases exist.
3. **Anonymous reports lose their identity before leaving the server**, both in the
   officer's queue and in the case history.
4. **The administrator's citizen list carries no report counts.** An administrator can
   already read the whole queue; a per-person count would let those two views be
   cross-referenced back to an individual.
5. **Only anonymous cases can be verified with a case number alone.** Case numbers run
   in sequence and are therefore guessable, so a case belonging to an account can only
   be confirmed by its owner while signed in.
6. **No web page anywhere can create an administrator.** See
   [Creating an administrator](#creating-an-administrator).
7. **A password somebody else chose cannot be used.** An officer given an account by an
   administrator must set their own password before the account does anything. This is
   enforced by the server, not by a prompt on the screen — a prompt can be sidestepped.

---

## Project status

**114 automated tests across 14 suites.** Run them with `npm test`.

This is a final-year academic project. It is **not deployed, has no real users, and is
not affiliated with or endorsed by any police force or government body.** Every name,
account and case in the demo data is fictional.
