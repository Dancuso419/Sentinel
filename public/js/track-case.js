// Public track-by-case-ID. No session involved: the case ID is the credential.
//
// The result renders the lifecycle as the trail component, because "what happened
// to my report" is a question about position in a sequence, not a single word.

const WORKFLOW = ['pending', 'investigating', 'resolved'];
const STEP_LABEL = { pending: 'Filed', investigating: 'Investigating', resolved: 'Resolved' };
const STATUS_LABEL = { pending: 'Pending', investigating: 'Investigating', resolved: 'Resolved' };

const trackForm = document.getElementById('track-form');
const result = document.getElementById('result');

function fmt(ts) {
  return String(ts || '').slice(0, 16).replace('T', ' ');
}

function renderTrail(status) {
  const reached = WORKFLOW.indexOf(status);
  return WORKFLOW.map((step, i) => {
    const state = i < reached ? 'is-done' : i === reached ? 'is-current' : 'is-muted';
    return `
      <div class="trail-node ${state}"><span class="trail-dot"></span><span>${STEP_LABEL[step]}</span></div>
      ${i < WORKFLOW.length - 1 ? '<div class="trail-line"></div>' : ''}
    `;
  }).join('');
}

const VERDICT_PILL = {
  confirmed: '<span class="pill pill-confirmed">Confirmed by reporter</span>',
  disputed: '<span class="pill pill-disputed">Disputed by reporter</span>'
};

function renderVerification(report) {
  if (report.status !== 'resolved') return '';

  if (report.reporter_verdict) {
    return `
      <div class="verify-box">
        <div class="verdict-line">
          ${VERDICT_PILL[report.reporter_verdict]}
          <span class="mono muted">${escapeHtml(fmt(report.reporter_verdict_at))}</span>
        </div>
        ${report.reviewed_at
          ? `<p style="margin-top: 8px">An administrator has also signed this case off.</p>`
          : `<p style="margin-top: 8px">Awaiting an administrator's sign-off.</p>`}
      </div>`;
  }

  // Only offered where the case ID is genuinely the only key — a report filed from
  // an account is confirmed from its owner's dashboard instead.
  if (!report.can_verify) {
    return `
      <div class="verify-box">
        <p>${report.reviewed_at
          ? 'An administrator has signed this case off.'
          : 'This resolution is waiting on an administrator&rsquo;s review.'}</p>
        <p style="margin-top: 6px">If you filed this from an account, confirm the outcome from
          <a href="login.html">your dashboard</a>.</p>
      </div>`;
  }

  return `
    <div class="verify-box" id="verify">
      <h3>Does this match what happened?</h3>
      <p>${report.reporter_relationship === 'witness'
        ? 'You reported this as a witness, so your answer is recorded as a third-party account — an administrator reviews the outcome either way.'
        : 'Your answer is recorded on the case and read by an administrator before it is signed off.'}</p>
      <label class="visually-hidden" for="verify-note">Anything to add</label>
      <textarea id="verify-note" placeholder="Anything to add (optional)"></textarea>
      <div class="verify-actions">
        <button class="btn btn-sm" type="button" data-verdict="confirmed">Yes, this is resolved</button>
        <button class="btn btn-secondary btn-sm" type="button" data-verdict="disputed">No, this is not resolved</button>
      </div>
      <p class="msg" id="verify-msg" role="status" aria-live="polite"></p>
    </div>`;
}

function renderCase(report) {
  const status = WORKFLOW.includes(report.status) ? report.status : 'pending';
  return `
    <div class="card rise">
      <div class="card-head">
        <span class="demo-id">${escapeHtml(report.case_id)}</span>
        <span class="pill pill-${status}">${STATUS_LABEL[status]}</span>
      </div>

      <div class="trail-track">${renderTrail(status)}</div>

      <div class="demo-divider" style="margin: var(--s-lg) 0"></div>

      <dl class="demo-meta">
        <div><dt>Incident type</dt><dd>${escapeHtml(report.type)}</dd></div>
        <div><dt>Filed</dt><dd class="mono">${escapeHtml(fmt(report.created_at))}</dd></div>
        <div><dt>Last updated</dt><dd class="mono">${escapeHtml(fmt(report.updated_at))}</dd></div>
        <div><dt>Handled by</dt><dd>${report.handled_by
          ? escapeHtml(report.handled_by)
          : '<span class="muted">Not yet assigned</span>'}</dd></div>
      </dl>

      ${status === 'resolved' && report.resolution_note
        ? `<p class="demo-note"><strong>Resolution note</strong> ${escapeHtml(report.resolution_note)}</p>`
        : status === 'pending'
          ? '<p class="demo-note muted">No officer has picked this case up yet. Check back — the status changes here as soon as one does.</p>'
          : '<p class="demo-note muted">An officer is working this case. A resolution note appears here once it closes.</p>'}

      ${renderVerification(report)}
    </div>
  `;
}

function wireVerification(caseId) {
  const box = document.getElementById('verify');
  if (!box) return;

  box.querySelectorAll('[data-verdict]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const verdict = btn.dataset.verdict;
      const note = document.getElementById('verify-note').value;
      const msg = document.getElementById('verify-msg');
      const buttons = box.querySelectorAll('[data-verdict]');

      buttons.forEach((b) => { b.disabled = true; });
      msg.textContent = '';
      msg.className = 'msg';

      try {
        await apiRequest('POST', `/api/cases/${encodeURIComponent(caseId)}/verify`, { verdict, note });
        // Re-read rather than patching the DOM, so what is shown is what was stored.
        const report = await apiRequest('GET', `/api/cases/${encodeURIComponent(caseId)}`);
        result.innerHTML = renderCase(report);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'msg error';
        buttons.forEach((b) => { b.disabled = false; });
      }
    }));
}

trackForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = trackForm.elements.case_id;
  const caseId = input.value.trim();

  if (!caseId) {
    result.innerHTML = '<p class="error">Enter a case ID. It looks like <span class="mono">CR-2026-0001</span>.</p>';
    input.focus();
    return;
  }

  const submit = trackForm.querySelector('.btn-submit');
  submit.disabled = true;
  submit.textContent = 'Checking…';
  result.innerHTML = '<p class="muted">Reading the case record…</p>';

  try {
    const report = await apiRequest('GET', `/api/cases/${encodeURIComponent(caseId)}`);
    result.innerHTML = renderCase(report);
    wireVerification(report.case_id);
  } catch {
    // One message for both "no such case" and "not yours" — the page must never
    // confirm which case IDs exist. See PRODUCT.md principle 1.
    result.innerHTML = `
      <p class="error">No case matches that ID. Check every character, including the year —
      case IDs look like <span class="mono">CR-2026-0001</span>.</p>`;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Check status';
  }
});
