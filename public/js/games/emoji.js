// Emoji Decoder — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  let timerInterval = null;
  let hasAnswered = false;
  let pendingResult = null;

  function renderPuzzle(data) {
    hasAnswered = false;
    pendingResult = null;

    gameView.innerHTML = `
      <div class="fade-in" style="width: 100%; max-width: 600px; margin: 0 auto;">
        <div class="question-number">
          Puzzle ${data.puzzleNumber} / ${data.totalPuzzles}
        </div>

        <div class="timer-text" id="timer-text">${data.timeLimit}</div>
        <div class="timer-bar-container">
          <div class="timer-bar" id="timer-bar" style="width: 100%"></div>
        </div>

        <div class="question-text" style="font-size: 3rem; letter-spacing: 6px;">${data.emojis}</div>
        <p style="color: var(--text-dim); text-align: center; font-size: 0.85rem; margin-bottom: 24px;">Hint: ${escapeHtml(data.hint)}</p>

        <div style="max-width: 400px; margin: 0 auto;">
          <input type="text" id="emoji-input" class="game-input" placeholder="What does this represent?" maxlength="50" autocomplete="off"
            style="text-align: center; font-size: 1.1rem;">
          <button class="btn btn-sm btn-primary mt-12" id="submit-emoji">Submit</button>
        </div>

        <div id="answer-feedback" class="answer-feedback"></div>
      </div>
    `;

    startTimer(data.timeLimit);

    const input = document.getElementById('emoji-input');
    const submitBtn = document.getElementById('submit-emoji');
    input.focus();

    submitBtn.addEventListener('click', () => submitAnswer(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAnswer(input.value);
    });
  }

  function startTimer(duration) {
    clearInterval(timerInterval);
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('timer-bar');
    const startTime = Date.now();
    const durationMs = duration * 1000;

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      const seconds = Math.ceil(remaining / 1000);
      const pct = (remaining / durationMs) * 100;

      if (timerText) {
        timerText.textContent = seconds;
        timerText.className = 'timer-text';
        if (seconds <= 5) {
          timerText.classList.add('danger');
          if (typeof SFX !== 'undefined') SFX.timerWarn();
        }
        else if (seconds <= 10) timerText.classList.add('warning');
      }
      if (timerBar) {
        timerBar.style.width = pct + '%';
        timerBar.className = 'timer-bar';
        if (seconds <= 5) timerBar.classList.add('danger');
        else if (seconds <= 10) timerBar.classList.add('warning');
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (!hasAnswered) {
          hasAnswered = true;
          showFeedback(false, 0, true);
        } else if (pendingResult) {
          showFeedback(pendingResult.isCorrect, pendingResult.points, false);
        }
        disableInput();
        const isHost = sessionStorage.getItem('isHost') === 'true';
        if (isHost) setTimeout(() => socket.emit('show-results'), 1500);
      }
    }, 50);
  }

  function submitAnswer(guess) {
    if (hasAnswered || !guess.trim()) return;
    hasAnswered = true;
    if (typeof SFX !== 'undefined') SFX.click();

    const feedback = document.getElementById('answer-feedback');
    if (feedback) {
      feedback.className = 'answer-feedback';
      feedback.textContent = 'Locked in!';
      feedback.style.color = 'var(--text-mid)';
    }
    disableInput();
    socket.emit('player-answer', { answer: guess.trim() });
  }

  function disableInput() {
    const input = document.getElementById('emoji-input');
    const btn = document.getElementById('submit-emoji');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
  }

  function showFeedback(isCorrect, points, timedOut) {
    const feedback = document.getElementById('answer-feedback');
    if (!feedback) return;
    if (timedOut) {
      if (typeof SFX !== 'undefined') SFX.timeUp();
      feedback.className = 'answer-feedback wrong';
      feedback.textContent = "Time's up!";
    } else if (isCorrect) {
      if (typeof SFX !== 'undefined') SFX.correct();
      feedback.className = 'answer-feedback correct';
      feedback.textContent = `Correct! +${points}`;
    } else {
      if (typeof SFX !== 'undefined') SFX.wrong();
      feedback.className = 'answer-feedback wrong';
      feedback.textContent = 'Wrong answer';
    }
  }

  function renderRoundResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();
    const isHost = sessionStorage.getItem('isHost') === 'true';

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width: 100%;">
        <div class="result-header">
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 2px;">
            Puzzle ${data.puzzleNumber} / ${data.totalPuzzles}
          </div>
          <div style="font-size: 2rem; margin-bottom: 8px;">${data.emojis}</div>
          <div class="correct-answer" style="font-size: 1.2rem; text-transform: capitalize;">${escapeHtml(data.correctAnswer)}</div>
        </div>
        <ul class="leaderboard" id="round-leaderboard"></ul>
        ${isHost ? `
          <button class="btn btn-sm btn-primary mt-20" id="next-btn">
            ${data.puzzleNumber < data.totalPuzzles ? 'Next Puzzle' : 'Final Results'}
          </button>
        ` : `
          <div class="waiting mt-20"><p style="color: var(--text-dim);">Waiting for host<span class="dots"></span></p></div>
        `}
      </div>
    `;

    renderLeaderboard(data.players, 'round-leaderboard');
    if (isHost) document.getElementById('next-btn').addEventListener('click', () => socket.emit('next-question'));
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const winner = data.players[0];

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width: 100%;">
        <div class="result-header">
          <div style="font-size: 1rem; color: var(--accent); font-family: var(--font-display); font-weight: 800; letter-spacing: 4px; margin-bottom: 8px;">GAME OVER</div>
          <h2 style="font-size: 1.4rem; font-weight: 700;">${escapeHtml(winner.name)} wins!</h2>
        </div>
        <ul class="leaderboard" id="final-leaderboard"></ul>
        <button class="btn btn-sm btn-secondary mt-20" id="lobby-btn">Back to Lobby</button>
      </div>
    `;

    renderLeaderboard(data.players.map((p, i) => ({ ...p, totalScore: p.score, roundPoints: 0 })), 'final-leaderboard');
    document.getElementById('lobby-btn').addEventListener('click', () => {
      if (isHost) { socket.emit('back-to-lobby'); } else {
        const lv = document.getElementById('lobby-view'); const gv = document.getElementById('game-view');
        gv.classList.add('hidden'); gv.innerHTML = ''; lv.classList.remove('hidden');
      }
    });
  }

  function renderLeaderboard(players, elementId) {
    const lb = document.getElementById(elementId);
    players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-item';
      li.style.animationDelay = `${i * 0.06}s`;
      const rankClass = i < 3 ? `rank-${i + 1}` : '';
      const medals = ['1st', '2nd', '3rd'];
      li.innerHTML = `
        <span class="rank ${rankClass}">${i < 3 ? medals[i] : i + 1}</span>
        <span class="lb-name">${escapeHtml(p.name)}
          ${p.isCorrect ? '<span style="color: var(--success); margin-left: 6px; font-size: 0.75rem;">CORRECT</span>' : ''}
        </span>
        <span>
          <span class="lb-score">${(p.totalScore || p.score || 0).toLocaleString()}</span>
          ${p.roundPoints > 0 ? `<span class="lb-points-gained">+${p.roundPoints}</span>` : ''}
        </span>
      `;
      lb.appendChild(li);
    });
  }

  socket.on('game-state', renderPuzzle);
  socket.on('answer-result', (data) => { pendingResult = data; });
  socket.on('round-result', renderRoundResults);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
