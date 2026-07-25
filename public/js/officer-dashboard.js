async function loadReports(params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const { reports } = await apiRequest('GET', `/api/officer/reports?${qs}`);
  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${r.case_id}</td><td>${r.type}</td><td>${r.is_anonymous ? 'Anonymous' : (r.citizen_name || 'Walk-in')}</td>
      <td>${r.status}</td>
      <td>
        <select data-case="${r.case_id}" class="status-select">
          <option ${r.status === 'pending' ? 'selected' : ''}>pending</option>
          <option ${r.status === 'investigating' ? 'selected' : ''}>investigating</option>
          <option ${r.status === 'resolved' ? 'selected' : ''}>resolved</option>
        </select>
        <input data-case="${r.case_id}" class="note-input" placeholder="Resolution note" value="${r.resolution_note || ''}">
        <button data-case="${r.case_id}" class="save-btn">Save</button>
      </td>
      <td><a href="/api/officer/reports/${r.case_id}/pdf">Download</a></td>
    </tr>
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
}

document.getElementById('filter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  loadReports(Object.fromEntries(new FormData(e.target)));
});

loadReports();
