# Build Plan: Computerized Crime Reporting and Tracking System (CCRTS)

Final year project — small-scale implementation aligned with Chapter 1–4 of the seminar report.

## Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla) — matches Chapter 4.1/4.2
- **Backend:** Node.js + Express
- **Database:** SQLite (single-file, no server setup required)
- **Auth:** express-session + bcrypt (password hashing)
- **File uploads:** multer (local disk storage)
- **PDF export:** pdfkit (or similar lightweight lib)
- **Email (optional, on status change):** Nodemailer with test SMTP (e.g. Ethereal) — not a live mail server

---

## Objective → Feature Traceability

| Objective (Section 1.3) | Feature(s) |
|---|---|
| 1. Analyse weaknesses of manual system | Chapter 3.1.1 (already written, no build) |
| 2. Secure, user-friendly web-based system | Role-based auth, bcrypt hashing, sessions, official UI styling |
| 3. Core functionalities: reporting, tracking, auth, analytics | Report submission, case tracking, dashboards, analytics |
| 4. Evaluate usability, security, response time | Input validation, error handling, search/filter (demo of usability) |
| 5. Deployment/scalability recommendations | Chapter 4.3 (already written, no build) |

---

## Features

### 1. Authentication & Roles
- Register/login for three roles: Citizen, Police Officer, Administrator
- Passwords hashed with bcrypt
- Session-based auth (express-session)
- Role-based route guarding (middleware)
- No password reset flow (out of scope for demo)

### 2. Crime Reporting
- **Registered citizens:** log in, submit report (type, location [text field, not live GPS], description, incident time, evidence upload), optional "submit anonymously" checkbox
- **Walk-in/no-account reporting:** public "Report a Crime" page, no login required, generates case ID shown once on screen, fully anonymous (no identity attached at all)
- Evidence upload: images (jpg/png) + PDF only, 5MB max file size
- Case ID format: `CR-YYYY-NNNN` (e.g. CR-2026-0001), auto-incrementing per year

### 3. Report Editing
- Registered citizens can edit or withdraw their own report **only while status = "pending"**
- Once status moves to "investigating" or beyond, report is locked from citizen edits

### 4. Case Tracking
- Registered citizens: dashboard listing all their own past reports + current status
- Anonymous/walk-in users: public "Track Case" page — enter case ID to check status (no login)
- Status workflow: `pending → investigating → resolved`
- Resolution note field: short text shown to citizen when status = resolved
- Full status history/audit trail logged (status, changed_by, timestamp) — directly addresses "no audit trail" weakness noted in Chapter 3.1.1

### 5. Officer Dashboard
- View all reports (any officer can act on any report — no assignment system)
- Search/filter by status, type, date range
- Update status + add resolution note
- Cannot see identity on anonymous reports

### 6. Admin Dashboard
- Everything officers can do, plus:
- Analytics: report counts by type, by status, by date range (simple charts)
- User management: activate/deactivate officer accounts

### 7. Notifications
- On-screen banner shown to registered citizen when their report's status changes
- Optional email notification via test SMTP (Nodemailer), only for registered citizens with accounts (not applicable to anonymous walk-in reports)

### 8. PDF Export
- Citizen or officer can export a single case summary (case ID, type, status, description, resolution note) as a PDF

### 9. Validation & Error Handling
- Required field checks on all forms
- Duplicate email rejection on registration
- Clear error messages on failed login, invalid case ID lookup, oversized/invalid file uploads
- This behavior feeds directly into the Objective 4 evaluation write-up (usability/security testing)

---

## Explicitly Out of Scope

(Per Sections 1.5, 1.6, and 4.3.2 — these are documented as future work, not gaps)

- Live GPS/map-based geo-tagging
- AI/ML crime prediction
- Real-time push notifications
- Native mobile application
- Integration with national/inter-agency databases
- Password reset flow

---

## Database Schema (SQLite)

**users**
- id, name, email (unique), password_hash, role (citizen/officer/admin), is_active, created_at

**reports**
- id, case_id (unique, `CR-YYYY-NNNN`), citizen_id (nullable — anonymous or walk-in), is_anonymous (bool), type, location, description, incident_time, evidence_path, status, resolution_note, created_at, updated_at

**status_history**
- id, report_id, status, updated_by (nullable — user id or "system"), updated_at

---

## Build Order

1. Project scaffold: folder structure, package.json, Express server boilerplate
2. Database: schema.sql + db.js connection + seed.js (sample users + sample reports)
3. Auth: register, login, logout, session middleware, role guards
4. Citizen flow: submit report (incl. anonymous checkbox + file upload), edit/withdraw while pending, personal dashboard, track by case ID
5. Walk-in flow: public report form (no login), public track-by-case-ID page
6. Officer dashboard: list/search/filter reports, update status + resolution note, status history logging
7. Notifications: on-screen banner on status change (+ optional email)
8. Admin dashboard: analytics (charts), user activation/deactivation
9. PDF export
10. UI polish: official/government visual style (navy/white palette, header banner, clean tables)
11. Manual testing pass: validation, error states, edge cases (feeds Objective 4 evaluation section)

---

## File Structure

```
ccrts/
├── server.js
├── package.json
├── database/
│   ├── ccrts.db          (generated)
│   ├── schema.sql
│   ├── db.js
│   └── seed.js
├── routes/
│   ├── auth.js
│   ├── reports.js
│   ├── cases.js
│   ├── analytics.js
│   └── admin.js
├── middleware/
│   └── auth.js
├── public/
│   ├── css/style.css
│   ├── js/
│   └── *.html
└── uploads/               (evidence files, gitignored)
```
