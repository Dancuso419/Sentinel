// The app shell: retractable sidebar + the signed-in account chip.
//
// The open/closed class is set by a tiny inline script in each page's <head>, before
// first paint — otherwise the rail renders collapsed and then visibly snaps open on
// every navigation. This file owns the toggle, the ARIA state, and naming the account.
//
// Below 860px the rail is a bottom bar and retracting is meaningless, so the toggle
// is hidden by CSS and the class has no layout effect.

// ROLE_LABEL and initials() come from api.js, which every page loads first.
const RAIL_KEY = 'sentinel.rail';
const ROLE_HOME = {
  citizen: 'citizen-dashboard.html',
  officer: 'officer-dashboard.html',
  admin: 'admin-dashboard.html'
};

const railToggle = document.getElementById('rail-toggle');

function setRail(open, persist) {
  document.documentElement.classList.toggle('rail-open', open);
  railToggle.setAttribute('aria-expanded', String(open));
  railToggle.setAttribute('data-label', open ? 'Collapse sidebar' : 'Expand sidebar');
  railToggle.setAttribute('aria-label', open ? 'Collapse sidebar' : 'Expand sidebar');
  if (persist) {
    try {
      localStorage.setItem(RAIL_KEY, open ? 'open' : 'closed');
    } catch {
      // Private mode or blocked storage: the toggle still works for this page view.
    }
  }
}

setRail(document.documentElement.classList.contains('rail-open'), false);

railToggle.addEventListener('click', () => {
  setRail(!document.documentElement.classList.contains('rail-open'), true);
});

/* ---------- in-page section links ---------------------------------------- */

// The admin rail navigates within one long page. A bare href="#officers" scrolls
// but gives no feedback — the Overview item stays lit, so it reads as "nothing
// happened". These links move the highlight and scroll smoothly, and an observer
// keeps the highlight honest when the user scrolls by hand instead.
const sectionLinks = Array.from(document.querySelectorAll('.rail-link[href^="#"]'));

if (sectionLinks.length) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const markActive = (link) => {
    sectionLinks.forEach((l) => l.removeAttribute('aria-current'));
    if (link) link.setAttribute('aria-current', 'true');
  };

  sectionLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', link.getAttribute('href'));
      markActive(link);
    });
  });

  const sections = sectionLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const seen = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => seen.set(entry.target, entry.intersectionRatio));
      // Highest-on-screen section wins, so scrolling past a short section doesn't
      // leave the previous one lit.
      let best = null;
      let bestTop = Infinity;
      sections.forEach((section) => {
        if (!seen.get(section)) return;
        const top = section.getBoundingClientRect().top;
        if (top < bestTop) { bestTop = top; best = section; }
      });
      if (best) markActive(sectionLinks[sections.indexOf(best)]);
    }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

    sections.forEach((section) => observer.observe(section));
  }
}

/* ---------- signed-in account ------------------------------------------- */

// Deliberately non-fatal. Each dashboard already redirects to login when its own
// data call 401s; if this one fails too, letting it redirect as well would race
// that and could bounce a user mid-render.
async function loadAccount() {
  const chip = document.getElementById('rail-account');
  if (!chip) return;

  try {
    const { user } = await apiRequest('GET', '/api/auth/me');
    const role = ROLE_LABEL[user.role] || user.role;

    // Drives the admin-only rail items and the "viewing as administrator" notice on
    // the officer queue, so an admin never wonders whose account they are in.
    document.body.dataset.role = user.role;

    chip.querySelector('[data-account="initials"]').textContent = initials(user.name);
    chip.querySelector('[data-account="name"]').textContent = user.name;
    chip.querySelector('[data-account="role"]').textContent = role;
    chip.setAttribute('data-label', `${user.name} — ${role}`);
    chip.setAttribute('aria-label', `Account: ${user.name}, ${role}`);

    // account.html has no dashboard of its own to return to; fill in the right one.
    const home = document.getElementById('rail-home');
    if (home) {
      home.href = ROLE_HOME[user.role] || 'index.html';
      home.querySelector('.rail-label').textContent =
        user.role === 'citizen' ? 'My reports' : user.role === 'admin' ? 'Overview' : 'Case queue';
    }
  } catch {
    chip.querySelector('[data-account="name"]').textContent = 'Not signed in';
    chip.querySelector('[data-account="role"]').textContent = '';
  }
}

loadAccount();
