// Contexto — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  let timerInterval = null;
  let timeLimit = 90;
  let startTime = null;
  let guesses = []; // { word, rank, isHint }
  let totalWords = 5000;
  let hintsRemaining = 3;
  let found = false;
  let roundOver = false;

  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getBarColor(rank) {
    // Log scale: rank 1 = bright green, rank 9000+ = deep red
    const logRank = Math.log(Math.max(1, rank));
    const logMax = Math.log(totalWords);
    const ratio = 1 - Math.min(logRank / logMax, 1);
    const hue = Math.round(ratio * 120); // 120=green, 0=red
    return `hsl(${hue}, 75%, 45%)`;
  }

  function getBarWidth(rank) {
    // Log scale: rank 1 = 100%, higher ranks shrink logarithmically
    const logRank = Math.log(Math.max(1, rank));
    const logMax = Math.log(totalWords);
    return Math.max(5, Math.round((1 - logRank / logMax) * 100));
  }

  function renderGame(data) {
    guesses = [];
    totalWords = data.totalWords || 5000;
    timeLimit = data.timeLimit || 90;
    startTime = Date.now();
    hintsRemaining = 3;
    found = false;
    roundOver = false;

    if (window.updateGameStatus) window.updateGameStatus(`Round ${data.roundNumber}/${data.totalRounds}`);

    const playerCards = (data.players || []).map(p =>
      `<div class="ctx-player-card" id="ctx-player-${p.id}">
        <span class="ctx-player-name">${escapeHtml(p.name)}</span>
        <span class="ctx-player-stat" id="ctx-stat-${p.id}">0 guesses</span>
      </div>`
    ).join('');

    gameView.innerHTML = `
      <div class="fade-in ctx-container">
        <div class="question-number">Round ${data.roundNumber} / ${data.totalRounds}</div>

        <div class="timer-text" id="timer-text">${timeLimit}</div>
        <div class="timer-bar-container"><div class="timer-bar" id="timer-bar" style="width:100%"></div></div>

        <div class="ctx-subtitle">Guess the secret word! Closer words rank lower.</div>

        <div class="ctx-input-row">
          <input type="text" id="ctx-input" class="ctx-guess-input" placeholder="Type a word..." autocomplete="off" maxlength="30" />
          <button id="ctx-guess-btn" class="ctx-guess-btn">Guess</button>
          <button id="ctx-hint-btn" class="ctx-hint-btn" title="Get a hint (3 max)">&#x1F4A1; <span id="ctx-hint-count">3</span></button>
        </div>

        <div class="ctx-feedback" id="ctx-feedback"></div>

        <div class="ctx-guess-list" id="ctx-guess-list">
          <div class="ctx-empty-state">Your guesses will appear here, sorted by rank</div>
        </div>

        <div class="ctx-players-row" id="ctx-players-row">${playerCards}</div>
      </div>
    `;

    // Input events
    const input = document.getElementById('ctx-input');
    const guessBtn = document.getElementById('ctx-guess-btn');
    const hintBtn = document.getElementById('ctx-hint-btn');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitGuess();
    });
    guessBtn.addEventListener('click', submitGuess);
    hintBtn.addEventListener('click', requestHint);
    input.focus();

    startTimer();
  }

  function submitGuess() {
    if (found || roundOver) return;
    const input = document.getElementById('ctx-input');
    if (!input) return;
    const word = input.value.trim().toLowerCase();
    if (!word) return;
    input.value = '';
    input.focus();

    if (typeof socket !== 'undefined') {
      socket.emit('player-answer', { answer: word });
    }
  }

  function requestHint() {
    if (found || roundOver || hintsRemaining <= 0) return;
    if (typeof socket !== 'undefined') {
      socket.emit('contexto-hint');
    }
  }

  function handleGuessResult(data) {
    const feedback = document.getElementById('ctx-feedback');
    if (!feedback) return;

    if (data.type === 'found') {
      found = true;
      feedback.innerHTML = `<div class="ctx-found">&#x1F389; You found it! <strong>${escapeHtml(data.word)}</strong> &mdash; +${data.points} points (${data.totalGuesses} guesses)</div>`;
      guesses.push({ word: data.word, rank: 0, isHint: false, isFar: false });
      renderGuessList();
      disableInput();
      if (window.playSound) window.playSound('correct');
    } else if (data.type === 'far') {
      feedback.innerHTML = `<div class="ctx-ranked"><strong>${escapeHtml(data.word)}</strong> &mdash; &#x1F7E5; Very far!</div>`;
      guesses.push({ word: data.word, rank: data.rank, isHint: false, isFar: true });
      renderGuessList();
      if (window.playSound) window.playSound('click');
    } else if (data.type === 'ranked') {
      feedback.innerHTML = `<div class="ctx-ranked"><strong>${escapeHtml(data.word)}</strong> &mdash; Rank #${data.rank.toLocaleString()}</div>`;
      guesses.push({ word: data.word, rank: data.rank, isHint: false, isFar: false });
      renderGuessList();
      if (window.playSound) window.playSound('click');
    } else if (data.type === 'hint') {
      hintsRemaining = data.hintsRemaining;
      const hintCount = document.getElementById('ctx-hint-count');
      if (hintCount) hintCount.textContent = hintsRemaining;
      if (hintsRemaining <= 0) {
        const hintBtn = document.getElementById('ctx-hint-btn');
        if (hintBtn) hintBtn.disabled = true;
      }
      feedback.innerHTML = `<div class="ctx-hint-msg">&#x1F4A1; Hint: <strong>${escapeHtml(data.word)}</strong> is rank #${data.rank.toLocaleString()}</div>`;
      guesses.push({ word: data.word, rank: data.rank, isHint: true });
      renderGuessList();
    } else if (data.type === 'duplicate') {
      feedback.innerHTML = `<div class="ctx-dup">Already guessed <strong>${escapeHtml(data.word)}</strong></div>`;
    } else if (data.type === 'unknown') {
      feedback.innerHTML = `<div class="ctx-unknown">Word not recognized: <strong>${escapeHtml(data.word)}</strong></div>`;
    }
  }

  function renderGuessList() {
    const container = document.getElementById('ctx-guess-list');
    if (!container) return;

    // Sort by rank ascending (found=0 at top, far words at bottom)
    const sorted = [...guesses].sort((a, b) => a.rank - b.rank);

    container.innerHTML = sorted.map((g, i) => {
      const isFar = g.isFar;
      const color = g.rank === 0 ? '#22c55e' : isFar ? '#7f1d1d' : getBarColor(g.rank);
      const width = g.rank === 0 ? 100 : isFar ? 3 : getBarWidth(g.rank);
      const rankLabel = g.rank === 0 ? '&#x2B50; FOUND' : isFar ? '&#x1F7E5; Far' : `#${g.rank.toLocaleString()}`;
      const hintTag = g.isHint ? ' <span class="ctx-hint-tag">HINT</span>' : '';
      return `<div class="ctx-guess-row ${g.rank === 0 ? 'ctx-found-row' : ''} ${g.isHint ? 'ctx-hint-row' : ''} ${isFar ? 'ctx-far-row' : ''}">
        <span class="ctx-guess-word">${escapeHtml(g.word)}${hintTag}</span>
        <div class="ctx-bar-track">
          <div class="ctx-bar-fill" style="width:${width}%;background:${color}"></div>
        </div>
        <span class="ctx-guess-rank">${rankLabel}</span>
      </div>`;
    }).join('');
  }

  function handleProgress(data) {
    const stat = document.getElementById(`ctx-stat-${data.playerId}`);
    if (!stat) return;
    if (data.found) {
      stat.textContent = `Found it! (${data.guessCount})`;
      stat.classList.add('ctx-stat-found');
    } else {
      const bestLabel = data.bestRank < totalWords ? `best #${data.bestRank}` : '';
      stat.textContent = `${data.guessCount} guesses${bestLabel ? ' · ' + bestLabel : ''}`;
    }
  }

  function startTimer() {
    clearInterval(timerInterval);
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('timer-bar');
    if (!timerText || !timerBar) return;

    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, timeLimit - elapsed);
      timerText.textContent = Math.ceil(remaining);
      timerBar.style.width = `${(remaining / timeLimit) * 100}%`;

      if (remaining <= 10) timerBar.classList.add('timer-warning');
      if (remaining <= 0) {
        clearInterval(timerInterval);
        roundOver = true;
        disableInput();
        // Host auto-triggers show-results after timer expires
        const isHost = sessionStorage.getItem('isHost') === 'true';
        if (isHost && typeof socket !== 'undefined') {
          setTimeout(() => socket.emit('show-results'), 1500);
        }
      }
    }, 250);
  }

  function disableInput() {
    const input = document.getElementById('ctx-input');
    const guessBtn = document.getElementById('ctx-guess-btn');
    const hintBtn = document.getElementById('ctx-hint-btn');
    if (input) input.disabled = true;
    if (guessBtn) guessBtn.disabled = true;
    if (hintBtn) hintBtn.disabled = true;
  }

  function showRoundResult(data) {
    if (data.gameType !== 'contexto') return;
    clearInterval(timerInterval);
    roundOver = true;

    const isHost = sessionStorage.getItem('isHost') === 'true';

    const playerRows = (data.players || []).map((p, i) => {
      const icon = p.found ? '&#x2705;' : '&#x274C;';
      const detail = p.found ? `Found in ${p.guessCount} guesses` : `Best rank: #${p.bestRank.toLocaleString()} (${p.guessCount} guesses)`;
      return `<div class="ctx-result-row ${i === 0 ? 'ctx-result-winner' : ''}">
        <span class="ctx-result-rank">${i + 1}.</span>
        <span class="ctx-result-name">${icon} ${escapeHtml(p.name)}</span>
        <span class="ctx-result-detail">${detail}</span>
        <span class="ctx-result-score">${p.totalScore} pts</span>
      </div>`;
    }).join('');

    gameView.innerHTML = `
      <div class="fade-in ctx-container">
        <div class="ctx-reveal">
          <div class="ctx-reveal-label">The secret word was</div>
          <div class="ctx-reveal-word">${escapeHtml(data.secret)}</div>
        </div>
        <div class="ctx-round-label">Round ${data.roundNumber} / ${data.totalRounds} Results</div>
        <div class="ctx-results-list">${playerRows}</div>
        ${isHost ? `
          <button class="btn btn-sm btn-primary mt-20" id="ctx-next-btn">
            ${data.roundNumber < data.totalRounds ? 'Next Round' : 'Final Results'}
          </button>
        ` : `
          <div class="waiting mt-20">
            <p style="color: var(--text-dim);">Waiting for host<span class="dots"></span></p>
          </div>
        `}
      </div>
    `;

    const nextBtn = document.getElementById('ctx-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        socket.emit('next-question');
      });
    }
  }

  // ── Socket listeners (attached directly on script load) ──
  if (typeof socket !== 'undefined') {
    socket.on('game-state', (data) => {
      if (data.gameType === 'contexto') renderGame(data);
    });

    socket.on('contexto-guess-result', (data) => {
      handleGuessResult(data);
    });

    socket.on('contexto-progress', (data) => {
      handleProgress(data);
    });

    socket.on('round-result', (data) => {
      if (data.gameType === 'contexto') showRoundResult(data);
    });
  }
})();
