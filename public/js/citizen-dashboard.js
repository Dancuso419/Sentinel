// Citizen dashboard: the reports this account has filed.
//
// The one rule that shapes this screen: a report is editable and withdrawable only
// while it is pending. After that it locks. Rather than showing dead controls, the
// row states plainly why the actions are gone.

const STATUS_LABEL = { pending: 'Pending', investigating: 'Investigating', resolved: 'Resolved' };

const tbody = document.querySelector('#reports-table tbody');
const banner = document.getElementById('banner');
const summary = document.getElementById('summary');

function fmt(ts) {
  return String(ts || '').slice(0, 16).replace('T', ' ');
}

function statusPill(status) {
  const known = STATUS_LABEL[status] ? status : 'pending';
  return `<span class="pill pill-${known}">${STATUS_LABEL[known]}</span>`;
}

const VERDICT_PILL = {
  confirmed: '<span class="pill pill-confirmed">You confirmed this</span>',
  disputed: '<span class="pill pill-disputed">You disputed this</span>'
};

// A resolved case is not simply "done" from the reporter's side — it is a claim
// they are entitled to answer. This row is where that answer is given.
function renderVerifyRow(r, id) {
  if (r.status !== 'resolved') return '';

  const body = r.reporter_verdict
    ? `<div class="verdict-line">
         ${VERDICT_PILL[r.reporter_verdict]}
         <span class="mono muted">${escapeHtml(fmt(r.reporter_verdict_at))}</span>
         ${r.reviewed_at
           ? '<span class="muted">· signed off by an administrator</span>'
           : '<span class="muted">· awaiting administrator sign-off</span>'}
       </div>
       ${r.reporter_verdict_note
         ? `<p class="demo-note" style="margin-top: 8px">${escapeHtml(r.reporter_verdict_note)}</p>`
         : ''}`
    : `<h3>Does this match what happened?</h3>
       <p>${r.reporter_relationship === 'witness'
         ? 'You reported this as a witness, so your answer is recorded as a third-party account. An administrator reviews the outcome either way.'
         : 'Your answer is recorded on the case and read by an administrator before sign-off.'}</p>
       <label class="visually-hidden" for="vn-${id}">Anything to add</label>
       <textarea id="vn-${id}" class="verify-note" placeholder="Anything to add (optional)"></textarea>
       <div class="verify-actions">
         <button class="btn btn-sm verify-btn" type="button" data-case="${id}" data-verdict="confirmed">Yes, this is resolved</button>
         <button class="btn btn-secondary btn-sm verify-btn" type="button" data-case="${id}" data-verdict="disputed">No, this is not resolved</button>
       </div>
       <p class="msg verify-msg" data-msg-for="${id}" role="status" aria-live="polite"></p>`;

  return `
    <tr class="detail-row">
      <td colspan="6">
        <div class="verify-box" style="margin-top: 0">
          ${r.resolution_note
            ? `<p class="demo-note" style="margin-bottom: var(--s-md)"><strong>Resolution note</strong> ${escapeHtml(r.resolution_note)}</p>`
            : ''}
          ${body}
        </div>
      </td>
    </tr>`;
}

function renderRow(r) {
  const editable = r.status === 'pending';
  const id = escapeHtml(r.case_id);

  return `
    <tr>
      <td><span class="case-id">${id}</span></td>
      <td>${escapeHtml(r.type)}</td>
      <td>${statusPill(r.status)}</td>
      <td class="mono muted">${escapeHtml(fmt(r.updated_at))}</td>
      <td>
        <div class="cell-actions">
          ${r.evidence_path
            ? `<a class="btn btn-ghost btn-sm" href="/api/cases/${id}/evidence" target="_blank" rel="noopener">Evidence</a>`
            : '<span class="muted">No file</span>'}
          <a class="btn btn-ghost btn-sm" href="/api/cases/${id}/pdf">PDF</a>
        </div>
      </td>
      <td>
        <div class="cell-actions">
          ${editable
            ? `<button type="button" class="btn btn-secondary btn-sm edit-btn" data-case="${id}"
                 aria-expanded="false" aria-controls="edit-${id}">Edit</button>
               <button type="button" class="btn btn-danger btn-sm withdraw-btn" data-case="${id}">Withdraw</button>`
            : r.status === 'resolved'
              ? `<span class="muted">Handled by ${r.handled_by ? escapeHtml(r.handled_by) : 'an officer'}</span>`
              : `<span class="muted">With ${r.handled_by ? escapeHtml(r.handled_by) : 'an officer'}</span>`}
        </div>
      </td>
    </tr>
    ${renderVerifyRow(r, id)}
    ${editable ? `
    <tr class="detail-row edit-row" id="edit-${id}" data-edit-for="${id}" hidden>
      <td colspan="6">
        <form class="edit-form" data-case="${id}">
          <p class="label muted" style="margin-bottom: var(--s-md)">Correcting ${id}</p>
          <div class="field-grid">
            <label class="field">
              <span>Incident type</span>
              <select name="type">
                ${['Theft', 'Assault', 'Vandalism', 'Fraud', 'Other']
                  .map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span>Location</span>
              <input name="location" value="${escapeHtml(r.location || '')}">
            </label>
            <label class="field">
              <span>When it happened</span>
              <input name="incident_time" type="datetime-local" value="${escapeHtml((r.incident_time || '').slice(0, 16))}">
            </label>
          </div>
          <label class="field">
            <span>Description</span>
            <textarea name="description">${escapeHtml(r.description || '')}</textarea>
          </label>
          <div class="cell-actions">
            <button class="btn btn-sm" type="submit">Save changes</button>
            <button class="btn btn-ghost btn-sm cancel-btn" type="button" data-case="${id}">Cancel</button>
          </div>
          <p class="msg" role="status" aria-live="polite"></p>
        </form>
      </td>
    </tr>` : ''}
  `;
}

function renderSummary(reports) {
  const counts = { pending: 0, investigating: 0, resolved: 0 };
  reports.forEach((r) => {
    if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] += 1;
  });
  summary.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = String(counts[el.dataset.count] ?? 0);
  });
  summary.hidden = reports.length === 0;
}

function renderEmpty() {
  tbody.innerHTML = `
    <tr class="detail-row">
      <td colspan="6">
        <div class="table-empty">
          <strong>You have not filed a report yet.</strong>
          Reports you submit with this account appear here with their case ID and current status.
          <div style="margin-top: var(--s-md)">
            <a class="btn btn-sm" href="report-citizen.html">File your first report</a>
          </div>
        </div>
      </td>
    </tr>`;
}

function toggleEdit(caseId, open) {
  const row = tbody.querySelector(`.edit-row[data-edit-for="${caseId}"]`);
  const btn = tbody.querySelector(`.edit-btn[data-case="${caseId}"]`);
  const next = open ?? row.hidden;
  row.hidden = !next;
  btn.setAttribute('aria-expanded', String(next));
  btn.textContent = next ? 'Close' : 'Edit';
}

async function loadReports() {
  const { reports } = await apiRequest('GET', '/api/cases/mine');

  if (reports.some(r => r.unseen_status_change)) {
    banner.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16" aria-hidden="true" style="flex:none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
        <path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span>A case has moved since you last looked. The new status is in the list below.</span>`;
    banner.hidden = false;
  }

  renderSummary(reports);

  if (reports.length === 0) {
    renderEmpty();
    return;
  }

  tbody.innerHTML = reports.map(renderRow).join('');

  tbody.querySelectorAll('.edit-btn').forEach((btn) =>
    btn.addEventListener('click', () => toggleEdit(btn.dataset.case)));

  tbody.querySelectorAll('.cancel-btn').forEach((btn) =>
    btn.addEventListener('click', () => toggleEdit(btn.dataset.case, false)));

  tbody.querySelectorAll('.edit-form').forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('.msg');
      const save = form.querySelector('button[type="submit"]');
      save.disabled = true;
      save.textContent = 'Saving…';
      msg.textContent = '';
      msg.className = 'msg';
      try {
        await apiRequest('PUT', `/api/reports/${form.dataset.case}`, Object.fromEntries(new FormData(form)));
        await loadReports();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'msg error';
        save.disabled = false;
        save.textContent = 'Save changes';
      }
    }));

  tbody.querySelectorAll('.verify-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const caseId = btn.dataset.case;
      const verdict = btn.dataset.verdict;
      const note = tbody.querySelector(`#vn-${CSS.escape(caseId)}`)?.value || '';
      const msg = tbody.querySelector(`.verify-msg[data-msg-for="${caseId}"]`);
      const group = tbody.querySelectorAll(`.verify-btn[data-case="${caseId}"]`);

      group.forEach((b) => { b.disabled = true; });
      msg.textContent = '';
      msg.className = 'msg verify-msg';

      try {
        await apiRequest('POST', `/api/cases/mine/${encodeURIComponent(caseId)}/verify`, { verdict, note });
        await loadReports();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'msg verify-msg error';
        group.forEach((b) => { b.disabled = false; });
      }
    }));

  tbody.querySelectorAll('.withdraw-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const caseId = btn.dataset.case;
      if (!confirm(`Withdraw ${caseId}?\n\nThe report is removed from the queue and this cannot be undone.`)) return;
      btn.disabled = true;
      btn.textContent = 'Withdrawing…';
      try {
        await apiRequest('DELETE', `/api/reports/${caseId}`);
        await loadReports();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Withdraw';
      }
    }));
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

loadReports().catch(() => {
  window.location.href = 'login.html';
});
