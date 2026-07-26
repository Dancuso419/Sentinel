// Shared by the walk-in (anonymous) and citizen report forms. The endpoint comes
// from data-endpoint on the form, so the two pages differ only in markup and copy.
//
// The walk-in path is the sensitive one: the case ID it returns is the reporter's
// only key and is never recoverable, so success is not a one-line message — it
// replaces the form with a receipt built to be read, copied, and not missed.

const form = document.getElementById('report-form');
const message = document.getElementById('message');
const isWalkIn = form.dataset.endpoint.endsWith('/walkin');

function renderReceipt(caseId) {
  const card = form.closest('.task-card');
  card.innerHTML = `
    <div class="receipt rise">
      <span class="label">Your case ID — shown once</span>
      <p class="receipt-id" id="issued-case-id">${escapeHtml(caseId)}</p>
      <p>${isWalkIn
        ? 'This report stores no identity, so there is no account to look it up from later. Save this number now — screenshot it, write it down, send it to yourself.'
        : 'This report is saved to your dashboard, so you can always find it again there.'}</p>
      <div class="receipt-actions">
        <button class="btn btn-invert" type="button" id="copy-id">Copy case ID</button>
        <a class="btn btn-secondary" href="track.html">Track this case</a>
      </div>
    </div>
    <p class="task-alt" style="margin-top: var(--s-md)">
      ${isWalkIn
        ? '<a href="report.html">File another report</a> · <a href="index.html">Back to home</a>'
        : '<a href="citizen-dashboard.html">Go to my reports</a> · <a href="report-citizen.html">File another</a>'}
    </p>
  `;

  const copyBtn = document.getElementById('copy-id');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(caseId);
      copyBtn.textContent = 'Copied';
    } catch {
      // Clipboard access can be blocked (insecure origin, denied permission).
      // Select the ID instead, so the reporter can still copy it by hand rather
      // than losing the only key they will ever get.
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('issued-case-id'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyBtn.textContent = 'Selected — press Ctrl+C';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy case ID'; }, 3000);
  });

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const submit = form.querySelector('.btn-submit');
  submit.disabled = true;
  submit.textContent = 'Submitting…';
  message.className = 'msg';
  message.textContent = '';

  try {
    const res = await fetch(form.dataset.endpoint, { method: 'POST', body: new FormData(form) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Submission failed (${res.status})`);
    renderReceipt(body.case_id);
  } catch (err) {
    message.textContent = err.message;
    message.className = 'msg error';
    submit.disabled = false;
    submit.textContent = 'Submit report';
  }
});
