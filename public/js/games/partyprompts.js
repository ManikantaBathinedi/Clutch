// ─── PILOCO CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;

  const typeEmojis = { everyone: '🎉', targeted: '🎯', challenge: '💪', versus: '⚔️', rule: '📜' };
  const typeLabels = { everyone: 'Everyone', targeted: 'Targeted', challenge: 'Challenge', versus: 'Versus', rule: 'New Rule' };

  function renderPrompt(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.tick();

    const emoji = typeEmojis[data.type] || '🍻';
    const label = typeLabels[data.type] || 'Party';

    gameView.innerHTML = `
      <div class="pp-game fade-in">
        <div class="pp-header">
          <span>Prompt ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="pp-timer" id="pp-timer">${data.timeLimit}</span>
        </div>
        <div class="pp-type-badge pp-type-${data.type}">${emoji} ${label}</div>
        <div class="pp-prompt-card">
          <p class="pp-prompt-text">${escapeHtml(data.prompt)}</p>
        </div>
        <div class="pp-action">
          <button class="btn btn-sm pp-done-btn" id="pp-done">🍻 Done!</button>
        </div>
      </div>
    `;

    startTimer(data.timeLimit);

    document.getElementById('pp-done').addEventListener('click', function () {
      this.disabled = true;
      this.textContent = '✅ Ready!';
      this.classList.add('pp-done-confirmed');
      socket.emit('player-answer', { answer: 'done' });
    });
  }

  function startTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('pp-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 3 && timerEl) timerEl.classList.add('pp-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (isHost) socket.emit('show-results');
      }
    }, 1000);
  }

  function renderResults(data) {
    clearInterval(timerInterval);
    gameView.innerHTML = `
      <div class="pp-game fade-in">
        <div class="pp-header">
          <span>Prompt ${data.questionNumber} / ${data.totalQuestions}</span>
          <span>Next up...</span>
        </div>
        <div class="pp-prompt-card pp-prompt-done">
          <p class="pp-prompt-text">${escapeHtml(data.prompt)}</p>
          <div class="pp-check">✅</div>
        </div>
        ${isHost ? '<button class="btn btn-sm btn-primary" id="pp-next" style="margin-top:16px;display:block;margin-left:auto;margin-right:auto">Next Prompt ➜</button>' : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('pp-next')?.addEventListener('click', () => socket.emit('next-question'));
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🎉 Piloco — Party's Over!</h2>
        <p style="text-align:center;color:var(--text-dim);margin-bottom:16px">That was fun! Hope everyone had a great time.</p>
        ${isHost ? '<div style="margin-top:24px;display:flex;gap:12px;justify-content:center"><button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button></div>' : '<p style="color:var(--text-dim);margin-top:16px;text-align:center">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  socket.on('game-state', renderPrompt);
  socket.on('round-result', renderResults);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
