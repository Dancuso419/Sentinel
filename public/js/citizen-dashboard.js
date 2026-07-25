(async () => {
  const { reports } = await apiRequest('GET', '/api/cases/mine');
  const banner = document.getElementById('banner');
  const anyUnseen = reports.some(r => r.unseen_status_change);
  if (anyUnseen) {
    banner.textContent = 'One or more of your reports has a status update.';
    banner.style.display = 'block';
  }

  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${r.case_id}</td><td>${r.type}</td><td>${r.status}</td><td>${r.updated_at}</td>
      <td><a href="/api/cases/${r.case_id}/pdf">Download</a></td>
    </tr>
  `).join('');
})();
