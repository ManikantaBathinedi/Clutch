// ─── MOST LIKELY TO CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;
  let hasVoted = false;

  function renderQuestion(data) {
    clearInterval(timerInterval);
    hasVoted = false;
    if (typeof SFX !== 'undefined') SFX.tick();

    gameView.innerHTML = `
      <div class="mlt-game fade-in">
        <div class="mlt-header">
          <span>Round ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="mlt-timer" id="mlt-timer">${data.timeLimit}</span>
        </div>
        <div class="mlt-question-card">
          <span class="mlt-icon">🎯</span>
          <h2 class="mlt-question-text">${escapeHtml(data.question)}</h2>
        </div>
        <p class="mlt-instruction">Vote for someone!</p>
        <div class="mlt-vote-grid" id="mlt-players">
          ${data.players.map(p => `
            <button class="mlt-vote-btn" data-id="${p.id}">
              <span class="mlt-vote-avatar">${escapeHtml(p.name).charAt(0).toUpperCase()}</span>
              <span class="mlt-vote-name">${escapeHtml(p.name)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    startTimer(data.timeLimit);

    document.getElementById('mlt-players').addEventListener('click', (e) => {
      const btn = e.target.closest('.mlt-vote-btn');
      if (!btn || hasVoted) return;
      hasVoted = true;
      if (typeof SFX !== 'undefined') SFX.click();
      document.querySelectorAll('.mlt-vote-btn').forEach(b => {
        b.disabled = true;
        b.classList.add('mlt-dimmed');
      });
      btn.classList.remove('mlt-dimmed');
      btn.classList.add('mlt-selected');
      socket.emit('player-answer', { answer: btn.dataset.id });
    });
  }

  function startTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('mlt-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 5 && timerEl) timerEl.classList.add('mlt-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (isHost) socket.emit('show-results');
      }
    }, 1000);
  }

  function renderResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();

    const maxVotes = Math.max(...data.players.map(p => p.votesReceived), 1);

    gameView.innerHTML = `
      <div class="mlt-game fade-in">
        <div class="mlt-header">
          <span>Round ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="mlt-results-label">Results</span>
        </div>
        <div class="mlt-question-card mlt-card-done">
          <h2 class="mlt-question-text">${escapeHtml(data.question)}</h2>
        </div>
        <div class="mlt-results-list">
          ${data.players.map(p => `
            <div class="mlt-result-row ${p.isMostVoted ? 'mlt-most-voted' : ''}">
              <div class="mlt-result-info">
                <span class="mlt-result-avatar ${p.isMostVoted ? 'mlt-avatar-winner' : ''}">${escapeHtml(p.name).charAt(0).toUpperCase()}</span>
                <span class="mlt-result-name">${escapeHtml(p.name)} ${p.isMostVoted ? '🍻' : ''}</span>
              </div>
              <div class="mlt-result-bar-area">
                <div class="mlt-result-track">
                  <div class="mlt-result-fill ${p.isMostVoted ? 'mlt-fill-winner' : ''}" style="width:${maxVotes > 0 ? (p.votesReceived / maxVotes * 100) : 0}%"></div>
                </div>
                <span class="mlt-result-count">${p.votesReceived}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="mlt-who-voted">
          ${data.voteDetails.map(v => `<span class="mlt-vote-chip">${escapeHtml(v.voterName)} → ${escapeHtml(v.targetName)}</span>`).join('')}
        </div>
        ${isHost ? '<button class="btn btn-sm btn-primary" id="mlt-next" style="margin-top:20px;display:block;margin-left:auto;margin-right:auto;padding:10px 32px;font-size:1rem">Next ➜</button>' : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('mlt-next')?.addEventListener('click', () => socket.emit('next-question'));
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🎯 Most Likely To — Final Results</h2>
        <p style="text-align:center;color:var(--text-dim);margin-bottom:16px">Most voted = most likely 🍻</p>
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

  socket.on('game-state', renderQuestion);
  socket.on('round-result', renderResults);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
