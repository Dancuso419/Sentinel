// Officer standings.
//
// The design constraint that matters here: a disputed resolution must never be
// hidden. It is the one number on this page that an officer would prefer not to
// show, so it sits on the podium card and in the table, not behind an expander.

const board = document.getElementById('board');
const summary = document.getElementById('board-summary');
const scope = document.getElementById('board-scope');
const tbody = document.querySelector('#board-table tbody');

const MEDAL = ['1st', '2nd', '3rd'];

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function ratioLabel(o) {
  if (!o.resolved) return 'No closures yet';
  if (!o.disputed) return 'None disputed';
  const pct = Math.round((o.disputed / o.resolved) * 100);
  return `${pct}% disputed`;
}

// The top three, as cards. Rank 1 takes the black tile — the same scarcity rule the
// rest of the system uses, one emphasis element per group.
function podium(officers) {
  const top = officers.filter((o) => o.rank !== null).slice(0, 3);
  if (!top.length) {
    return `
      <div class="card">
        <div class="table-empty">
          <strong>No case work recorded yet.</strong>
          Officers appear here once they pick up or close a case.
        </div>
      </div>`;
  }

  return `<div class="podium">${top.map((o, i) => `
    <div class="podium-card${i === 0 ? ' is-first' : ''}">
      <div class="podium-head">
        <span class="label">${MEDAL[i]}${o.rank !== i + 1 ? ' equal' : ''}</span>
        ${o.is_active ? '' : '<span class="pill pill-inactive">Deactivated</span>'}
      </div>
      <p class="podium-name">${escapeHtml(o.name)}</p>
      <p class="podium-score">${o.score}</p>
      <p class="podium-note">${plural(o.resolved, 'case', 'cases')} closed
        ${o.disputed ? `· ${o.disputed} disputed` : '· none disputed'}</p>
      <dl class="podium-meta">
        <div><dt>Picked up</dt><dd>${o.picked_up}</dd></div>
        <div><dt>Confirmed</dt><dd>${o.confirmed}</dd></div>
        <div><dt>Avg. close</dt><dd>${o.avg_days_to_resolve === null ? '—' : `${o.avg_days_to_resolve}d`}</dd></div>
      </dl>
    </div>`).join('')}</div>`;
}

function row(o) {
  return `
    <tr${o.is_active ? '' : ' class="is-muted-row"'}>
      <td class="mono">${o.rank === null ? '—' : o.rank}</td>
      <td>
        ${escapeHtml(o.name)}
        ${o.is_active ? '' : '<span class="pill pill-inactive" style="margin-left:8px">Deactivated</span>'}
      </td>
      <td class="mono">${o.picked_up}</td>
      <td class="mono">${o.resolved}</td>
      <td class="mono">${o.confirmed}</td>
      <td>${o.disputed
        ? `<span class="pill pill-disputed">${o.disputed}</span>`
        : '<span class="mono muted">0</span>'}</td>
      <td class="mono">${o.signed_off}</td>
      <td>${o.note_revisions
        ? `<span class="mono">${o.note_revisions}</span>`
        : '<span class="mono muted">0</span>'}</td>
      <td class="mono">${o.avg_days_to_resolve === null ? '—' : o.avg_days_to_resolve}</td>
      <td class="mono"><strong>${o.score}</strong></td>
    </tr>
    <tr class="detail-row">
      <td colspan="10">
        <div class="bar-row" style="grid-template-columns: minmax(120px, 18%) 1fr auto">
          <span class="bar-name">${escapeHtml(o.name.replace(/^Officer /, ''))}</span>
          <span class="bar-track quality-track">
            <span class="bar-fill is-mint" style="width: ${o.share.confirmed}%"></span>
            <span class="bar-fill is-ice" style="width: ${o.share.unanswered}%"></span>
            <span class="bar-fill is-danger" style="width: ${o.share.disputed}%"></span>
          </span>
          <span class="bar-value">${ratioLabel(o)}</span>
        </div>
      </td>
    </tr>`;
}

async function load() {
  const { officers, totals } = await apiRequest('GET', '/api/officer/performance');

  summary.querySelectorAll('[data-total]').forEach((el) => {
    el.textContent = String(totals[el.dataset.total] ?? 0);
  });

  const ranked = officers.filter((o) => o.rank !== null).length;
  scope.textContent = `${plural(ranked, 'officer', 'officers')} with case work`;

  // Each officer's closures split three ways as a share of their own total, so the
  // strip reads as "what happened to this officer's cases" rather than comparing
  // volumes — a fair comparison between someone with 10 closures and someone with 2.
  officers.forEach((o) => {
    const total = o.resolved || 1;
    const confirmed = Math.round((o.confirmed / total) * 100);
    const disputed = Math.round((o.disputed / total) * 100);
    o.share = {
      confirmed: o.resolved ? confirmed : 0,
      disputed: o.resolved ? disputed : 0,
      unanswered: o.resolved ? Math.max(100 - confirmed - disputed, 0) : 0
    };
  });

  board.innerHTML = podium(officers);
  tbody.innerHTML = officers.map(row).join('');
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiRequest('POST', '/api/auth/logout').catch(() => {});
  window.location.href = 'login.html';
});

load().catch(() => {
  window.location.href = 'login.html';
});
