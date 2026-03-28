// Draw & Guess — Skribbl-style client
(function () {
  const gameView = document.getElementById('game-view');
  let timerInterval = null;
  let isDrawer = false;
  let hasGuessedCorrectly = false;
  let canvas, ctx;
  let drawing = false;
  let lastX = 0, lastY = 0;
  let currentColor = '#ffffff';
  let currentSize = 4;
  let currentTool = 'brush'; // 'brush' | 'eraser'
  let strokeHistory = []; // for undo — each entry is an imageData snapshot
  let chatMessages = [];

  const COLORS = [
    '#ffffff', '#c0c0c0', '#808080', '#000000',
    '#eb3b5a', '#d63031', '#8B0000',
    '#fa8231', '#f7b731', '#ffeaa7',
    '#20bf6b', '#0fb9b1', '#00b894',
    '#3867d6', '#0984e3', '#74b9ff',
    '#8854d0', '#a55eea', '#fd79a8'
  ];

  const BRUSH_SIZES = [
    { label: 'S', size: 3 },
    { label: 'M', size: 8 },
    { label: 'L', size: 16 },
    { label: 'XL', size: 28 }
  ];

  // ─── PHASE 1: WORD CHOICE (drawer only) ───
  function renderWordChoice(data) {
    const myId = socket.id;
    isDrawer = myId === data.drawerId;

    if (isDrawer) {
      renderWordPicker(data);
    } else {
      renderWaitingForDrawer(data);
    }
  }

  function renderWordPicker(data) {
    gameView.innerHTML = `
      <div class="fade-in dg-word-picker">
        <div class="question-number">
          Turn ${data.turnNumber} / ${data.totalTurns}
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 2px;">Choose a word to draw</span>
        </div>
        <div class="dg-word-choices" id="word-choices">
          ${data.words.map((word, i) => `
            <button class="dg-word-choice-btn" data-index="${i}">${escapeHtml(word).toUpperCase()}</button>
          `).join('')}
        </div>
        <div class="timer-text" id="timer-text" style="margin-top: 16px;">${data.timeLimit}</div>
        <div class="timer-bar-container">
          <div class="timer-bar" id="timer-bar" style="width: 100%"></div>
        </div>
      </div>
    `;

    document.querySelectorAll('.dg-word-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        socket.emit('choose-word', { wordIndex: index });
        // Disable buttons after choosing
        document.querySelectorAll('.dg-word-choice-btn').forEach(b => b.disabled = true);
        btn.classList.add('selected');
      });
    });

    startTimer(data.timeLimit, () => {
      // Auto-choose handled server-side
    });
  }

  function renderWaitingForDrawer(data) {
    gameView.innerHTML = `
      <div class="fade-in" style="text-align: center; padding: 40px 0; max-width: 600px; margin: 0 auto;">
        <div class="question-number">
          Turn ${data.turnNumber} / ${data.totalTurns}
        </div>
        <div style="font-size: 2.5rem; margin-bottom: 16px;">🎨</div>
        <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 8px;">
          <span style="color: var(--accent);">${escapeHtml(data.drawerName)}</span> is choosing a word...
        </h2>
        <div class="spinner" style="margin-top: 20px;"></div>
      </div>
    `;
  }

  // ─── PHASE 2: DRAWING ───
  function renderDrawStart(data) {
    const myId = socket.id;
    isDrawer = myId === data.drawerId;
    hasGuessedCorrectly = false;
    chatMessages = [];
    strokeHistory = [];

    if (isDrawer) renderDrawerView(data);
    else renderGuesserView(data);

    startTimer(data.timeLimit, () => {
      const isHost = sessionStorage.getItem('isHost') === 'true';
      if (isHost) setTimeout(() => socket.emit('show-results'), 1500);
    });
  }

  function renderDrawerView(data) {
    gameView.innerHTML = `
      <div class="fade-in dg-layout">
        <div class="dg-main">
          <div class="dg-header">
            <div class="question-number">
              Turn ${data.turnNumber} / ${data.totalTurns} · <span style="color: var(--accent);">You are drawing!</span>
            </div>
            <div class="dg-timer-row">
              <div class="timer-text" id="timer-text">${data.timeLimit}</div>
              <div class="timer-bar-container" style="flex: 1;">
                <div class="timer-bar" id="timer-bar" style="width: 100%"></div>
              </div>
            </div>
            <div class="dg-word-display">
              <span style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 2px;">Draw this:</span>
              <span class="dg-word">${escapeHtml(data.word).toUpperCase()}</span>
            </div>
          </div>

          <div class="dg-toolbar" id="toolbar">
            <div class="dg-colors">
              ${COLORS.map(c => `<button class="dg-color-btn${c === currentColor ? ' active' : ''}" data-color="${c}" style="background:${c};${c === '#000000' ? 'border-color:rgba(255,255,255,0.3);' : ''}"></button>`).join('')}
            </div>
            <div class="dg-tools">
              <div class="dg-brush-sizes">
                ${BRUSH_SIZES.map(b => `<button class="dg-size-btn${b.size === currentSize ? ' active' : ''}" data-size="${b.size}">${b.label}</button>`).join('')}
              </div>
              <button class="dg-tool-btn active" data-tool="brush" title="Brush">✏️</button>
              <button class="dg-tool-btn" data-tool="eraser" title="Eraser">🧹</button>
              <button class="dg-tool-btn" id="undo-btn" title="Undo">↩️</button>
              <button class="dg-tool-btn" id="fill-btn" title="Fill canvas">🪣</button>
              <button class="dg-tool-btn dg-clear-btn" id="clear-btn" title="Clear all">🗑️</button>
            </div>
          </div>

          <canvas id="draw-canvas" width="600" height="420"
            style="display: block; margin: 0 auto; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff; cursor: crosshair; touch-action: none; max-width: 100%;"></canvas>
        </div>

        <div class="dg-chat" id="chat-panel">
          <div class="dg-chat-title">Guesses</div>
          <div class="dg-chat-messages" id="chat-messages"></div>
        </div>
      </div>
    `;

    currentColor = '#000000';
    currentTool = 'brush';
    currentSize = 4;
    setupCanvas();
    setupToolbar();
  }

  function renderGuesserView(data) {
    gameView.innerHTML = `
      <div class="fade-in dg-layout">
        <div class="dg-main">
          <div class="dg-header">
            <div class="question-number">
              Turn ${data.turnNumber} / ${data.totalTurns} · <span style="color: var(--teal);">${escapeHtml(data.drawerName)} is drawing</span>
            </div>
            <div class="dg-timer-row">
              <div class="timer-text" id="timer-text">${data.timeLimit}</div>
              <div class="timer-bar-container" style="flex: 1;">
                <div class="timer-bar" id="timer-bar" style="width: 100%"></div>
              </div>
            </div>
            <div class="dg-dashed-word" id="dashed-word">
              ${formatDashedWord(data.dashedWord)}
            </div>
          </div>

          <canvas id="draw-canvas" width="600" height="420"
            style="display: block; margin: 0 auto; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff; max-width: 100%;"></canvas>
        </div>

        <div class="dg-chat" id="chat-panel">
          <div class="dg-chat-title">Chat</div>
          <div class="dg-chat-messages" id="chat-messages"></div>
          <div class="dg-chat-input" id="chat-input-area">
            <input type="text" id="guess-input" class="game-input" placeholder="Type your guess..." maxlength="40" autocomplete="off">
            <button class="dg-send-btn" id="submit-guess">➤</button>
          </div>
        </div>
      </div>
    `;

    canvas = document.getElementById('draw-canvas');
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const input = document.getElementById('guess-input');
    const submitBtn = document.getElementById('submit-guess');
    input.focus();

    submitBtn.addEventListener('click', () => submitGuess(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitGuess(input.value);
    });
  }

  function formatDashedWord(dashed) {
    return dashed.split('').map(ch => {
      if (ch === '_') return '<span class="dg-dash">_</span>';
      if (ch === ' ') return '<span class="dg-space">&nbsp;</span>';
      return `<span class="dg-letter">${ch}</span>`;
    }).join('');
  }

  // ─── CANVAS SETUP ───
  function setupCanvas() {
    canvas = document.getElementById('draw-canvas');
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save initial state
    strokeHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if (e.touches) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const startDraw = (e) => {
      e.preventDefault();
      drawing = true;
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
    };

    const draw = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
      const size = currentTool === 'eraser' ? currentSize * 3 : currentSize;
      const drawData = { x1: lastX, y1: lastY, x2: pos.x, y2: pos.y, color, size };

      drawLine(drawData);
      socket.emit('draw-data', drawData);

      lastX = pos.x;
      lastY = pos.y;
    };

    const stopDraw = () => {
      if (drawing) {
        drawing = false;
        // Save snapshot for undo
        strokeHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (strokeHistory.length > 30) strokeHistory.shift();
      }
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDraw);
  }

  function setupToolbar() {
    // Color buttons
    document.querySelectorAll('.dg-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dg-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
        currentTool = 'brush';
        document.querySelectorAll('.dg-tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.dg-tool-btn[data-tool="brush"]').classList.add('active');
      });
    });

    // Size buttons
    document.querySelectorAll('.dg-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dg-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSize = parseInt(btn.dataset.size);
      });
    });

    // Tool buttons
    document.querySelectorAll('.dg-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dg-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        if (canvas) canvas.style.cursor = currentTool === 'eraser' ? 'cell' : 'crosshair';
      });
    });

    // Undo
    document.getElementById('undo-btn').addEventListener('click', () => {
      if (strokeHistory.length > 1) {
        strokeHistory.pop();
        const prev = strokeHistory[strokeHistory.length - 1];
        ctx.putImageData(prev, 0, 0);
        // Send canvas state to others
        const dataUrl = canvas.toDataURL('image/png');
        socket.emit('draw-undo', { imageData: dataUrl });
      }
    });

    // Fill
    document.getElementById('fill-btn').addEventListener('click', () => {
      ctx.fillStyle = currentColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      socket.emit('draw-fill', { color: currentColor });
      strokeHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    });

    // Clear
    document.getElementById('clear-btn').addEventListener('click', () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      socket.emit('draw-clear');
      strokeHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    });
  }

  function drawLine(data) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(data.x1, data.y1);
    ctx.lineTo(data.x2, data.y2);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // ─── CHAT ───
  function addChatMessage(entry) {
    chatMessages.push(entry);
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    if (entry.isHint) {
      div.className = 'dg-chat-msg dg-chat-hint';
      div.innerHTML = `<span class="dg-chat-icon">💡</span> ${escapeHtml(entry.message)}`;
    } else if (entry.isSystem || entry.isCorrect) {
      div.className = 'dg-chat-msg dg-chat-system correct';
      div.innerHTML = `<span class="dg-chat-icon">✅</span> ${escapeHtml(entry.message)}`;
    } else if (entry.isClose) {
      div.className = 'dg-chat-msg dg-chat-close';
      div.innerHTML = `<strong>${escapeHtml(entry.playerName)}</strong>: ${escapeHtml(entry.message)} <span class="dg-close-tag">close!</span>`;
    } else {
      div.className = 'dg-chat-msg';
      div.innerHTML = `<strong>${escapeHtml(entry.playerName)}</strong>: ${escapeHtml(entry.message)}`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function submitGuess(guess) {
    if (hasGuessedCorrectly || !guess.trim()) return;

    const input = document.getElementById('guess-input');
    if (input) input.value = '';
    input.focus();

    socket.emit('player-answer', { answer: guess.trim() });
  }

  // ─── TIMER ───
  function startTimer(duration, onEnd) {
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
        if (seconds <= 10) timerText.classList.add('danger');
        else if (seconds <= 20) timerText.classList.add('warning');
      }
      if (timerBar) {
        timerBar.style.width = pct + '%';
        timerBar.className = 'timer-bar';
        if (seconds <= 10) timerBar.classList.add('danger');
        else if (seconds <= 20) timerBar.classList.add('warning');
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (onEnd) onEnd();
      }
    }, 50);
  }

  // ─── RESULTS ───
  function renderRoundResults(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();
    const isHost = sessionStorage.getItem('isHost') === 'true';

    gameView.innerHTML = `
      <div class="results-container fade-in" style="width: 100%;">
        <div class="result-header">
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 2px;">
            Turn ${data.turnNumber} / ${data.totalTurns}
          </div>
          <h2>The word was: <span style="color: var(--success);">${escapeHtml(data.word)}</span></h2>
        </div>
        <ul class="leaderboard" id="round-leaderboard"></ul>
        ${isHost ? `
          <button class="btn btn-sm btn-primary mt-20" id="next-btn">
            ${data.turnNumber < data.totalTurns ? 'Next Turn' : 'Final Results'}
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

    renderLeaderboard(data.players.map((p) => ({ ...p, totalScore: p.score, roundPoints: 0 })), 'final-leaderboard');
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
          ${p.isDrawer ? '<span style="color: var(--accent); margin-left: 6px; font-size: 0.75rem;">ARTIST</span>' : ''}
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

  // ─── SOCKET LISTENERS ───
  socket.on('word-choices', renderWordChoice);
  socket.on('draw-start', renderDrawStart);

  // Chat message from server (other player's guess or system message)
  socket.on('guess-chat', (entry) => {
    if (entry.isCorrect && typeof SFX !== 'undefined') SFX.correct();
    else if (typeof SFX !== 'undefined') SFX.chat();
    addChatMessage(entry);
  });

  socket.on('answer-result', (data) => {
    if (data.isCorrect) {
      if (typeof SFX !== 'undefined') SFX.correct();
      hasGuessedCorrectly = true;
      const inputArea = document.getElementById('chat-input-area');
      if (inputArea) {
        inputArea.innerHTML = `<div class="dg-guessed-correct">You guessed it! +${data.points}</div>`;
      }
    } else if (data.isClose) {
      if (typeof SFX !== 'undefined') SFX.close();
    }
  });

  // Hint reveal (letter revealed)
  socket.on('hint-reveal', (data) => {
    if (typeof SFX !== 'undefined') SFX.hint();
    const dashedEl = document.getElementById('dashed-word');
    if (dashedEl) {
      dashedEl.innerHTML = formatDashedWord(data.dashedWord);
    }
    // System message in chat
    addChatMessage({
      playerName: '',
      message: 'A letter has been revealed!',
      isSystem: false,
      isCorrect: false,
      isClose: false,
      isHint: true
    });
  });

  // All guessed — end turn early
  socket.on('all-guessed', () => {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.allGuessed();
    const isHost = sessionStorage.getItem('isHost') === 'true';
    addChatMessage({
      playerName: '',
      message: 'Everyone guessed the word!',
      isSystem: false,
      isCorrect: false,
      isClose: false,
      isHint: true
    });
    if (isHost) setTimeout(() => socket.emit('show-results'), 2000);
  });

  socket.on('draw-data', (data) => {
    drawLine(data);
  });

  socket.on('draw-clear', () => {
    if (ctx && canvas) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  });

  socket.on('draw-fill', (data) => {
    if (ctx && canvas) {
      ctx.fillStyle = data.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  });

  socket.on('draw-undo', (data) => {
    if (ctx && canvas && data && data.imageData) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = data.imageData;
    }
  });

  socket.on('round-result', renderRoundResults);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
