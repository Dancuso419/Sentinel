async function loadAnalytics() {
  const { byType, byStatus, byDate } = await apiRequest('GET', '/api/admin/analytics');
  document.getElementById('by-type').innerHTML = byType.map(r => `<li>${escapeHtml(r.type)}: ${escapeHtml(r.count)}</li>`).join('');
  document.getElementById('by-status').innerHTML = byStatus.map(r => `<li>${escapeHtml(r.status)}: ${escapeHtml(r.count)}</li>`).join('');
  document.getElementById('by-date').innerHTML = (byDate || []).map(r => `<li>${escapeHtml(r.date)}: ${escapeHtml(r.count)}</li>`).join('');
}

async function loadUsers() {
  const { users } = await apiRequest('GET', '/api/admin/users');
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${u.is_active ? 'Yes' : 'No'}</td>
      <td><button data-id="${u.id}" data-active="${u.is_active}" class="toggle-btn">${u.is_active ? 'Deactivate' : 'Activate'}</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.toggle-btn').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await apiRequest('PATCH', `/api/admin/users/${btn.dataset.id}/active`, { is_active: btn.dataset.active !== '1' });
      await loadUsers();
    } catch (err) {
      alert(err.message);
    }
  }));
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

Promise.all([loadAnalytics(), loadUsers()]).catch(() => {
  window.location.href = 'login.html';
});
