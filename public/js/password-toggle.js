// Show/hide control for every password field on the page.
//
// Applied by script rather than written into each form so the five password inputs
// across login, register and account can never drift apart. Loaded after the page's
// own form script; toggling `type` does not disturb the value or any validation
// attribute already on the input.

const EYE = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M1.8 10S4.9 4.5 10 4.5 18.2 10 18.2 10 15.1 15.5 10 15.5 1.8 10 1.8 10Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.4"/></svg>';

const EYE_OFF = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.1 5a7.6 7.6 0 0 1 1.9-.2c5.1 0 8.2 5.2 8.2 5.2a14.4 14.4 0 0 1-2.5 3.1M4.5 6.4A14.3 14.3 0 0 0 1.8 10s3.1 5.2 8.2 5.2c1.3 0 2.5-.3 3.5-.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="m3.6 3.6 12.8 12.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

function attachToggle(input) {
  const wrap = document.createElement('span');
  wrap.className = 'password-field';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'password-toggle';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', 'Show password');
  btn.setAttribute('title', 'Show password');
  btn.innerHTML = EYE;
  wrap.appendChild(btn);

  function setVisible(visible) {
    input.type = visible ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(visible));
    btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    btn.setAttribute('title', visible ? 'Hide password' : 'Show password');
    btn.innerHTML = visible ? EYE_OFF : EYE;
  }

  btn.addEventListener('click', (e) => {
    // These inputs sit inside their <label>, so a click here would also reach the
    // label and get forwarded to the input. Stopping it keeps focus handling ours.
    e.preventDefault();
    e.stopPropagation();

    const visible = input.type === 'password';
    setVisible(visible);

    // Put the caret back at the end rather than dumping the user at position 0.
    input.focus();
    const end = input.value.length;
    try {
      input.setSelectionRange(end, end);
    } catch {
      // Some browsers refuse setSelectionRange on a field mid-type-change; the
      // focus above is the part that matters.
    }
  });

  // Never leave a password legible after the form is done with it. Covers both the
  // submit path and the reset() the account page calls on success.
  const form = input.form;
  if (form) {
    form.addEventListener('submit', () => setVisible(false));
    form.addEventListener('reset', () => setVisible(false));
  }
}

document.querySelectorAll('input[type="password"]').forEach(attachToggle);
