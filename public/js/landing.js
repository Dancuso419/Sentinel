// Landing page: live system status tiles + the inline case tracker.
//
// Nothing on this page is mock data. The tiles read /api/stats (aggregate counts
// only — never case IDs, see routes/stats.js) and the tracker reads a real case
// record. If either call fails the page degrades to honest placeholders rather
// than showing a number that isn't true.

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORKFLOW = ['pending', 'investigating', 'resolved'];
const STATUS_LABEL = { pending: 'Pending', investigating: 'Investigating', resolved: 'Resolved' };

/* ---------- live status tiles ------------------------------------------- */

function countTo(el, value) {
  if (REDUCED_MOTION || value === 0) {
    el.textContent = String(value);
    return;
  }
  const duration = 620;
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    // exponential ease-out: fast arrival, settles rather than decelerates evenly
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = String(Math.round(value * eased));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function loadStats() {
  const tiles = document.querySelectorAll('[data-stat]');
  try {
    const stats = await apiRequest('GET', '/api/stats');
    tiles.forEach((el) => {
      const value = stats[el.dataset.stat];
      if (typeof value === 'number') countTo(el, value);
      else el.textContent = '—';
    });
  } catch {
    // The system genuinely can't be read — say so instead of showing zeros,
    // which would read as "no crime reported" rather than "no answer".
    tiles.forEach((el) => { el.textContent = '—'; });
    const head = document.querySelector('.live-dot');
    if (head) {
      head.textContent = 'Status unavailable';
      head.classList.add('is-down');
    }
  }
}

/* ---------- inline tracker ----------------------------------------------- */

function renderTrail(status) {
  const reached = WORKFLOW.indexOf(status);
  return WORKFLOW.map((step, i) => {
    const state = i < reached ? 'is-done' : i === reached ? 'is-current' : 'is-muted';
    const label = step === 'pending' ? 'Filed' : STATUS_LABEL[step];
    return `
      <div class="trail-node ${state}"><span class="trail-dot"></span><span>${label}</span></div>
      ${i < WORKFLOW.length - 1 ? '<div class="trail-line"></div>' : ''}
    `;
  }).join('');
}

function renderCase(report) {
  const status = WORKFLOW.includes(report.status) ? report.status : 'pending';
  return `
    <div class="demo-row">
      <span class="demo-id">${escapeHtml(report.case_id)}</span>
      <span class="pill pill-${status}">${STATUS_LABEL[status]}</span>
    </div>
    <div class="trail-track">${renderTrail(status)}</div>
    <dl class="demo-meta">
      <div><dt>Incident type</dt><dd>${escapeHtml(report.type)}</dd></div>
      <div><dt>Last updated</dt><dd class="mono">${escapeHtml((report.updated_at || '').slice(0, 16).replace('T', ' '))}</dd></div>
    </dl>
    ${status === 'resolved' && report.resolution_note
      ? `<p class="demo-note"><strong>Resolution</strong> ${escapeHtml(report.resolution_note)}</p>`
      : ''}
  `;
}

const form = document.getElementById('track-inline');
const result = document.getElementById('inline-result');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = form.elements.case_id;
  const caseId = input.value.trim();

  if (!caseId) {
    result.dataset.state = 'error';
    result.innerHTML = '<p class="error">Enter a case ID to check. It looks like CR-2026-0001.</p>';
    input.focus();
    return;
  }

  result.dataset.state = 'loading';
  result.innerHTML = '<p class="muted" style="font-size: var(--t-small)">Reading the case record…</p>';

  try {
    const report = await apiRequest('GET', `/api/cases/${encodeURIComponent(caseId)}`);
    result.dataset.state = 'found';
    result.innerHTML = renderCase(report);
  } catch {
    // Deliberately identical wording for "wrong ID" and "no such case" — the page
    // must not confirm which case IDs exist. See PRODUCT.md principle 1.
    result.dataset.state = 'error';
    result.innerHTML = `
      <p class="error">No case matches that ID. Check the characters and the year —
      case IDs look like <span class="mono">CR-2026-0001</span>.</p>
      <p class="muted" style="font-size: var(--t-small); margin-top: 10px">Lost the ID from a walk-in
      report? It cannot be recovered — you will need to file again.</p>`;
  }
});

loadStats();
