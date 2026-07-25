document.getElementById('report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const endpoint = form.dataset.endpoint;
  const data = new FormData(form);
  const message = document.getElementById('message');
  try {
    const res = await fetch(endpoint, { method: 'POST', body: data });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Submission failed');
    message.textContent = `Report submitted. Your case ID is ${body.case_id}. Save this — it is shown only once.`;
    message.className = 'success';
    form.reset();
  } catch (err) {
    message.textContent = err.message;
    message.className = 'error';
  }
});
