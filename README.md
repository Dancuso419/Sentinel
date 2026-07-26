# Sentinel

**A Computerized Crime Reporting and Tracking System (CCRTS).**

Sentinel replaces the paper crime-report ledger. A citizen files a report — with an
account or completely anonymously — and receives a case ID. Every hand that touches
that case from then on is recorded, and the person who filed it can read the record
back without returning to a station.

- **What it is built with, and why:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Demo accounts and a walkthrough:** [DEMO-ACCOUNTS.md](DEMO-ACCOUNTS.md)
- **Visual design system:** [DESIGN.md](DESIGN.md)
- **Product decisions and constraints:** [PRODUCT.md](PRODUCT.md)

```bash
npm install
npm run seed      # demo data — destroys any existing database
npm start         # http://localhost:3000
```

---

## The problem it addresses

A manual crime-reporting system has three weaknesses this project targets directly:

| Weakness of the manual system | What Sentinel does |
|---|---|
| A report goes into a ledger and the reporter hears nothing again | Every report gets a `CR-YYYY-NNNN` case ID that can be checked at any time |
| No record of who changed a case, or when | Every change writes an append-only event naming the actor and the time |
| Reporting requires attending a station and giving your identity | Anonymous reports are accepted, store no identity, and remain trackable |

---

## The two mechanisms that define it

### 1. Anonymous reporting that is still trackable

Anonymity and follow-up normally trade off: to be told what happened to your report,
you have to be reachable. Sentinel breaks that trade.

A walk-in report stores **no identity at all** — no account, no name, no citizen
record, nothing that points back to the reporter. It still returns a case ID, and
that ID alone opens the case record on a public page that requires no login.

The consequence is deliberate and is stated plainly in the interface: the case ID is
shown **once**, and cannot be recovered. There is no account to recover it from.

### 2. A complete, tamper-evident case trail

Every case carries an append-only log of four kinds of event:

| Event | Written when |
|---|---|
| `status` | The case moves `pending → investigating → resolved` |
| `note` | An officer revises the resolution note **after** closing the case |
| `verdict` | The reporter confirms or disputes the resolution |
| `review` | An administrator signs the resolution off |

The `note` event matters more than it looks. Without it, an officer could close a
case with one account of what happened and quietly rewrite it later — the case would
look cleanly resolved and the edit would be invisible. Every version is now kept, so
the original wording sits in the trail beside its replacement.

Officers and admins are **named** in the trail. Citizens never are, even when the
system knows who they are — an anonymous report still carries its reporter's id on
the opening row, so resolving that to a name would undo the anonymity everywhere else.

---

## How a case moves

```
   CITIZEN                    OFFICER                     ADMIN
   ───────                    ───────                     ─────
   files a report
        │
        ▼
     PENDING ─────────────── picks it up
   (editable and              │
    withdrawable)             ▼
                        INVESTIGATING
                        (case locks for
                         the citizen)
                              │
                              ▼
                          RESOLVED
                       requires a note
                              │
        ┌─────────────────────┴────────────────────┐
        ▼                                          ▼
   confirms or disputes                      signs off
   (evidence, optional)                  (always required)
```

The lifecycle is strictly linear. A case never moves backward — the API rejects it
with `409`. A citizen may edit or withdraw only while the case is `pending`; once an
officer picks it up, it locks.

---

## Verifying that a case was actually solved

**Sentinel cannot prove a crime was solved.** No records system can, and software
claiming otherwise would be lying. What it proves is *who claimed it, when, on what
stated grounds, and who else agreed.* Three mechanisms, weakest to strongest:

**1. The claim is attributable and tamper-evident.** Closing a case requires a
resolution note — the officer's account of what they did — and every revision of that
note is logged against them.

**2. The reporter answers it.** A resolved case can be confirmed or disputed by
whoever filed it. A disputed case is flagged on the officer queue and sorts to the
top of the admin's sign-off queue.

This is **evidence, never a gate.** An anonymous reporter who never returns must not
be able to hold a case open by silence.

**3. An administrator signs it off.** Every resolved case, without exception.

### Why the reporter's answer cannot be the only check

A reporter is not always in a position to judge the outcome. Someone who *witnessed*
a crime, or reported it on another person's behalf, can say a case was **handled**
but not whether the harm was **put right** — only the person affected knows that.

So both report forms ask **"Were you the one affected?"** The answer is stored with
the case and shown to the administrator on the sign-off card, so a third-party
confirmation is weighted as what it is rather than mistaken for the victim's word.

> **Known limitation, not hidden:** the system has no concept of two reports
> describing the same incident. If a victim and a witness both report an event they
> receive two unrelated case IDs. Linking them is not a small feature — relating an
> anonymous report to an identified one is itself an anonymity leak, because the link
> reveals that the anonymous filer and the named filer described the same event.

---

## Who uses it

### Anonymous / walk-in reporters

No account. File a report, receive a case ID on screen once, check it later on a
public page. Nothing stored links the record to them.

### Registered citizens

A dashboard of every report they have filed, with live status. While a report is
`pending` they can correct or withdraw it. When an officer moves it, a banner tells
them. When it resolves they can confirm or dispute the outcome.

Filing with an account still allows hiding your name from the handling officer — the
case stays on your dashboard, but the officer sees "Anonymous".

### Police officers

A queue of every report in the system. There is **no per-officer assignment** — any
officer can act on any case, matching the manual system being replaced. Officers
filter by status, type and date range, move cases forward, record resolution notes,
and open the full trail on any case.

### Administrators

Oversight rather than case work: aggregate trends, the sign-off queue, officer and
citizen rosters, officer account provisioning, and officer standings. Admins also
hold officer permissions and can work the queue — when they do, the queue tells them
so, because otherwise the screen reads as somebody else's account.

---

## Officer standings

A ranked board of who picks up work and closes it — and what happened to the cases
they closed.

**Cases closed is deliberately not the ranking.** Ranking officers on volume alone
rewards closing cases, not solving them; it is the well-known failure of raw
clearance-rate targets. Position is:

```
score = cases resolved − cases the reporter disputed
```

So closing many cases badly cannot outrank closing fewer well. Average time to close
breaks a tie; it never sets the order. Each officer also carries their confirmed
count, disputed count, admin sign-offs, and how many resolution notes they revised
after the fact.

A deactivated officer keeps their record — withdrawing access does not erase work
already done. The board is visible to officers as well as admins: a performance
measure people are ranked by but cannot see is worse than no measure at all.

### The board is public

A summary of the standings sits on the landing page, readable with no account. The
reasoning: someone deciding whether to report a crime at all is entitled to see
whether resolutions here hold up.

That is a real exposure decision, so what it does and does not publish is deliberate:

**Published** — officer name, cases picked up, cases closed, confirmed, **disputed**,
average days to close, and score. Disputes are published *because* resolutions are.
Showing closures while hiding rejections would turn the public board into a volume
ranking, which is precisely the incentive this measure exists to avoid — a sanitised
board would be worse than either publishing all of it or none of it.

**Withheld** — deactivated officers, whose absence is an employment matter rather
than a performance one, and the note-revision count, an internal oversight signal
that reads as an accusation without the case context an officer or admin has. Both
remain on the internal board at `/performance.html`.

The public endpoint carries no citizen or case data of any kind — no case IDs, no
reporters, no locations, no emails. There is a test asserting exactly that.

---

## Everything the system does

**Public, no account**
- Submit an anonymous walk-in report with optional evidence (JPG/PNG/PDF, ≤5MB)
- Receive a case ID once, with copy-to-clipboard
- Track any case by ID: status, incident type, dates, handling officer, resolution note
- Confirm or dispute the resolution of a walk-in case
- Live system status on the landing page, read from the database
- Officer standings on the landing page, including disputed counts

**Citizens**
- Register, sign in, change password
- File reports, optionally hiding their name from the handling officer
- Dashboard with per-status counts and full case list
- Edit or withdraw a report while pending
- Banner when a case status changes
- Confirm or dispute a resolution
- Download a per-case PDF summary; view uploaded evidence

**Officers**
- Full case queue with status/type/date filters and clickable status tiles
- Move a case forward; record and revise resolution notes
- Read the complete trail of any case
- See disputed resolutions flagged in the queue
- Officer standings
- Download case PDFs and view evidence

**Administrators**
- Aggregate analytics: by status, by incident type, by day
- Sign-off queue for every resolved case, disputes first
- Create officer accounts; activate and deactivate them
- Officer and citizen rosters
- Officer standings
- Everything an officer can do

**Deliberately out of scope** — documented as future work, not gaps: live GPS
geo-tagging, AI/ML crime prediction, real-time push notifications, a native mobile
app, inter-agency database integration, forgot-password recovery, and email
notification.

---

## Privacy rules the code enforces

These are behaviours with tests attached, not aspirations.

1. **A guessed case ID never confirms anything.** Requesting a case that does not
   exist and one that exists but is not yours both return `404`, never `403`.
2. **The public stats endpoint is aggregate-only.** Counts, never case IDs — it
   cannot be used to enumerate which cases exist.
3. **Anonymous reports lose their identity before leaving the server**, in the
   officer queue and in the trail.
4. **The admin citizen roster carries no report counts.** An admin can already read
   the whole queue; a per-person count would let the two views be correlated back to
   a person.
5. **Only walk-in cases can be verified with a case ID alone.** Case IDs are
   sequential and guessable, so a case belonging to an account is verifiable only by
   its owner while signed in.
6. **No HTTP endpoint can create an administrator.** See
   [ARCHITECTURE.md](ARCHITECTURE.md#account-provisioning).

---

## Status

96 automated tests across 13 suites. Run them with `npm test`.

This is a final-year academic project. It is not deployed, has no real users, and is
not affiliated with or endorsed by any police force or government body. Every name,
account and case in the demo data is fictional.
