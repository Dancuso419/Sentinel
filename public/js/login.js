const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('message');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!loginForm.checkValidity()) {
    loginForm.reportValidity();
    return;
  }

  const submit = loginForm.querySelector('.btn-submit');
  const data = new FormData(loginForm);
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  loginMessage.textContent = '';
  loginMessage.className = 'msg';

  try {
    const { user } = await apiRequest('POST', '/api/auth/login', {
      email: data.get('email'),
      password: data.get('password')
    });
    const destinations = {
      citizen: 'citizen-dashboard.html',
      officer: 'officer-dashboard.html',
      admin: 'admin-dashboard.html'
    };
    window.location.href = destinations[user.role] || 'index.html';
  } catch (err) {
    loginMessage.textContent = err.message;
    loginMessage.className = 'msg error';
    submit.disabled = false;
    submit.textContent = 'Log in';
  }
});
