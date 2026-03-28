// Report Issue modal – works on both index.html and lobby.html
(() => {
  const btn = document.getElementById('report-issue-btn');
  const modal = document.getElementById('report-issue-modal');
  const closeBtn = document.getElementById('report-modal-close');
  const submitBtn = document.getElementById('report-submit-btn');
  const status = document.getElementById('report-status');
  if (!btn || !modal) return;

  btn.addEventListener('click', () => { modal.style.display = 'flex'; });
  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; status.textContent = ''; status.className = 'report-status'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; status.textContent = ''; status.className = 'report-status'; } });

  submitBtn.addEventListener('click', async () => {
    const title = document.getElementById('report-title').value.trim();
    const description = document.getElementById('report-description').value.trim();
    const category = document.getElementById('report-category').value;

    if (!title) {
      status.textContent = 'Please enter a title.';
      status.className = 'report-status error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    status.textContent = '';
    status.className = 'report-status';

    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        status.textContent = 'Issue submitted successfully! Thank you.';
        status.className = 'report-status success';
        document.getElementById('report-title').value = '';
        document.getElementById('report-description').value = '';
        document.getElementById('report-category').value = 'bug';
        setTimeout(() => { modal.style.display = 'none'; status.textContent = ''; status.className = 'report-status'; }, 2000);
      } else {
        status.textContent = data.error || 'Failed to submit report.';
        status.className = 'report-status error';
      }
    } catch {
      status.textContent = 'Network error. Please try again.';
      status.className = 'report-status error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }
  });
})();
