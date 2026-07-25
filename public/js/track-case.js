document.getElementById('track-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const caseId = new FormData(e.target).get('case_id').trim();
  const result = document.getElementById('result');
  try {
    const report = await apiRequest('GET', `/api/cases/${encodeURIComponent(caseId)}`);
    result.innerHTML = `
      <p><strong>Case:</strong> ${escapeHtml(report.case_id)}</p>
      <p><strong>Type:</strong> ${escapeHtml(report.type)}</p>
      <p><strong>Status:</strong> ${escapeHtml(report.status)}</p>
      ${report.status === 'resolved' ? `<p><strong>Resolution:</strong> ${escapeHtml(report.resolution_note)}</p>` : ''}
    `;
    result.className = '';
  } catch (err) {
    result.textContent = err.message;
    result.className = 'error';
  }
});
