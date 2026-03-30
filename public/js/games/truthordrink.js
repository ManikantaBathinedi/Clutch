// ─── TRUTH OR DRINK CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  const myId = socket.id;
  let timerInterval = null;
  let hasAnswered = false;

  function renderQuestion(data) {
    clearInterval(timerInterval);
    hasAnswered = false;
    if (typeof SFX !== 'undefined') SFX.tick();

    const isHotSeat = data.hotSeatId === myId;

    gameView.innerHTML = `
      <div class="tod-game fade-in">
        <div class="tod-header">
          <span>Round ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="tod-timer" id="tod-timer">${data.timeLimit}</span>
        </div>
        <div class="tod-hotseat-badge">
          <span class="tod-fire">🔥</span>
          <span class="tod-hotseat-text">Hot Seat</span>
        </div>
        <div class="tod-hotseat-name">${escapeHtml(data.hotSeatName)}</div>
        <div class="tod-question-card">
          <span class="tod-question-icon">🌶️</span>
          <h2 class="tod-question-text">${escapeHtml(data.question)}</h2>
        </div>
        ${isHotSeat ? `
          <p class="tod-instruction">Answer truthfully or take a drink!</p>
          <div class="tod-choices" id="tod-choices">
            <button class="tod-choice-btn tod-truth" id="tod-truth">
              <span class="tod-btn-emoji">🗣️</span>
              <span class="tod-btn-label">Truth</span>
              <span class="tod-btn-sub">answer honestly</span>
            </button>
            <button class="tod-choice-btn tod-drink" id="tod-drink">
              <span class="tod-btn-emoji">🍺</span>
              <span class="tod-btn-label">Drink</span>
              <span class="tod-btn-sub">take a sip</span>
            </button>
          </div>
        ` : `
          <div class="tod-spectator-card">
            <div class="tod-spectator-emoji">👀</div>
            <p class="tod-spectator-text">Waiting for <strong>${escapeHtml(data.hotSeatName)}</strong> to choose...</p>
          </div>
        `}
      </div>
    `;

    startTimer(data.timeLimit);

    if (isHotSeat) {
      document.getElementById('tod-truth').addEventListener('click', () => submitChoice('truth'));
      document.getElementById('tod-drink').addEventListener('click', () => submitChoice('drink'));
    }
  }

  function submitChoice(choice) {
    if (hasAnswered) return;
    hasAnswered = true;
    if (typeof SFX !== 'undefined') SFX.click();

    const truthBtn = document.getElementById('tod-truth');
    const drinkBtn = document.getElementById('tod-drink');
    if (truthBtn) truthBtn.disabled = true;
    if (drinkBtn) drinkBtn.disabled = true;

    if (choice === 'truth') {
      truthBtn?.classList.add('tod-selected');
      drinkBtn?.classList.add('tod-dimmed');
    } else {
      drinkBtn?.classList.add('tod-selected');
      truthBtn?.classList.add('tod-dimmed');
    }

    socket.emit('player-answer', { answer: choice });
  }

  function startTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('tod-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 5 && timerEl) timerEl.classList.add('tod-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (isHost) socket.emit('show-results');
      }
    }, 1000);
  }

  function renderResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();

    const isTruth = data.hotSeatAnswer === 'truth';
    const choiceEmoji = isTruth ? '🗣️' : '🍺';
    const choiceText = isTruth ? 'chose TRUTH!' : 'chose to DRINK!';
    const revealClass = isTruth ? 'tod-reveal-truth' : 'tod-reveal-drink';

    gameView.innerHTML = `
      <div class="tod-game fade-in">
        <div class="tod-header">
          <span>Round ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="tod-results-label">Results</span>
        </div>
        <div class="tod-question-card tod-card-done">
          <h2 class="tod-question-text">${escapeHtml(data.question)}</h2>
        </div>
        <div class="tod-reveal-card ${revealClass}">
          <span class="tod-reveal-emoji">${choiceEmoji}</span>
          <span class="tod-reveal-name">${escapeHtml(data.hotSeatName)}</span>
          <span class="tod-reveal-choice">${choiceText}</span>
        </div>
        <div class="tod-leaderboard">
          <div class="tod-lb-title">Leaderboard</div>
          ${data.players.slice(0, 5).map((p, i) => `
            <div class="tod-lb-row ${p.isHotSeat ? 'tod-lb-hotseat' : ''}">
              <span class="tod-lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</span>
              <span class="tod-lb-name">${escapeHtml(p.name)} ${p.isHotSeat ? '🔥' : ''}</span>
              <span class="tod-lb-score">${p.totalScore.toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? '<button class="btn btn-sm btn-primary" id="tod-next" style="margin-top:20px;display:block;margin-left:auto;margin-right:auto;padding:10px 32px;font-size:1rem">Next ➜</button>' : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('tod-next')?.addEventListener('click', () => socket.emit('next-question'));
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🍺 Truth or Drink — Final Results</h2>
        <p style="text-align:center;color:var(--text-dim);margin-bottom:16px">Truth = 150 pts, Drink = 50 pts</p>
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
