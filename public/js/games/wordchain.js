// ─── WORD CHAIN CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;

  function clearTimer() { clearInterval(timerInterval); }

  function render(data) {
    clearTimer();
    if (data.gameOver) return; // handled by game-over event

    const myId = socket.id;
    const isMyTurn = data.currentPlayerId === myId;

    gameView.innerHTML = `
      <div class="wc-game fade-in">
        <div class="wc-header">
          <span>🔗 Word Chain</span>
          <span class="wc-timer" id="wc-timer">${data.timeLimit}</span>
        </div>

        <div class="wc-word-display">
          <div class="wc-current-word">${escapeHtml(data.currentWord)}</div>
          <div class="wc-last-letter">Next word must start with: <strong class="wc-letter-highlight">${data.lastLetter.toUpperCase()}</strong></div>
        </div>

        <div class="wc-turn-info ${isMyTurn ? 'wc-your-turn' : ''}">
          ${isMyTurn
            ? `<span>🎤 YOUR TURN!</span>`
            : `<span>Waiting for <strong>${escapeHtml(data.currentPlayerName)}</strong>...</span>`
          }
        </div>

        ${isMyTurn ? `
          <div class="wc-input-row">
            <input type="text" id="wc-word-input" class="game-input" placeholder="Type a word starting with '${data.lastLetter.toUpperCase()}'..." maxlength="30" autocomplete="off" autofocus>
            <button class="btn btn-sm btn-primary" id="wc-submit">Go!</button>
          </div>
        ` : ''}

        <div class="wc-recent">
          <div class="wc-section-label">Recent Words</div>
          <div class="wc-word-chain">
            ${data.recentWords.map(w => `
              <span class="wc-chain-word">${escapeHtml(w.word)} <small style="color:var(--text-dim)">${escapeHtml(w.playerName)}</small></span>
            `).join('<span class="wc-chain-arrow">→</span>')}
          </div>
        </div>

        <div class="wc-players">
          ${data.players.map(p => `
            <div class="wc-player ${p.eliminated ? 'wc-eliminated' : ''} ${p.id === data.currentPlayerId ? 'wc-active' : ''}">
              <span>${p.avatar || '😎'} ${escapeHtml(p.name)}</span>
              <span>${p.eliminated ? '💀' : p.score + ' pts'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    startTimer(data.timeLimit, data.currentPlayerId);

    if (isMyTurn) {
      const input = document.getElementById('wc-word-input');
      const submit = document.getElementById('wc-submit');
      submit.addEventListener('click', () => {
        const word = input.value.trim();
        if (word) {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('wordchain-word', { word });
          submit.disabled = true;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const word = input.value.trim();
          if (word) {
            if (typeof SFX !== 'undefined') SFX.click();
            socket.emit('wordchain-word', { word });
            submit.disabled = true;
          }
        }
      });
      input.focus();
    }
  }

  function startTimer(seconds, currentPlayerId) {
    let remaining = seconds;
    const timerEl = document.getElementById('wc-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 3 && timerEl) timerEl.classList.add('wc-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        // Host reports timeout for the current player
        if (isHost) {
          socket.emit('wordchain-timeout', { playerId: currentPlayerId });
        }
      }
    }, 1000);
  }

  function renderElimination(data) {
    if (typeof SFX !== 'undefined') SFX.wrong();
    const reasons = {
      invalid: 'Not a valid word!',
      wrong_letter: 'Wrong starting letter!',
      duplicate: 'Word already used!',
      timeout: 'Time\'s up!'
    };
    // Show brief elimination toast then continue
    const toast = document.createElement('div');
    toast.className = 'wc-toast fade-in';
    toast.innerHTML = `💀 <strong>${escapeHtml(data.playerName)}</strong> eliminated! ${reasons[data.reason] || ''}`;
    const container = document.querySelector('.wc-game') || gameView;
    container.insertBefore(toast, container.firstChild);
    setTimeout(() => toast.remove(), 3000);
  }

  function renderGameOver(data) {
    clearTimer();
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🔗 Word Chain — Final Results</h2>
        <div style="text-align:center;margin-bottom:16px;color:var(--text-dim);font-size:0.85rem">${data.totalWords || '?'} words chained!</div>
        <div class="results-list">
          ${data.players.map((p, i) => `
            <div class="result-row ${i === 0 ? 'winner' : ''}">
              <span class="result-rank">${p.rank}</span>
              <span class="result-name">${escapeHtml(p.name)}</span>
              <span class="result-score">${p.score.toLocaleString()} pts</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? `
          <div style="margin-top:24px;display:flex;gap:12px;justify-content:center">
            <button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button>
          </div>
        ` : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  socket.on('wordchain-state', render);
  socket.on('wordchain-eliminated', renderElimination);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
