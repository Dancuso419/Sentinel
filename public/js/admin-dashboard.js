async function loadAnalytics() {
  const { byType, byStatus } = await apiRequest('GET', '/api/admin/analytics');
  document.getElementById('by-type').innerHTML = byType.map(r => `<li>${r.type}: ${r.count}</li>`).join('');
  document.getElementById('by-status').innerHTML = byStatus.map(r => `<li>${r.status}: ${r.count}</li>`).join('');
}

async function loadUsers() {
  const { users } = await apiRequest('GET', '/api/admin/users');
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.name}</td><td>${u.email}</td><td>${u.is_active ? 'Yes' : 'No'}</td>
      <td><button data-id="${u.id}" data-active="${u.is_active}" class="toggle-btn">${u.is_active ? 'Deactivate' : 'Activate'}</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.toggle-btn').forEach(btn => btn.addEventListener('click', async () => {
    await apiRequest('PATCH', `/api/admin/users/${btn.dataset.id}/active`, { is_active: btn.dataset.active !== 'true' });
    loadUsers();
  }));
}

loadAnalytics();
loadUsers();
