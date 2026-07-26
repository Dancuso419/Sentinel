// Officer dashboard: the working queue.
//
// Two things make this screen different from the citizen one. Status only moves
// forward, so backward options are disabled rather than offered and rejected. And
// the audit trail is a first-class row expansion, not a footnote — it is the whole
// argument this system makes against the paper ledger.

const WORKFLOW = ['pending', 'investigating', 'resolved'];
const STATUS_LABEL = { pending: 'Pending', investigating: 'Investigating', resolved: 'Resolved' };
const STEP_LABEL = { pending: 'Filed', investigating: 'Investigating', resolved: 'Resolved' };

const tbody = document.querySelector('#reports-table tbody');
const filterForm = document.getElementById('filter-form');
const summary = document.getElementById('summary');
const queueCount = document.getElementById('queue-count');
const COLS = 8;

function fmt(ts) {
  return String(ts || '').slice(0, 16).replace('T', ' ');
}

function currentFilters() {
  return Object.fromEntries(new FormData(filterForm));
}

/* ---------- rows --------------------------------------------------------- */

// What a resolved case's claim is currently backed by. A disputed case is the one
// an officer most needs to see, so it is never hidden behind an expander.
function verificationMark(r) {
  if (r.status !== 'resolved') return '';
  if (r.reporter_verdict === 'disputed') {
    return '<span class="pill pill-disputed" style="margin-top:6px">Disputed by reporter</span>';
  }
  if (r.reporter_verdict === 'confirmed') {
    return '<span class="pill pill-confirmed" style="margin-top:6px">Confirmed by reporter</span>';
  }
  if (!r.reviewed_at) {
    return '<span class="pill pill-awaiting" style="margin-top:6px">Awaiting review</span>';
  }
  return '';
}

function renderRow(r) {
  const id = escapeHtml(r.case_id);
  const status = WORKFLOW.includes(r.status) ? r.status : 'pending';
  const atIdx = WORKFLOW.indexOf(status);

  // The reporter cell is where anonymity is enforced in the UI: an anonymous
  // report carries no citizen_name at all (the route strips it), and a walk-in
  // never had one.
  const reporter = r.is_anonymous
    ? '<span class="muted">Anonymous</span>'
    : escapeHtml(r.citizen_name || 'Walk-in');

  return `
    <tr>
      <td><span class="case-id">${id}</span></td>
      <td>${escapeHtml(r.type)}</td>
      <td>${reporter}</td>
      <td>${escapeHtml(r.location || '—')}</td>
      <td>
        <span class="pill pill-${status}">${STATUS_LABEL[status]}</span>
        ${verificationMark(r)}
      </td>
      <td>
        <div class="row-update">
          <label class="visually-hidden" for="status-${id}">New status for ${id}</label>
          <select id="status-${id}" class="status-select" data-case="${id}">
            ${WORKFLOW.map((s, i) => `
              <option value="${s}" ${s === status ? 'selected' : ''} ${i < atIdx ? 'disabled' : ''}>
                ${STATUS_LABEL[s]}${i < atIdx ? ' — passed' : ''}
              </option>`).join('')}
          </select>
          <label class="visually-hidden" for="note-${id}">Resolution note for ${id}</label>
          <input id="note-${id}" class="note-input" data-case="${id}" placeholder="Resolution note"
                 value="${escapeHtml(r.resolution_note || '')}">
          <button class="btn btn-sm save-btn" type="button" data-case="${id}">Save</button>
        </div>
        <p class="msg row-msg" data-msg-for="${id}" role="status" aria-live="polite"></p>
      </td>
      <td>
        <div class="cell-actions">
          ${r.evidence_path
            ? `<a class="btn btn-ghost btn-sm" href="/api/officer/reports/${id}/evidence" target="_blank" rel="noopener">Evidence</a>`
            : '<span class="muted">No file</span>'}
          <a class="btn btn-ghost btn-sm" href="/api/officer/reports/${id}/pdf">PDF</a>
        </div>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm history-btn" type="button" data-case="${id}"
                aria-expanded="false" aria-controls="trail-${id}">Trail</button>
      </td>
    </tr>
    <tr class="detail-row history-row" id="trail-${id}" data-history-for="${id}" hidden>
      <td colspan="${COLS}"></td>
    </tr>
  `;
}

// The trail is the whole chain of custody, not only status moves: a revised
// resolution note, the reporter's response, and admin sign-off all appear here in
// the order they happened.
function trailTitle(h) {
  if (h.event === 'note') return 'Resolution note revised';
  if (h.event === 'verdict') {
    return String(h.detail || '').startsWith('disputed')
      ? 'Reporter disputed the resolution'
      : 'Reporter confirmed the resolution';
  }
  if (h.event === 'review') return 'Signed off by an administrator';
  return STEP_LABEL[h.status] || h.status;
}

function trailDetail(h) {
  if (!h.detail) return '';
  const text = h.event === 'verdict' ? h.detail.replace(/^(confirmed|disputed):\s*/, '') : h.detail;
  if (!text) return '';
  return `<p class="trail-detail">${escapeHtml(text)}</p>`;
}

function renderTrail(history) {
  if (!history.length) {
    return '<p class="muted">Nothing recorded for this case yet.</p>';
  }
  return `
    <div class="trail">
      ${history.map((h, i) => {
        const last = i === history.length - 1;
        return `
        <div class="trail-step ${last ? 'is-current' : 'is-done'}">
          <span class="trail-dot"></span>
          <div class="trail-body">
            <p class="trail-title">${escapeHtml(trailTitle(h))}</p>
            <p class="trail-meta">
              <span class="mono">${escapeHtml(fmt(h.updated_at))}</span>
              · ${escapeHtml(h.updated_by)}
            </p>
            ${trailDetail(h)}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderEmpty() {
  tbody.innerHTML = `
    <tr class="detail-row">
      <td colspan="${COLS}">
        <div class="table-empty">
          <strong>No cases match these filters.</strong>
          Clear them to see the full queue.
        </div>
      </td>
    </tr>`;
}

/* ---------- summary tiles (also act as status filters) -------------------- */

async function loadSummary() {
  try {
    const stats = await apiRequest('GET', '/api/stats');
    summary.querySelectorAll('[data-count]').forEach((el) => {
      const v = stats[el.dataset.count];
      el.textContent = typeof v === 'number' ? String(v) : '—';
    });
  } catch {
    summary.querySelectorAll('[data-count]').forEach((el) => { el.textContent = '—'; });
  }
}

function markActiveTile(status) {
  summary.querySelectorAll('[data-filter]').forEach((tile) => {
    tile.setAttribute('aria-pressed', String(tile.dataset.filter === (status || '')));
  });
}

/* ---------- load ---------------------------------------------------------- */

async function loadReports(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v);
  const qs = new URLSearchParams(Object.fromEntries(entries));
  const { reports } = await apiRequest('GET', `/api/officer/reports?${qs}`);

  queueCount.textContent = reports.length === 1 ? '1 case shown' : `${reports.length} cases shown`;
  markActiveTile(params.status);

  if (reports.length === 0) {
    renderEmpty();
    return;
  }

  tbody.innerHTML = reports.map(renderRow).join('');

  tbody.querySelectorAll('.save-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const caseId = btn.dataset.case;
      const msg = tbody.querySelector(`.row-msg[data-msg-for="${caseId}"]`);
      const status = tbody.querySelector(`.status-select[data-case="${caseId}"]`).value;
      const resolution_note = tbody.querySelector(`.note-input[data-case="${caseId}"]`).value;

      btn.disabled = true;
      btn.textContent = 'Saving…';
      msg.textContent = '';
      msg.className = 'msg row-msg';

      try {
        await apiRequest('PATCH', `/api/officer/reports/${caseId}/status`, { status, resolution_note });
        await Promise.all([loadReports(currentFilters()), loadSummary()]);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'msg row-msg error';
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }));

  tbody.querySelectorAll('.history-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const caseId = btn.dataset.case;
      const row = tbody.querySelector(`.history-row[data-history-for="${caseId}"]`);
      const cell = row.querySelector('td');

      if (!row.hidden) {
        row.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Trail';
        return;
      }

      cell.innerHTML = '<p class="muted">Loading the trail…</p>';
      row.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'Hide';

      try {
        const { history } = await apiRequest('GET', `/api/officer/reports/${caseId}/history`);
        cell.innerHTML = renderTrail(history);
      } catch (err) {
        cell.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
      }
    }));
}

/* ---------- events -------------------------------------------------------- */

filterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loadReports(currentFilters()).catch(() => { window.location.href = 'login.html'; });
});

filterForm.addEventListener('reset', () => {
  // The reset lands after this handler, so read the cleared form on the next tick.
  setTimeout(() => loadReports().catch(() => { window.location.href = 'login.html'; }), 0);
});

summary.querySelectorAll('[data-filter]').forEach((tile) =>
  tile.addEventListener('click', () => {
    filterForm.elements.status.value = tile.dataset.filter;
    loadReports(currentFilters()).catch(() => { window.location.href = 'login.html'; });
  }));

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

Promise.all([loadReports(), loadSummary()]).catch(() => {
  window.location.href = 'login.html';
});
