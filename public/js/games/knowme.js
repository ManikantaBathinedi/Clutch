// ─── HOW WELL DO YOU KNOW ME — CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;

  function renderQuestion(data) {
    if (data.phase !== 'answer') return;
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.tick();

    gameView.innerHTML = `
      <div class="knowme-game fade-in">
        <div class="knowme-header">
          <span>Question ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="knowme-timer" id="knowme-timer">${data.timeLimit}</span>
        </div>
        <div class="knowme-question">
          <span class="knowme-icon">💕</span>
          <h2>${escapeHtml(data.question)}</h2>
        </div>
        <div class="knowme-answer-area">
          <div class="input-group">
            <label for="knowme-input">Your Answer</label>
            <input type="text" id="knowme-input" placeholder="Type your answer..." maxlength="200" autocomplete="off">
          </div>
          <button class="btn btn-primary" id="knowme-submit">Submit Answer</button>
        </div>
        <p class="knowme-hint">Both players answer the same question — match to score!</p>
      </div>
    `;

    startTimer(data.timeLimit);

    const input = document.getElementById('knowme-input');
    const btn = document.getElementById('knowme-submit');

    btn.addEventListener('click', () => submitAnswer(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAnswer(input.value);
    });
    input.focus();
  }

  function submitAnswer(value) {
    const trimmed = value.trim();
    if (!trimmed) return;

    socket.emit('player-answer', { answer: trimmed });

    const area = document.querySelector('.knowme-answer-area');
    if (area) {
      area.innerHTML = `
        <div class="knowme-waiting">
          <div class="knowme-check">✓</div>
          <p>Answer submitted! Waiting for your partner...</p>
        </div>
      `;
    }
  }

  function startTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('knowme-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 5 && timerEl) timerEl.classList.add('knowme-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (isHost) socket.emit('show-results');
      }
    }, 1000);
  }

  function renderResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') {
      if (data.isMatch) SFX.correct();
      else SFX.wrong();
    }

    gameView.innerHTML = `
      <div class="knowme-game fade-in">
        <div class="knowme-header">
          <span>Question ${data.questionNumber} / ${data.totalQuestions}</span>
          <span>Results</span>
        </div>
        <div class="knowme-question">
          <h2>${escapeHtml(data.question)}</h2>
        </div>
        <div class="knowme-reveal ${data.isMatch ? 'knowme-match' : 'knowme-no-match'}">
          <div class="knowme-reveal-icon">${data.isMatch ? '💕' : '💔'}</div>
          <div class="knowme-reveal-label">${data.isMatch ? 'You matched!' : 'Different answers!'}</div>
          ${data.isMatch ? `<div class="knowme-reveal-points">+${data.points} pts each</div>` : ''}
        </div>
        <div class="knowme-answers">
          <div class="knowme-answer-card">
            <div class="knowme-answer-name">${escapeHtml(data.player1Name)}</div>
            <div class="knowme-answer-text">"${escapeHtml(data.answer1)}"</div>
          </div>
          <div class="knowme-answer-card">
            <div class="knowme-answer-name">${escapeHtml(data.player2Name)}</div>
            <div class="knowme-answer-text">"${escapeHtml(data.answer2)}"</div>
          </div>
        </div>
        <div class="knowme-score-bar">
          <span>Compatibility: ${data.matchCount} / ${data.totalAsked} matched</span>
        </div>
        ${isHost ? `<button class="btn btn-sm btn-primary" id="knowme-next" style="margin-top:16px;display:block;margin-left:auto;margin-right:auto">Next ➜</button>` : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('knowme-next')?.addEventListener('click', () => {
      socket.emit('next-question');
    });
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();

    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">💕 How Well Do You Know Me?</h2>
        <div class="knowme-compat">
          <div class="knowme-compat-score">${data.compatibility}%</div>
          <div class="knowme-compat-label">Compatibility Score</div>
          <div class="knowme-compat-detail">${data.matchCount} out of ${data.totalRounds} matched</div>
        </div>
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

  socket.on('game-state', renderQuestion);
  socket.on('round-result', renderResults);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
