// ─── NEVER HAVE I EVER CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;
  let hasAnswered = false;

  function renderStatement(data) {
    clearInterval(timerInterval);
    hasAnswered = false;
    if (typeof SFX !== 'undefined') SFX.tick();

    gameView.innerHTML = `
      <div class="nhie-game fade-in">
        <div class="nhie-header">
          <span>Round ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="nhie-timer" id="nhie-timer">${data.timeLimit}</span>
        </div>
        <div class="nhie-statement-card">
          <span class="nhie-icon">🙈</span>
          <h2 class="nhie-statement-text">${escapeHtml(data.statement)}</h2>
        </div>
        <div class="nhie-choices" id="nhie-choices">
          <button class="nhie-choice-btn nhie-have" id="nhie-have">
            <span class="nhie-btn-emoji">🍻</span>
            <span class="nhie-btn-label">I Have</span>
            <span class="nhie-btn-sub">drink!</span>
          </button>
          <button class="nhie-choice-btn nhie-havenot" id="nhie-havenot">
            <span class="nhie-btn-emoji">😇</span>
            <span class="nhie-btn-label">I Haven't</span>
            <span class="nhie-btn-sub">safe!</span>
          </button>
        </div>
      </div>
    `;

    startTimer(data.timeLimit);

    document.getElementById('nhie-have').addEventListener('click', () => submitAnswer('have'));
    document.getElementById('nhie-havenot').addEventListener('click', () => submitAnswer('havenot'));
  }

  function submitAnswer(choice) {
    if (hasAnswered) return;
    hasAnswered = true;
    if (typeof SFX !== 'undefined') SFX.click();

    const haveBtn = document.getElementById('nhie-have');
    const haveNotBtn = document.getElementById('nhie-havenot');
    haveBtn.disabled = true;
    haveNotBtn.disabled = true;

    if (choice === 'have') {
      haveBtn.classList.add('nhie-selected');
      haveNotBtn.classList.add('nhie-dimmed');
    } else {
      haveNotBtn.classList.add('nhie-selected');
      haveBtn.classList.add('nhie-dimmed');
    }

    socket.emit('player-answer', { answer: choice });
  }

  function startTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('nhie-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 5 && timerEl) timerEl.classList.add('nhie-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (isHost) socket.emit('show-results');
      }
    }, 1000);
  }

  function renderResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();

    const total = data.haveCount + data.haveNotCount;
    const havePct = total > 0 ? Math.round((data.haveCount / total) * 100) : 0;
    const haveNotPct = total > 0 ? (100 - havePct) : 0;

    gameView.innerHTML = `
      <div class="nhie-game fade-in">
        <div class="nhie-header">
          <span>Round ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="nhie-results-label">Results</span>
        </div>
        <div class="nhie-statement-card nhie-card-done">
          <h2 class="nhie-statement-text">${escapeHtml(data.statement)}</h2>
        </div>

        <div class="nhie-stats-row">
          <div class="nhie-stat nhie-stat-have">
            <span class="nhie-stat-emoji">🍻</span>
            <span class="nhie-stat-pct">${havePct}%</span>
            <span class="nhie-stat-label">I Have</span>
            <span class="nhie-stat-count">${data.haveCount} player${data.haveCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="nhie-stat nhie-stat-havenot">
            <span class="nhie-stat-emoji">😇</span>
            <span class="nhie-stat-pct">${haveNotPct}%</span>
            <span class="nhie-stat-label">Haven't</span>
            <span class="nhie-stat-count">${data.haveNotCount} player${data.haveNotCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div class="nhie-bar-visual">
          <div class="nhie-bar-track">
            ${havePct > 0 ? `<div class="nhie-bar-have" style="width:${havePct}%"><span>${havePct}%</span></div>` : ''}
            ${haveNotPct > 0 ? `<div class="nhie-bar-havenot" style="width:${haveNotPct}%"><span>${haveNotPct}%</span></div>` : ''}
          </div>
        </div>

        <div class="nhie-player-grid">
          ${data.players.map(p => `
            <div class="nhie-player-chip ${p.answer === 'have' ? 'nhie-chip-have' : p.answer === 'havenot' ? 'nhie-chip-havenot' : 'nhie-chip-none'}">
              <span>${p.answer === 'have' ? '🍻' : p.answer === 'havenot' ? '😇' : '🤷'}</span>
              <span>${escapeHtml(p.name)}</span>
            </div>
          `).join('')}
        </div>

        ${isHost ? '<button class="btn btn-sm btn-primary" id="nhie-next" style="margin-top:20px;display:block;margin-left:auto;margin-right:auto;padding:10px 32px;font-size:1rem">Next ➜</button>' : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('nhie-next')?.addEventListener('click', () => socket.emit('next-question'));
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🍻 Never Have I Ever — Final Results</h2>
        <p style="text-align:center;color:var(--text-dim);margin-bottom:16px">Most drinks taken = highest score</p>
        <div class="results-list">
          ${data.players.map((p, i) => `
            <div class="result-row ${i === 0 ? 'winner' : ''}">
              <span class="result-rank">${p.rank}</span>
              <span class="result-name">${escapeHtml(p.name)}</span>
              <span class="result-score">${p.score.toLocaleString()} pts</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? '<div style="margin-top:24px;display:flex;gap:12px;justify-content:center"><button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button></div>' : '<p style="color:var(--text-dim);margin-top:16px;text-align:center">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  socket.on('game-state', renderStatement);
  socket.on('round-result', renderResults);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
