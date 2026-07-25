document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const message = document.getElementById('message');
  try {
    await apiRequest('POST', '/api/auth/register', {
      name: form.get('name'), email: form.get('email'), password: form.get('password'), role: 'citizen'
    });
    message.textContent = 'Registered! You can now log in.';
    message.className = 'success';
  } catch (err) {
    message.textContent = err.message;
    message.className = 'error';
  }
});
