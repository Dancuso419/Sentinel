// Account page. Works for all three roles — the only role-dependent thing is the
// one line explaining what this account can do, and the dashboard link in the rail
// (filled in by rail.js).

const ROLE_LABEL = { citizen: 'Citizen', officer: 'Officer', admin: 'Administrator' };
const ROLE_SCOPE = {
  citizen: 'This account can file reports, and correct or withdraw them while they are still pending.',
  officer: 'This account can read every report in the queue and move cases through the workflow. Status changes are recorded against it by name.',
  admin: 'This account can read aggregate trends, create officer accounts, and deactivate them.'
};

const form = document.getElementById('password-form');
const message = document.getElementById('password-message');

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function loadAccount() {
  const { user } = await apiRequest('GET', '/api/auth/me');
  document.getElementById('account-initials').textContent = initials(user.name);
  document.getElementById('account-name').textContent = user.name;
  document.getElementById('account-email').textContent = user.email;
  document.getElementById('account-role').textContent = ROLE_LABEL[user.role] || user.role;
  document.getElementById('account-created').textContent = String(user.created_at || '').slice(0, 10);
  document.getElementById('account-scope').textContent = ROLE_SCOPE[user.role] || '';
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

loadAccount().catch(() => {
  window.location.href = 'login.html';
});
