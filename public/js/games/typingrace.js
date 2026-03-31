// Monkey Press — Client-side game logic (Monkeytype-inspired)
(function () {
  const gameView = document.getElementById('game-view');
  let timerInterval = null;
  let typedText = '';
  let promptText = '';
  let startTime = null;
  let timeLimit = 30;
  let sendThrottle = null;
  let roundOver = false;

  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderPrompt(data) {
    typedText = '';
    promptText = data.text;
    startTime = Date.now();
    timeLimit = data.timeLimit || 30;
    roundOver = false;

    if (window.updateGameStatus) window.updateGameStatus(`Round ${data.roundNumber}/${data.totalRounds}`);

    // Build the character-by-character display
    const charSpans = promptText.split('').map((ch, i) =>
      `<span class="tr-char" id="tr-c-${i}">${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</span>`
    ).join('');

    // Build player progress bars
    const progressBars = data.players.map(p =>
      `<div class="tr-player-bar" id="tr-bar-${p.id}">
        <span class="tr-player-name">${escapeHtml(p.name)}</span>
        <div class="tr-progress-track"><div class="tr-progress-fill" id="tr-fill-${p.id}" style="width:0%"></div></div>
        <span class="tr-wpm" id="tr-wpm-${p.id}">0 WPM</span>
      </div>`
    ).join('');

    gameView.innerHTML = `
      <div class="fade-in" style="width:100%;max-width:780px;margin:0 auto;">
        <div class="question-number">Round ${data.roundNumber} / ${data.totalRounds}</div>

        <div class="timer-text" id="timer-text">${timeLimit}</div>
        <div class="timer-bar-container"><div class="timer-bar" id="timer-bar" style="width:100%"></div></div>

        <div class="tr-prompt-box" id="tr-prompt-box">${charSpans}<span class="tr-cursor" id="tr-cursor"></span></div>

        <div class="tr-input-area">
          <input type="text" id="tr-input" class="game-input tr-game-input" placeholder="Start typing..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>

        <div class="tr-stats-row">
          <div class="tr-stat"><span class="tr-stat-val" id="my-wpm">0</span><span class="tr-stat-label">WPM</span></div>
          <div class="tr-stat"><span class="tr-stat-val" id="my-accuracy">100</span><span class="tr-stat-label">Accuracy</span></div>
          <div class="tr-stat"><span class="tr-stat-val" id="my-progress">0</span><span class="tr-stat-label">Progress %</span></div>
        </div>

        <div class="tr-players-section">
          <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Race Progress</div>
          ${progressBars}
        </div>
      </div>
    `;

    startTimer(timeLimit);

    const input = document.getElementById('tr-input');
    input.focus();

    input.addEventListener('input', () => {
      if (roundOver) return;
      typedText = input.value;
      updateCharDisplay();
      throttleSend();
    });

    // Prevent paste
    input.addEventListener('paste', (e) => e.preventDefault());
  }

  function updateCharDisplay() {
    for (let i = 0; i < promptText.length; i++) {
      const span = document.getElementById(`tr-c-${i}`);
      if (!span) continue;
      if (i < typedText.length) {
        if (typedText[i] === promptText[i]) {
          span.className = 'tr-char correct';
        } else {
          span.className = 'tr-char incorrect';
        }
      } else {
        span.className = 'tr-char';
      }
    }

    // Update cursor position
    const cursor = document.getElementById('tr-cursor');
    if (cursor) {
      const idx = Math.min(typedText.length, promptText.length);
      const charEl = document.getElementById(`tr-c-${idx}`);
      if (charEl) {
        cursor.style.left = charEl.offsetLeft + 'px';
        cursor.style.top = charEl.offsetTop + 'px';
      }
    }

    // Local stats
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.max(elapsed / 60, 0.01);
    let correct = 0;
    const len = Math.min(typedText.length, promptText.length);
    for (let i = 0; i < len; i++) {
      if (typedText[i] === promptText[i]) correct++;
    }
    const wpm = Math.round((correct / 5) / minutes);
    const accuracy = typedText.length > 0 ? Math.round((correct / typedText.length) * 100) : 100;
    const progress = Math.min(Math.round((typedText.length / promptText.length) * 100), 100);

    const wpmEl = document.getElementById('my-wpm');
    const accEl = document.getElementById('my-accuracy');
    const progEl = document.getElementById('my-progress');
    if (wpmEl) wpmEl.textContent = wpm;
    if (accEl) accEl.textContent = accuracy;
    if (progEl) progEl.textContent = progress;
  }

  function throttleSend() {
    if (sendThrottle) return;
    sendThrottle = setTimeout(() => {
      sendThrottle = null;
      socket.emit('player-answer', { answer: typedText });
    }, 100); // Send at most every 100ms
  }

  function startTimer(duration) {
    clearInterval(timerInterval);
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('timer-bar');
    const st = Date.now();
    const dMs = duration * 1000;

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - st;
      const remaining = Math.max(0, dMs - elapsed);
      const seconds = Math.ceil(remaining / 1000);
      const pct = (remaining / dMs) * 100;

      if (timerText) {
        timerText.textContent = seconds;
        timerText.className = 'timer-text';
        if (seconds <= 3) { timerText.classList.add('danger'); if (typeof SFX !== 'undefined') SFX.timerWarn(); }
        else if (seconds <= 5) timerText.classList.add('warning');
      }
      if (timerBar) {
        timerBar.style.width = pct + '%';
        timerBar.className = 'timer-bar';
        if (seconds <= 3) timerBar.classList.add('danger');
        else if (seconds <= 5) timerBar.classList.add('warning');
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        roundOver = true;
        const input = document.getElementById('tr-input');
        if (input) input.disabled = true;
        // Send final answer
        socket.emit('player-answer', { answer: typedText });
        // Host auto-shows results
        const isHost = sessionStorage.getItem('isHost') === 'true';
        if (isHost) setTimeout(() => socket.emit('show-results'), 1500);
      }
    }, 50);
  }

  function updatePlayerProgress(data) {
    // data: { playerId, progress, wpm, accuracy, wordsTyped, finished }
    const fill = document.getElementById(`tr-fill-${data.playerId}`);
    const wpmEl = document.getElementById(`tr-wpm-${data.playerId}`);
    if (fill) fill.style.width = data.progress + '%';
    if (wpmEl) wpmEl.textContent = data.wpm + ' WPM';

    if (data.finished) {
      const bar = document.getElementById(`tr-bar-${data.playerId}`);
      if (bar) bar.classList.add('finished');
    }
  }

  function renderRoundResults(data) {
    clearInterval(timerInterval);
    roundOver = true;
    if (typeof SFX !== 'undefined') SFX.roundResults();
    const isHost = sessionStorage.getItem('isHost') === 'true';

    const rows = data.players.map((p, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const medal = i < 3 ? medals[i] : `${i + 1}`;
      return `
        <tr class="tr-result-row" style="animation-delay:${i * 0.06}s">
          <td class="tr-rank">${medal}</td>
          <td class="tr-name">${escapeHtml(p.name)}</td>
          <td>${p.wpm} WPM</td>
          <td>${p.accuracy}%</td>
          <td>${p.finished ? '✅' : '❌'}</td>
          <td>+${p.roundPoints}</td>
          <td class="tr-total">${p.totalScore}</td>
        </tr>`;
    }).join('');

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width:100%;max-width:700px;margin:0 auto;">
        <div class="result-header">
          <div style="font-size:0.75rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Round ${data.roundNumber} / ${data.totalRounds}</div>
          <h2 style="word-break:break-word;font-size:1rem;color:var(--text-mid);font-weight:400;margin-bottom:16px;">"${escapeHtml(data.text.substring(0, 80))}${data.text.length > 80 ? '...' : ''}"</h2>
        </div>
        <table class="tr-results-table">
          <thead><tr><th></th><th>Player</th><th>WPM</th><th>Acc</th><th>Done</th><th>Pts</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${isHost ? `<button class="btn btn-sm btn-primary mt-20" id="next-btn">${data.roundNumber < data.totalRounds ? 'Next Round' : 'Final Results'}</button>` : `<div class="waiting mt-20"><p style="color:var(--text-dim);">Waiting for host<span class="dots"></span></p></div>`}
      </div>
    `;

    if (isHost) document.getElementById('next-btn').addEventListener('click', () => socket.emit('next-question'));
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    roundOver = true;
    if (typeof SFX !== 'undefined') SFX.gameOver();
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const winner = data.players[0];

    const rows = data.players.map((p, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const medal = i < 3 ? medals[i] : `${i + 1}`;
      return `
        <tr class="tr-result-row" style="animation-delay:${i * 0.06}s">
          <td class="tr-rank">${medal}</td>
          <td class="tr-name">${escapeHtml(p.name)}</td>
          <td>${p.avgWpm} WPM</td>
          <td>${p.avgAccuracy}%</td>
          <td class="tr-total">${p.score}</td>
        </tr>`;
    }).join('');

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width:100%;max-width:700px;margin:0 auto;">
        <div class="result-header">
          <div style="font-size:1rem;color:var(--accent);font-family:var(--font-display);font-weight:800;letter-spacing:4px;margin-bottom:8px;">RACE OVER</div>
          <h2 style="font-size:1.4rem;font-weight:700;">🐵 ${escapeHtml(winner.name)} wins!</h2>
        </div>
        <table class="tr-results-table">
          <thead><tr><th></th><th>Player</th><th>Avg WPM</th><th>Avg Acc</th><th>Score</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          ${isHost ? `<button class="btn btn-sm btn-primary" id="rematch-btn">Rematch</button>` : ''}
          <button class="btn btn-sm btn-secondary" id="lobby-btn">Back to Lobby</button>
        </div>
      </div>
    `;

    if (isHost) {
      document.getElementById('rematch-btn').addEventListener('click', () => socket.emit('rematch'));
    }
    document.getElementById('lobby-btn').addEventListener('click', () => {
      if (isHost) { socket.emit('back-to-lobby'); } else {
        const lv = document.getElementById('lobby-view');
        const gv = document.getElementById('game-view');
        gv.classList.add('hidden'); gv.innerHTML = ''; lv.classList.remove('hidden');
      }
    });
  }

  // Socket event listeners
  if (typeof socket !== 'undefined') {
    socket.on('game-state', (data) => {
      if (data.text && data.wordCount) {
        renderPrompt(data);
      }
    });

    socket.on('typing-progress', (data) => {
      updatePlayerProgress(data);
    });

    socket.on('round-result', (data) => {
      if (data.text) {
        renderRoundResults(data);
      }
    });

    socket.on('game-over', (data) => {
      if (data.gameType === 'typingrace') {
        renderGameOver(data);
      }
    });
  }
})();
