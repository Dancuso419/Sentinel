const registerForm = document.getElementById('register-form');
const registerMessage = document.getElementById('message');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!registerForm.checkValidity()) {
    registerForm.reportValidity();
    return;
  }

  const submit = registerForm.querySelector('.btn-submit');
  const data = new FormData(registerForm);
  submit.disabled = true;
  submit.textContent = 'Creating account…';
  registerMessage.textContent = '';
  registerMessage.className = 'msg';

  try {
    await apiRequest('POST', '/api/auth/register', {
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
      role: 'citizen'
    });
    registerForm.reset();
    registerMessage.innerHTML = 'Account created. <a href="login.html">Log in</a> to file and follow your reports.';
    registerMessage.className = 'msg success';
    submit.disabled = false;
    submit.textContent = 'Create account';
  } catch (err) {
    registerMessage.textContent = err.message;
    registerMessage.className = 'msg error';
    submit.disabled = false;
    submit.textContent = 'Create account';
  }
});
