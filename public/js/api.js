// Shared by every page. These live here rather than in each page's own script
// because classic <script> tags share one global scope: two files each declaring
// `const ROLE_LABEL` is a SyntaxError that stops the second file running at all.
const ROLE_LABEL = { citizen: 'Citizen', officer: 'Officer', admin: 'Administrator' };

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function apiRequest(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));

  // Handled centrally rather than in each page's catch: an account still on a
  // password someone else set is blocked from every route below /api/auth, so any
  // page it lands on would otherwise fail with an error the user cannot act on.
  // Sending them to the one page that can fix it is the only useful response.
  if (res.status === 403 && data.code === 'PASSWORD_CHANGE_REQUIRED'
      && !location.pathname.endsWith('/account.html')) {
    location.href = 'account.html?first=1';
    // Never settles — the navigation is already underway and letting the caller's
    // error handling run would race it.
    return new Promise(() => {});
  }

  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return data;
}
