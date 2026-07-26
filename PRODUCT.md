# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four distinct audiences, in three different situations:

- **Anonymous / walk-in reporters** — people who need to report a crime but have no account and may not want one. They may be reporting something sensitive, may fear identification, and may be using a shared or borrowed device. They get a case ID once, on screen, and nothing else. If they lose it, they lose access.
- **Registered citizens** — people who filed a report and want to know what happened to it. They return to check status, and may need to correct or withdraw a report while it is still pending.
- **Police officers** — staff working through a queue of incoming reports. They triage, filter, move cases through the workflow, and record resolution notes. They act on any report; there is no per-officer assignment.
- **Administrators** — oversight role. They read aggregate trends and control which officer accounts are active.

Citizens and officers use this in very different conditions: a citizen may be reporting once, under stress, on a phone; an officer is working a list repeatedly, likely at a desk.

## Product Purpose

Replace manual, paper-based crime reporting with a computerized system where every report gets a trackable case ID and every status change is logged.

Success means: a citizen can report an incident and later find out what happened to it without physically returning to a station, and an officer can show exactly who changed a case's status and when.

## Positioning

Two mechanisms a neighboring system could not truthfully copy without building them:

1. **Anonymous reporting that is still trackable.** A walk-in report attaches no identity at all — no account, no citizen ID stored — yet still issues a `CR-YYYY-NNNN` case ID the reporter can use to check status later on a public page. Anonymity and follow-up usually trade off against each other; here they don't.
2. **A complete status audit trail.** Every transition writes a `status_history` row with who changed it and when. This directly answers the "no audit trail" weakness identified in the manual system this project analyzes (seminar report, Chapter 3.1.1).
3. **A resolution nobody can quietly rewrite, verified by someone other than the officer who claimed it.** See "Verifying a resolution" below.

## Verifying a resolution

The system cannot prove a crime was solved — no records system can, and claiming
otherwise would be a lie told by software. What it proves is *who claimed it, when,
on what stated grounds, and who else agreed.* Three mechanisms, in order of strength:

1. **The claim is attributable and tamper-evident.** Resolving requires a note, and
   the note is the officer's account of what they did. Every revision of it is
   written to the trail as a separate `note` event with author and timestamp, so the
   original wording survives beside the new one. Previously a note could be rewritten
   with no record at all — the case looked cleanly resolved and the edit was invisible.
2. **The reporter answers it.** A resolved case can be confirmed or disputed by the
   person who filed it. This is evidence, never a gate: an anonymous reporter who
   never returns must not be able to hold a case open by silence.
3. **An administrator signs it off.** The universal backstop, applied to every
   resolved case regardless of whether the reporter ever responds.

**Why the reporter's answer cannot be the gate.** A reporter is not always in a
position to judge the outcome. Someone who witnessed a crime, or reported it for
another person, can say a case was *handled* but not whether the harm was *put
right* — only the person affected knows that. `reporter_relationship` is therefore
captured at report time (`affected` or `witness`) and shown to the admin on the
sign-off card, so a third-party confirmation is weighted as what it is rather than
being mistaken for the victim's word.

**Not yet built, and deliberately not faked:** the system has no concept of two
reports describing the same incident. If a victim and a witness both report an
event, they get two unrelated case IDs. Linking them is not a small feature — beyond
the schema and officer UI, relating an anonymous report to an identified one is an
anonymity hazard, since the link itself would reveal that the anonymous filer and
the named filer described the same event. Documented as future work.

## Operating Context

- Nigerian civic setting. Seeded incident locations are local and specific (Main Market Aba, Bank Road, School Gate) — copy and examples should stay in that register, not generic Western placeholders.
- Two entry paths that must not be conflated: the public, no-login path (report + track by case ID) and the authenticated path (dashboards).
- Case lifecycle is strictly linear and small: `pending → investigating → resolved`. Citizens can only edit or withdraw while `pending`; after that the report locks.
- This is a final-year academic project. It will be demonstrated live and defended to an examiner, so the interface is evaluated as evidence of the work, not only used as a tool.

## Capabilities and Constraints

**Confirmed functionality:** role-based auth (citizen/officer/admin) with sessions; citizen and anonymous walk-in report submission with evidence upload; edit/withdraw while pending; public track-by-case-ID; citizen dashboard; officer list with status/type/date filtering, status updates, resolution notes, and status history; admin analytics (by type, status, date), officer and citizen account rosters, officer account provisioning and activation; per-user account page with self-service password change; single-case PDF export; on-screen banner when a citizen's report status changes.

**Account provisioning.** Three tiers, each with a different credential:

| Account | Created by | Credential required |
|---|---|---|
| Citizen | Public registration | None |
| Officer | An admin, via `POST /api/admin/users` | An admin session |
| Admin | `npm run create-admin` | Shell access to the host |

`POST /api/admin/users` hard-codes `role = 'officer'`, so no request body can escalate past it, and public registration refuses anything but `citizen`. **No HTTP endpoint anywhere can create an admin.** That is what stops a stolen admin session from minting a permanent backdoor — but it also means there must be one out-of-band path, and `scripts/create-admin.js` is it. Its credential is shell access to the machine holding the database, which already implies full read/write over that database, so the script grants nothing its operator did not already have.

The script generates the password and prints it once rather than taking it as an argument, so it does not land in shell history. It also carries `--reset-password` for a lost admin password, scoped to admin accounts only: silently repointing a citizen or officer password from a script named `create-admin` would be a trap.

**Citizen oversight is read-only.** The admin citizen roster carries account facts only — never a report count. An admin can already read the full queue through the officer routes, where anonymous reports have their identity stripped; a per-person report count would let those two views be correlated back to a person. `tests/admin.test.js` asserts the roster's exact key set so nothing report-shaped can be added there by accident.

**Technical constraints:**
- Vanilla HTML/CSS/JavaScript. **No build step, no framework, no bundler.** Everything must work as static files served by `express.static`.
- Node.js ≥ 22.5 (built-in `node:sqlite`), Express, SQLite. No native-compilation dependencies available in this environment.
- Assets must be self-hosted and work offline — the demo may run without internet. Fonts are committed to the repo, not loaded from a CDN.
- Session-based auth; every guarded route re-checks the user is still active.

**Terminology:** "case" and "report" refer to the same record; case ID format is `CR-YYYY-NNNN`. Status values are exactly `pending`, `investigating`, `resolved`.

**Explicitly out of scope** (documented as future work, not gaps): live GPS/map geo-tagging, AI/ML crime prediction, real-time push notifications, native mobile app, national/inter-agency database integration, forgot-password recovery, email notifications.

Note the distinction: a signed-in user *can* change their own password (it requires the current one, so it is only ever a user re-keying their own account). What remains out of scope is *recovery* — resetting a password you cannot remember, which needs an email path this system does not have. Passwords are enforced at a minimum of 8 characters in one place, `lib/validators.js`, so the rule and the interface's promise cannot drift apart.

**There is no per-officer case assignment.** Officers act on any report. This is a product decision, not a missing feature: it matches the manual system being replaced, where any officer on duty could pick up any file.

## Brand Commitments

- **Name:** Sentinel. The system is also referred to formally as CCRTS (Computerized Crime Reporting and Tracking System) — both are in use; Sentinel is the product name.
- **Pinned visual reference:** `REF IMAGE.jpg` (OsTørk-style analytics dashboard) is binding. Its palette governs the project: warm off-white canvas, pure black for emphasis, pastel data tiles (peach, mint, ice blue, lavender), green for positive deltas, heavy corner rounding, generous whitespace.
- This supersedes the earlier "official/government navy-and-white" direction recorded in `build.md`. That line in build.md is to be updated to match, so the written spec and the built system agree.

## Evidence on Hand

- `build.md` — the original feature spec and objective-to-feature traceability table.
- `docs/superpowers/plans/2026-07-25-sentinel-ccrts.md` — the full implementation plan.
- `REF IMAGE.jpg` — the pinned visual reference.
- `database/seed.js` — real sample content: 3 accounts (citizen/officer/admin, password `Passw0rd!`) and 3 reports spanning all three statuses, with genuine local locations and descriptions.
- Working backend with 66 passing tests.

**Absences that must not be fabricated:** there are no real users, no usage statistics, no testimonials, no deployment, no partner agency, and no endorsement from any police body. The seminar report chapters this project references are not in this repository. Nothing in the interface may claim official police or government affiliation, cite adoption numbers, or imply the system is live in any station.

## Product Principles

1. **Anonymity is load-bearing, not a feature toggle.** Any surface that could leak whether a report has an identity attached — or which case IDs exist — is a defect. This has already produced real fixes (403→404 collapse, identity stripping in officer views).
2. **The case ID is the citizen's only key.** For walk-in reporters it is shown once and never recoverable. Every surface that issues or accepts it must treat it as precious: hard to miss, easy to copy, clearly explained.
3. **Two audiences, two tempos.** Citizen surfaces serve a stressed, possibly one-time visitor who needs the next action to be obvious. Officer and admin surfaces serve a repeat user working a queue who needs density, scanability, and filters.
4. **Show the trail.** The audit trail is this project's central argument against the manual system. It should be visible in the interface, not merely written to a table.
5. **Nothing may overstate what this is.** No fabricated official insignia, agency names, adoption figures, or authority claims.

## Accessibility & Inclusion

No specific standard was established as a product requirement. However, the civic context implies an unusually wide range of users, devices, and connection quality: reports may be filed on low-end phones, and the public reporting and tracking paths must work for someone who has never used the system before and has no account. Interfaces should not depend on hover, precise pointing, or color alone to convey status.
