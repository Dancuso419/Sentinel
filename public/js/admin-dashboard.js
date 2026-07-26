// Admin oversight: who is on the system, and what the case load looks like.
//
// This screen deliberately does NOT repeat the officer queue's status tiles. The
// officer's question is "what do I work next"; the admin's is "who is on this
// system and where is the load". Status lives here as a chart, not as the header.
//
// Every number is a COUNT(*). Nothing is projected, smoothed, or illustrative.

const STATUS_LABEL = { pending: 'Pending', investigating: 'Investigating', resolved: 'Resolved' };
const STATUS_FILL = { pending: 'is-peach', investigating: 'is-ice', resolved: 'is-mint' };
const STATUS_ORDER = ['pending', 'investigating', 'resolved'];
const MAX_DATE_ROWS = 10;

const people = document.getElementById('overview');
const scope = document.getElementById('analytics-scope');

function fmtDate(ts) {
  return String(ts || '').slice(0, 10);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Bars are written at width:0 and given their real width on the next frame, so the
// CSS transition has something to animate from. Set inline at render time they would
// simply appear at full length — the transition would never fire.
function bars(rows, { label, value, fill }) {
  if (!rows.length) {
    return '<p class="muted">No reports on record yet.</p>';
  }
  const max = Math.max(...rows.map(value));
  return rows.map((row) => {
    const n = value(row);
    const pct = max > 0 ? Math.round((n / max) * 100) : 0;
    return `
      <div class="bar-row">
        <span class="bar-name">${escapeHtml(label(row))}</span>
        <span class="bar-track">
          <span class="bar-fill${fill ? ` ${fill(row)}` : ''}" data-width="${pct}"
                style="width: ${REDUCED_MOTION ? pct : 0}%"></span>
        </span>
        <span class="bar-value">${n}</span>
      </div>`;
  }).join('');
}

function growBars(container) {
  if (REDUCED_MOTION) return;
  requestAnimationFrame(() => {
    container.querySelectorAll('.bar-fill[data-width]').forEach((el) => {
      el.style.width = `${el.dataset.width}%`;
    });
  });
}

/* ---------- people counts ------------------------------------------------ */

async function loadOverview() {
  const o = await apiRequest('GET', '/api/admin/overview');

  const set = (key, figure, note) => {
    const f = people.querySelector(`[data-count="${key}"]`);
    const n = people.querySelector(`[data-note="${key}"]`);
    if (f) f.textContent = String(figure);
    if (n) n.textContent = note;
  };

  const offInactive = o.officers.total - o.officers.active;
  set('officers', o.officers.total,
    offInactive > 0
      ? `${o.officers.active} active · ${offInactive} deactivated`
      : `All ${plural(o.officers.active, 'account', 'accounts')} active`);

  const citInactive = o.citizens.total - o.citizens.active;
  set('citizens', o.citizens.total,
    citInactive > 0
      ? `${o.citizens.active} active · ${citInactive} deactivated`
      : `All ${plural(o.citizens.active, 'account', 'accounts')} active`);

  set('reports', o.reports, `Across ${plural(o.types, 'incident type', 'incident types')}`);

  scope.textContent = plural(o.reports, 'report on record', 'reports on record');
}

/* ---------- report analytics --------------------------------------------- */

async function loadAnalytics() {
  const { byType, byStatus, byDate } = await apiRequest('GET', '/api/admin/analytics');

  const counts = { pending: 0, investigating: 0, resolved: 0 };
  (byStatus || []).forEach((r) => {
    if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] = r.count;
  });

  // Fixed lifecycle order, not whatever order the GROUP BY returned — this chart
  // reads as a pipeline, so a missing status must hold its slot at zero.
  document.getElementById('by-status').innerHTML = bars(
    STATUS_ORDER.map(s => ({ status: s, count: counts[s] })),
    {
      label: r => STATUS_LABEL[r.status],
      value: r => r.count,
      fill: r => STATUS_FILL[r.status]
    }
  );

  document.getElementById('by-type').innerHTML = bars(
    [...(byType || [])].sort((a, b) => b.count - a.count),
    { label: r => r.type, value: r => r.count }
  );

  document.getElementById('by-date').innerHTML = bars(
    [...(byDate || [])].reverse().slice(0, MAX_DATE_ROWS),
    { label: r => r.date, value: r => r.count }
  );

  ['by-status', 'by-type', 'by-date'].forEach((id) => growBars(document.getElementById(id)));
}

/* ---------- rosters ------------------------------------------------------- */

function accessPill(active) {
  return `<span class="pill ${active ? 'pill-resolved' : 'pill-inactive'}">${active ? 'Active' : 'Deactivated'}</span>`;
}

function emptyRow(cols, headline, detail) {
  return `
    <tr class="detail-row">
      <td colspan="${cols}">
        <div class="table-empty">
          <strong>${headline}</strong>
          ${detail}
        </div>
      </td>
    </tr>`;
}

async function loadOfficers() {
  const { users } = await apiRequest('GET', '/api/admin/users?role=officer');
  const tbody = document.querySelector('#officers-table tbody');

  if (!users.length) {
    tbody.innerHTML = emptyRow(5, 'No officer accounts exist yet.',
      'Officer accounts are created directly in the database. Once they exist you can activate or deactivate them here.');
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const active = Boolean(u.is_active);
    return `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td class="mono muted">${escapeHtml(u.email)}</td>
        <td class="mono muted">${escapeHtml(fmtDate(u.created_at))}</td>
        <td>${accessPill(active)}</td>
        <td>
          <button class="btn ${active ? 'btn-danger' : 'btn-secondary'} btn-sm toggle-btn"
                  type="button" data-id="${u.id}" data-active="${active}">
            ${active ? 'Deactivate' : 'Reactivate'}
          </button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.toggle-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const wasActive = btn.dataset.active === 'true';
      btn.disabled = true;
      btn.textContent = wasActive ? 'Deactivating…' : 'Reactivating…';
      try {
        await apiRequest('PATCH', `/api/admin/users/${btn.dataset.id}/active`, { is_active: !wasActive });
        // The headcount note depends on this, so refresh both together.
        await Promise.all([loadOfficers(), loadOverview()]);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = wasActive ? 'Deactivate' : 'Reactivate';
      }
    }));
}

async function loadCitizens() {
  const { users } = await apiRequest('GET', '/api/admin/users?role=citizen');
  const tbody = document.querySelector('#citizens-table tbody');

  if (!users.length) {
    tbody.innerHTML = emptyRow(4, 'No citizen accounts yet.',
      'Anyone can still file a walk-in report without registering — those cases appear in the queue with no account attached.');
    return;
  }

  // No action column: this roster is read-only by design. See the note above the
  // table and routes/admin.js.
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td class="mono muted">${escapeHtml(u.email)}</td>
      <td class="mono muted">${escapeHtml(fmtDate(u.created_at))}</td>
      <td>${accessPill(Boolean(u.is_active))}</td>
    </tr>`).join('');
}

/* ---------- sign-off queue ------------------------------------------------ */

const RELATIONSHIP_NOTE = {
  affected: 'Reported by the person affected — their confirmation carries weight on the outcome.',
  witness: 'Reported by a witness or on someone else&rsquo;s behalf. A witness can say a case was handled, but not whether the harm was put right.'
};

const VERDICT_PILL = {
  confirmed: '<span class="pill pill-confirmed">Confirmed by reporter</span>',
  disputed: '<span class="pill pill-disputed">Disputed by reporter</span>'
};

function reviewCard(r) {
  const id = escapeHtml(r.case_id);
  const verdict = r.reporter_verdict
    ? VERDICT_PILL[r.reporter_verdict]
    : '<span class="pill pill-awaiting">No response from reporter</span>';

  return `
    <div class="card review-card${r.reporter_verdict === 'disputed' ? ' is-disputed' : ''}">
      <div class="card-head">
        <span class="case-id">${id}</span>
        <div class="verdict-line">${verdict}</div>
      </div>

      <dl class="demo-meta">
        <div><dt>Incident</dt><dd>${escapeHtml(r.type)}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(r.location || '—')}</dd></div>
        <div><dt>Resolved</dt><dd class="mono">${escapeHtml(fmtDate(r.updated_at))}</dd></div>
      </dl>

      <p class="demo-note" style="margin-top: var(--s-md)">
        <strong>Officer's resolution note</strong>
        ${escapeHtml(r.resolution_note || 'No note recorded.')}
      </p>

      ${r.reporter_verdict_note
        ? `<p class="demo-note" style="margin-top: var(--s-sm)"><strong>What the reporter said</strong>
             ${escapeHtml(r.reporter_verdict_note)}</p>`
        : ''}

      <p class="field-hint" style="margin-top: var(--s-sm)">
        ${RELATIONSHIP_NOTE[r.reporter_relationship] || 'The reporter did not say whether they were affected or witnessing.'}
      </p>

      <div class="verify-actions">
        <label class="visually-hidden" for="rn-${id}">Sign-off note</label>
        <input id="rn-${id}" class="review-note" placeholder="Sign-off note (optional)">
        <button class="btn btn-sm review-btn" type="button" data-case="${id}">Sign off</button>
      </div>
      <p class="msg review-msg" data-msg-for="${id}" role="status" aria-live="polite"></p>
    </div>`;
}

async function loadReviews() {
  const { pending, disputed } = await apiRequest('GET', '/api/admin/reviews');
  const list = document.getElementById('review-list');
  const summary = document.getElementById('review-summary');

  summary.textContent = disputed > 0
    ? `${plural(pending.length, 'case', 'cases')} waiting · ${disputed} disputed`
    : plural(pending.length, 'case waiting', 'cases waiting');

  if (!pending.length) {
    list.innerHTML = `
      <div class="card">
        <div class="table-empty">
          <strong>Nothing waiting on you.</strong>
          Every resolved case on record has been signed off.
        </div>
      </div>`;
    return;
  }

  // Disputed first: a reporter saying "this was not resolved" is the single most
  // important thing on this screen.
  const ordered = [...pending].sort((a, b) => {
    const rank = (r) => (r.reporter_verdict === 'disputed' ? 0 : r.reporter_verdict ? 1 : 2);
    return rank(a) - rank(b);
  });

  list.innerHTML = `<div class="review-grid">${ordered.map(reviewCard).join('')}</div>`;

  list.querySelectorAll('.review-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const caseId = btn.dataset.case;
      const note = list.querySelector(`#rn-${CSS.escape(caseId)}`)?.value || '';
      const msg = list.querySelector(`.review-msg[data-msg-for="${caseId}"]`);

      btn.disabled = true;
      btn.textContent = 'Signing off…';
      msg.textContent = '';
      msg.className = 'msg review-msg';

      try {
        await apiRequest('POST', `/api/admin/reviews/${encodeURIComponent(caseId)}`, { note });
        await loadReviews();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'msg review-msg error';
        btn.disabled = false;
        btn.textContent = 'Sign off';
      }
    }));
}

/* ---------- provisioning an officer -------------------------------------- */

const officerForm = document.getElementById('officer-form');
const officerMessage = document.getElementById('officer-message');

officerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!officerForm.checkValidity()) {
    officerForm.reportValidity();
    return;
  }

  const data = Object.fromEntries(new FormData(officerForm));
  const submit = officerForm.querySelector('.btn-submit');
  submit.disabled = true;
  submit.textContent = 'Creating…';
  officerMessage.textContent = '';
  officerMessage.className = 'msg';

  try {
    const { user } = await apiRequest('POST', '/api/admin/users', data);
    officerForm.reset();
    officerMessage.textContent =
      `${user.name} can now sign in with ${user.email}. Give them the password directly — it is not shown again.`;
    officerMessage.className = 'msg success';
    // The roster and the headcount both just changed.
    await Promise.all([loadOfficers(), loadOverview()]);
  } catch (err) {
    officerMessage.textContent = err.message;
    officerMessage.className = 'msg error';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Create officer account';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

Promise.all([loadOverview(), loadAnalytics(), loadReviews(), loadOfficers(), loadCitizens()]).catch(() => {
  window.location.href = 'login.html';
});
