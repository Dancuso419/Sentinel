// Account page. Works for all three roles — the only role-dependent thing is the
// one line explaining what this account can do, and the dashboard link in the rail
// (filled in by rail.js).

// ROLE_LABEL and initials() come from api.js. They must NOT be redeclared here:
// rail.js is loaded on this page too, classic scripts share one global scope, and a
// duplicate `const` is a SyntaxError that stops this entire file from running.
const ROLE_SCOPE = {
  citizen: 'This account can file reports, and correct or withdraw them while they are still pending.',
  officer: 'This account can read every report in the queue and move cases through the workflow. Status changes are recorded against it by name.',
  admin: 'This account can read aggregate trends, create officer accounts, and deactivate them.'
};

const form = document.getElementById('password-form');
const message = document.getElementById('password-message');

// Named distinctly from rail.js's loadAccount(), which fills the sidebar chip. Two
// same-named function declarations would silently overwrite each other.
// Tracked so the success message can tell a first-time officer that the rest of the
// system has just opened up, rather than only that the password changed.
let mustChangePassword = false;

async function loadAccountPage() {
  const { user } = await apiRequest('GET', '/api/auth/me');
  document.getElementById('account-initials').textContent = initials(user.name);
  document.getElementById('account-name').textContent = user.name;
  document.getElementById('account-email').textContent = user.email;
  document.getElementById('account-role').textContent = ROLE_LABEL[user.role] || user.role;
  document.getElementById('account-created').textContent = String(user.created_at || '').slice(0, 10);
  document.getElementById('account-scope').textContent = ROLE_SCOPE[user.role] || '';

  // Driven by the server's own flag, never by the ?first=1 in the URL — that is a
  // hint for the first paint, not something to trust.
  mustChangePassword = Boolean(user.must_change_password);
  document.getElementById('first-run').hidden = !mustChangePassword;

  if (mustChangePassword) {
    document.getElementById('password-form').elements.current_password.focus();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const data = new FormData(form);
  const current_password = data.get('current_password');
  const new_password = data.get('new_password');

  // Checked here rather than server-side: confirmation is a typing safeguard for
  // this form, not a property of the account.
  if (new_password !== data.get('confirm_password')) {
    message.textContent = 'The two new passwords do not match.';
    message.className = 'msg error';
    form.elements.confirm_password.focus();
    return;
  }

  const submit = form.querySelector('.btn-submit');
  submit.disabled = true;
  submit.textContent = 'Updating…';
  message.textContent = '';
  message.className = 'msg';

  try {
    await apiRequest('PATCH', '/api/auth/password', { current_password, new_password });
    form.reset();

    if (mustChangePassword) {
      // The block just lifted. Say so, and take them where they were going.
      message.innerHTML = 'Password set. Your account is now active — taking you to your dashboard…';
      message.className = 'msg success';
      await loadAccountPage();
      const { user } = await apiRequest('GET', '/api/auth/me');
      const home = {
        citizen: 'citizen-dashboard.html',
        officer: 'officer-dashboard.html',
        admin: 'admin-dashboard.html'
      }[user.role] || 'index.html';
      setTimeout(() => { window.location.href = home; }, 1200);
      return;
    }

    message.textContent = 'Password updated. Use the new one next time you sign in.';
    message.className = 'msg success';
  } catch (err) {
    message.textContent = err.message;
    message.className = 'msg error';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Update password';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

loadAccountPage().catch(() => {
  window.location.href = 'login.html';
});
