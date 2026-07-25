async function loadReports(params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const { reports } = await apiRequest('GET', `/api/officer/reports?${qs}`);
  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${escapeHtml(r.case_id)}</td><td>${escapeHtml(r.type)}</td><td>${r.is_anonymous ? 'Anonymous' : escapeHtml(r.citizen_name || 'Walk-in')}</td>
      <td>${escapeHtml(r.location)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>
        <select data-case="${r.case_id}" class="status-select">
          <option ${r.status === 'pending' ? 'selected' : ''}>pending</option>
          <option ${r.status === 'investigating' ? 'selected' : ''}>investigating</option>
          <option ${r.status === 'resolved' ? 'selected' : ''}>resolved</option>
        </select>
        <input data-case="${r.case_id}" class="note-input" placeholder="Resolution note" value="${escapeHtml(r.resolution_note || '')}">
        <button data-case="${r.case_id}" class="save-btn">Save</button>
      </td>
      <td>${r.evidence_path ? `<a href="/api/officer/reports/${r.case_id}/evidence" target="_blank" rel="noopener">View</a>` : '—'}</td>
      <td><a href="/api/officer/reports/${r.case_id}/pdf">Download</a></td>
      <td><button type="button" class="history-btn" data-case="${r.case_id}">History</button></td>
    </tr>
    <tr class="history-row" data-history-for="${r.case_id}" style="display:none"><td colspan="9"></td></tr>
  `).join('');

  tbody.querySelectorAll('.save-btn').forEach(btn => btn.addEventListener('click', async () => {
    const caseId = btn.dataset.case;
    const status = tbody.querySelector(`.status-select[data-case="${caseId}"]`).value;
    const resolution_note = tbody.querySelector(`.note-input[data-case="${caseId}"]`).value;
    try {
      await apiRequest('PATCH', `/api/officer/reports/${caseId}/status`, { status, resolution_note });
      loadReports(Object.fromEntries(new FormData(document.getElementById('filter-form'))));
    } catch (err) {
      alert(err.message);
    }
  }));

  tbody.querySelectorAll('.history-btn').forEach(btn => btn.addEventListener('click', async () => {
    const caseId = btn.dataset.case;
    const historyRow = tbody.querySelector(`.history-row[data-history-for="${caseId}"]`);
    const cell = historyRow.querySelector('td');
    if (historyRow.style.display !== 'none') {
      historyRow.style.display = 'none';
      return;
    }
    try {
      const { history } = await apiRequest('GET', `/api/officer/reports/${caseId}/history`);
      cell.innerHTML = history.map(h => `${escapeHtml(h.status)} — ${escapeHtml(h.updated_by)} — ${escapeHtml(h.updated_at)}`).join('<br>');
      historyRow.style.display = 'table-row';
    } catch (err) {
      alert(err.message);
    }
  }));
}

document.getElementById('filter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  loadReports(Object.fromEntries(new FormData(e.target)));
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

loadReports().catch(() => {
  window.location.href = 'login.html';
});
