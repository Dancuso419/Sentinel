document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const message = document.getElementById('message');
  try {
    const { user } = await apiRequest('POST', '/api/auth/login', {
      email: form.get('email'), password: form.get('password')
    });
    const destinations = { citizen: 'citizen-dashboard.html', officer: 'officer-dashboard.html', admin: 'admin-dashboard.html' };
    window.location.href = destinations[user.role];
  } catch (err) {
    message.textContent = err.message;
    message.className = 'error';
  }
});
