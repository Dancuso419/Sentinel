function renderRow(r) {
  const editable = r.status === 'pending';
  return `
    <tr data-case="${r.case_id}">
      <td>${escapeHtml(r.case_id)}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.updated_at)}</td>
      <td>${r.evidence_path ? `<a href="/api/cases/${r.case_id}/evidence" target="_blank" rel="noopener">View</a>` : '—'}</td>
      <td><a href="/api/cases/${r.case_id}/pdf">Download</a></td>
      <td>
        ${editable ? `<button type="button" class="edit-btn" data-case="${r.case_id}">Edit</button>
        <button type="button" class="withdraw-btn" data-case="${r.case_id}">Withdraw</button>` : ''}
      </td>
    </tr>
    ${editable ? `
    <tr class="edit-row" data-edit-for="${r.case_id}" style="display:none">
      <td colspan="7">
        <form class="edit-form" data-case="${r.case_id}">
          <label>Type <input name="type" value="${escapeHtml(r.type)}"></label>
          <label>Location <input name="location" value="${escapeHtml(r.location || '')}"></label>
          <label>Description <textarea name="description">${escapeHtml(r.description || '')}</textarea></label>
          <label>Incident time <input name="incident_time" value="${escapeHtml(r.incident_time || '')}"></label>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>` : ''}
  `;
}

async function loadReports() {
  const { reports } = await apiRequest('GET', '/api/cases/mine');
  const banner = document.getElementById('banner');
  const anyUnseen = reports.some(r => r.unseen_status_change);
  if (anyUnseen) {
    banner.textContent = 'One or more of your reports has a status update.';
    banner.style.display = 'block';
  }

  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = reports.map(renderRow).join('');

  tbody.querySelectorAll('.edit-btn').forEach((btn) => btn.addEventListener('click', () => {
    const caseId = btn.dataset.case;
    const row = tbody.querySelector(`.edit-row[data-edit-for="${caseId}"]`);
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  }));

  tbody.querySelectorAll('.edit-form').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const caseId = form.dataset.case;
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest('PUT', `/api/reports/${caseId}`, data);
      await loadReports();
    } catch (err) {
      alert(err.message);
    }
  }));

  tbody.querySelectorAll('.withdraw-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const caseId = btn.dataset.case;
    if (!confirm(`Withdraw report ${caseId}? This cannot be undone.`)) return;
    try {
      await apiRequest('DELETE', `/api/reports/${caseId}`);
      await loadReports();
    } catch (err) {
      alert(err.message);
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
