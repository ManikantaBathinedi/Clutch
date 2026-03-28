// Trivia — Client-side game logic
// Loaded dynamically when trivia game starts

(function () {
  const gameView = document.getElementById('game-view');
  let timerInterval = null;
  let hasAnswered = false;
  let selectedIndex = -1;
  let pendingResult = null; // stored until timer ends

  // ─── RENDER QUESTION ───
  function renderQuestion(data) {
    hasAnswered = false;
    selectedIndex = -1;
    pendingResult = null;

    gameView.innerHTML = `
      <div class="fade-in" style="width: 100%; max-width: 600px; margin: 0 auto;">
        <div class="question-number">
          Question ${data.questionNumber} / ${data.totalQuestions}
          <span style="margin-left: 8px; opacity: 0.4;">${capitalize(data.category)}</span>
        </div>

        <div class="timer-text" id="timer-text">${data.timeLimit}</div>
        <div class="timer-bar-container">
          <div class="timer-bar" id="timer-bar" style="width: 100%"></div>
        </div>

        <div class="question-text">${escapeHtml(data.question)}</div>

        <div class="answers-grid" id="answers-grid">
          ${data.options.map((opt, i) => `
            <button class="answer-btn" data-index="${i}">${escapeHtml(opt)}</button>
          `).join('')}
        </div>

        <div id="answer-feedback" class="answer-feedback"></div>
      </div>
    `;

    // Start timer — keeps running even after answer
    startTimer(data.timeLimit);

    // Answer click handlers
    const grid = document.getElementById('answers-grid');
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.answer-btn');
      if (!btn || hasAnswered) return;
      if (typeof SFX !== 'undefined') SFX.click();
      submitAnswer(parseInt(btn.dataset.index));
    });
  }

  // ─── TIMER — always runs full duration ───
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
        if (seconds <= 3) {
          timerText.classList.add('danger');
          if (typeof SFX !== 'undefined') SFX.timerWarn();
        }
        else if (seconds <= 7) timerText.classList.add('warning');
      }

      if (timerBar) {
        timerBar.style.width = pct + '%';
        timerBar.className = 'timer-bar';
        if (seconds <= 3) timerBar.classList.add('danger');
        else if (seconds <= 7) timerBar.classList.add('warning');
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        // Time's up — reveal result
        if (!hasAnswered) {
          hasAnswered = true;
          disableButtons();
          showFeedback(false, 0, true);
        } else if (pendingResult) {
          // Player answered — now reveal if correct/wrong
          showFeedback(pendingResult.isCorrect, pendingResult.points, false);
          revealCorrectAnswer(pendingResult.correctIndex);
        }
        // Host auto-triggers results
        const isHost = sessionStorage.getItem('isHost') === 'true';
        if (isHost) {
          setTimeout(() => socket.emit('show-results'), 1500);
        }
      }
    }, 50);
  }

  // ─── SUBMIT ANSWER ───
  function submitAnswer(index) {
    if (hasAnswered) return;
    hasAnswered = true;
    selectedIndex = index;

    // Highlight selected, disable all — but DON'T stop timer
    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach(btn => {
      btn.disabled = true;
      btn.style.cursor = 'default';
    });
    btns[index].classList.add('selected');

    // Show neutral "locked in" message — result revealed after timer
    const feedback = document.getElementById('answer-feedback');
    if (feedback) {
      feedback.className = 'answer-feedback';
      feedback.textContent = 'Locked in!';
      feedback.style.color = 'var(--text-mid)';
    }

    socket.emit('player-answer', { answer: index });
  }

  function disableButtons() {
    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach(btn => {
      btn.disabled = true;
      btn.style.cursor = 'default';
    });
  }

  // ─── SHOW FEEDBACK (small inline, not full screen) ───
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

  // ─── REVEAL CORRECT ANSWER (highlight buttons after timer) ───
  function revealCorrectAnswer(correctIndex) {
    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach((btn, i) => {
      if (i === correctIndex) {
        btn.classList.add('correct');
      } else if (btn.classList.contains('selected')) {
        btn.classList.add('wrong');
      }
    });
  }

  // ─── RENDER ROUND RESULTS ───
  function renderRoundResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();
    const isHost = sessionStorage.getItem('isHost') === 'true';

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width: 100%;">
        <div class="result-header">
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 2px;">
            Question ${data.questionNumber} / ${data.totalQuestions}
          </div>
          <h2>${escapeHtml(data.question)}</h2>
          <div class="correct-answer mt-12">${escapeHtml(data.correctText)}</div>
        </div>

        <ul class="leaderboard" id="round-leaderboard"></ul>

        ${isHost ? `
          <button class="btn btn-sm btn-primary mt-20" id="next-btn">
            ${data.questionNumber < data.totalQuestions ? 'Next Question' : 'Final Results'}
          </button>
        ` : `
          <div class="waiting mt-20">
            <p style="color: var(--text-dim);">Waiting for host<span class="dots"></span></p>
          </div>
        `}
      </div>
    `;

    // Render leaderboard
    const lb = document.getElementById('round-leaderboard');
    data.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-item';
      li.style.animationDelay = `${i * 0.06}s`;

      const medals = ['1st', '2nd', '3rd'];
      const rankClass = i < 3 ? `rank-${i + 1}` : '';

      li.innerHTML = `
        <span class="rank ${rankClass}">${i < 3 ? medals[i] : i + 1}</span>
        <span class="lb-name">
          ${escapeHtml(p.name)}
          ${p.isCorrect ? '<span style="color: var(--success); margin-left: 6px; font-size: 0.75rem;">CORRECT</span>' : ''}
        </span>
        <span>
          <span class="lb-score">${p.totalScore.toLocaleString()}</span>
          ${p.roundPoints > 0 ? `<span class="lb-points-gained">+${p.roundPoints}</span>` : ''}
        </span>
      `;
      lb.appendChild(li);
    });

    // Next button
    if (isHost) {
      document.getElementById('next-btn').addEventListener('click', () => {
        socket.emit('next-question');
      });
    }
  }

  // ─── RENDER FINAL RESULTS ───
  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    const isHost = sessionStorage.getItem('isHost') === 'true';

    const winner = data.players[0];

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width: 100%;">
        <div class="result-header">
          <div style="font-size: 1rem; color: var(--accent); font-family: var(--font-display, inherit); font-weight: 800; letter-spacing: 4px; margin-bottom: 8px;">GAME OVER</div>
          <h2 style="font-size: 1.4rem; font-weight: 700;">${escapeHtml(winner.name)} wins!</h2>
          <p style="color: var(--text-dim); margin-top: 6px; font-size: 0.85rem;">Final standings</p>
        </div>

        <ul class="leaderboard" id="final-leaderboard"></ul>

        <button class="btn btn-sm btn-secondary mt-20" id="lobby-btn">Back to Lobby</button>
      </div>
    `;

    // Render leaderboard
    const lb = document.getElementById('final-leaderboard');
    data.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-item';
      li.style.animationDelay = `${i * 0.1}s`;

      const rankClass = i < 3 ? `rank-${i + 1}` : '';

      li.innerHTML = `
        <span class="rank ${rankClass}">${p.rank}</span>
        <span class="lb-name">${escapeHtml(p.name)}</span>
        <span class="lb-score">${p.score.toLocaleString()}</span>
      `;
      lb.appendChild(li);
    });

    // Back to lobby
    document.getElementById('lobby-btn').addEventListener('click', () => {
      if (isHost) {
        socket.emit('back-to-lobby');
      } else {
        const lobbyView = document.getElementById('lobby-view');
        const gameView = document.getElementById('game-view');
        gameView.classList.add('hidden');
        gameView.innerHTML = '';
        lobbyView.classList.remove('hidden');
      }
    });
  }

  // ─── SOCKET LISTENERS ───
  socket.on('game-state', renderQuestion);

  socket.on('answer-result', (data) => {
    // Store result — don't show until timer ends
    pendingResult = data;
  });

  socket.on('round-result', renderRoundResults);
  socket.on('game-over', renderGameOver);

  // ─── UTILS ───
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
})();
