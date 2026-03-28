// ─── WOULD YOU RATHER CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;

  function renderQuestion(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.tick();

    gameView.innerHTML = `
      <div class="wyr-game fade-in">
        <div class="wyr-header">
          <span>Question ${data.questionNumber} / ${data.totalQuestions}</span>
          <span class="wyr-timer" id="wyr-timer">${data.timeLimit}</span>
        </div>
        <h2 class="wyr-title">Would You Rather...</h2>
        <div class="wyr-options">
          <button class="wyr-option wyr-option-a" id="wyr-a">
            <span class="wyr-option-label">A</span>
            <span class="wyr-option-text">${escapeHtml(data.optionA)}</span>
          </button>
          <div class="wyr-or">OR</div>
          <button class="wyr-option wyr-option-b" id="wyr-b">
            <span class="wyr-option-label">B</span>
            <span class="wyr-option-text">${escapeHtml(data.optionB)}</span>
          </button>
        </div>
      </div>
    `;

    startTimer(data.timeLimit);

    document.getElementById('wyr-a').addEventListener('click', () => {
      submitVote('A');
    });
    document.getElementById('wyr-b').addEventListener('click', () => {
      submitVote('B');
    });
  }

  function submitVote(choice) {
    socket.emit('player-answer', { answer: choice });
    const a = document.getElementById('wyr-a');
    const b = document.getElementById('wyr-b');
    if (choice === 'A') {
      a.classList.add('wyr-selected');
      b.classList.add('wyr-dimmed');
    } else {
      b.classList.add('wyr-selected');
      a.classList.add('wyr-dimmed');
    }
    a.disabled = true;
    b.disabled = true;
  }

  function startTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('wyr-timer');
    timerInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 5 && timerEl) timerEl.classList.add('wyr-timer-warn');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (isHost) socket.emit('show-results');
      }
    }, 1000);
  }

  function renderResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();

    const barMaxWidth = 200;
    const maxVotes = Math.max(data.votesA, data.votesB, 1);

    gameView.innerHTML = `
      <div class="wyr-game fade-in">
        <div class="wyr-header">
          <span>Question ${data.questionNumber} / ${data.totalQuestions}</span>
          <span>Results</span>
        </div>
        <div class="wyr-results">
          <div class="wyr-result-option ${data.majority === 'A' ? 'wyr-winner' : ''}">
            <div class="wyr-result-text">${escapeHtml(data.optionA)}</div>
            <div class="wyr-result-bar">
              <div class="wyr-bar-fill wyr-bar-a" style="width:${data.pctA}%"></div>
              <span class="wyr-bar-label">${data.pctA}% (${data.votesA})</span>
            </div>
          </div>
          <div class="wyr-result-option ${data.majority === 'B' ? 'wyr-winner' : ''}">
            <div class="wyr-result-text">${escapeHtml(data.optionB)}</div>
            <div class="wyr-result-bar">
              <div class="wyr-bar-fill wyr-bar-b" style="width:${data.pctB}%"></div>
              <span class="wyr-bar-label">${data.pctB}% (${data.votesB})</span>
            </div>
          </div>
        </div>
        <div class="wyr-player-votes">
          ${data.players.map(p => `
            <div class="wyr-vote-row ${p.inMajority ? 'wyr-majority' : ''}">
              <span>${escapeHtml(p.name)}</span>
              <span>${p.vote ? 'Option ' + p.vote : 'No vote'}</span>
              <span class="wyr-pts">+${p.points}</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? `<button class="btn btn-sm btn-primary" id="wyr-next" style="margin-top:16px;display:block;margin-left:auto;margin-right:auto">Next ➜</button>` : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('wyr-next')?.addEventListener('click', () => {
      socket.emit('next-question');
    });
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🤔 Would You Rather — Final Results</h2>
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
