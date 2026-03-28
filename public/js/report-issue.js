// Report Issue modal – works on both index.html and lobby.html
(() => {
  const btn = document.getElementById('report-issue-btn');
  const modal = document.getElementById('report-issue-modal');
  const closeBtn = document.getElementById('report-modal-close');
  const cancelBtn = document.getElementById('report-cancel-btn');
  const submitBtn = document.getElementById('report-submit-btn');
  const status = document.getElementById('report-status');
  const fileInput = document.getElementById('report-screenshot');
  const uploadArea = document.getElementById('screenshot-upload-area');
  const placeholder = document.getElementById('screenshot-placeholder');
  const preview = document.getElementById('screenshot-preview');
  const previewImg = document.getElementById('screenshot-img');
  const removeBtn = document.getElementById('screenshot-remove');
  if (!btn || !modal) return;

  let screenshotBase64 = null;

  function closeModal() {
    modal.style.display = 'none';
    status.textContent = '';
    status.className = 'report-status';
  }

  function resetForm() {
    document.getElementById('report-title').value = '';
    document.getElementById('report-description').value = '';
    document.getElementById('report-category').value = 'bug';
    const sev = document.getElementById('report-severity');
    if (sev) sev.value = 'medium';
    clearScreenshot();
  }

  function clearScreenshot() {
    screenshotBase64 = null;
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = 'Screenshot must be under 5MB.';
      status.className = 'report-status error';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      screenshotBase64 = e.target.result;
      if (previewImg) previewImg.src = screenshotBase64;
      if (preview) preview.style.display = 'inline-block';
      if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  btn.addEventListener('click', () => { modal.style.display = 'flex'; });
  closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Screenshot upload handlers
  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', (e) => {
      if (e.target.closest('.screenshot-remove')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
  }
  if (removeBtn) removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearScreenshot();
  });

  submitBtn.addEventListener('click', async () => {
    const title = document.getElementById('report-title').value.trim();
    const description = document.getElementById('report-description').value.trim();
    const category = document.getElementById('report-category').value;
    const severity = document.getElementById('report-severity')?.value || 'medium';

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
        body: JSON.stringify({ title, description, category, severity, screenshot: screenshotBase64 })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        status.textContent = '✅ Issue submitted successfully! Thank you.';
        status.className = 'report-status success';
        resetForm();
        setTimeout(closeModal, 2500);
      } else {
        status.textContent = data.error || 'Failed to submit report.';
        status.className = 'report-status error';
      }
    } catch {
      status.textContent = 'Network error. Please try again.';
      status.className = 'report-status error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '📨 Submit Report';
    }
  });
})();
