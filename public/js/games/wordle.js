// ─── WORDLE CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const KEYBOARD_ROWS = [
    'QWERTYUIOP'.split(''),
    'ASDFGHJKL'.split(''),
    ['ENTER', ...'ZXCVBNM'.split(''), '⌫']
  ];

  let currentData = null;
  let currentInput = '';
  let animatedRowCount = 0; // Track how many guess rows have already been animated

  function render(data) {
    currentData = data;
    if (data.phase === 'finished') { animatedRowCount = 0; renderFinished(data); return; }
    if (data.phase === 'reveal') { animatedRowCount = 0; renderReveal(data); return; }
    renderGuessing(data);
    // After rendering, mark all current guess rows as already animated
    animatedRowCount = (data.myGuesses || []).length;
  }

  function renderGuessing(data) {
    if (window.updateGameStatus) {
      const status = data.mySolved ? 'Solved!' : `Round ${data.currentRound}/${data.totalRounds} · ${data.myGuessCount}/${data.maxGuesses} guesses`;
      window.updateGameStatus(status);
    }
    let html = `<div class="wordle-game fade-in">
      <div class="wordle-header">
        <h2>🟩 WORDLE</h2>
        <span class="wordle-round">Round ${data.currentRound}/${data.totalRounds}</span>
      </div>`;

    // Progress of other players
    html += `<div class="wordle-players">`;
    data.players.forEach(p => {
      const isMe = p.id === socket.id;
      html += `<div class="wordle-player-pip ${p.solved ? 'wordle-solved' : ''}">
        <span>${p.avatar}</span>
        <span class="wordle-pip-name">${isMe ? 'You' : p.name}</span>
        <span class="wordle-pip-progress">${p.solved ? '✅' : `${p.guessCount}/${data.maxGuesses}`}</span>
      </div>`;
    });
    html += `</div>`;

    // Grid
    html += renderGrid(data.myGuesses, data.maxGuesses, currentInput, data.mySolved);

    // Status
    if (data.mySolved) {
      html += `<div class="wordle-message wordle-success wordle-bounce">🎉 Solved in ${data.myGuessCount} guess${data.myGuessCount > 1 ? 'es' : ''}!</div>`;
    } else if (data.myGuessCount >= data.maxGuesses) {
      html += `<div class="wordle-message wordle-fail">Out of guesses!</div>`;
    }

    // Keyboard
    if (!data.mySolved && data.myGuessCount < data.maxGuesses) {
      html += renderKeyboard(data.keyboard);
    }

    if (isHost) {
      html += `<div class="wordle-footer"><button class="btn btn-sm btn-danger" onclick="socket.emit('end-game-early')">End Game</button> <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('wordle')">📖 Rules</button></div>`;
    } else {
      html += `<div class="wordle-footer"><button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('wordle')">📖 Rules</button></div>`;
    }
    html += `</div>`;

    gameView.innerHTML = html;
    attachKeyboardHandlers();
  }

  function renderReveal(data) {
    if (window.updateGameStatus) window.updateGameStatus(`Round ${data.currentRound} Results`);
    if (data.mySolved && typeof SFX !== 'undefined') SFX.correct();
    let html = `<div class="wordle-game fade-in">
      <div class="wordle-header">
        <h2>🟩 WORDLE — Round ${data.currentRound} Results</h2>
      </div>
      <div class="wordle-reveal-word">The word was: <strong>${data.word}</strong></div>`;

    // Show all players' boards
    html += `<div class="wordle-all-boards">`;
    data.players.forEach(p => {
      html += `<div class="wordle-board-card">
        <h3>${p.name} ${p.solved ? '✅' : '❌'} ${p.solved ? `(${p.guessCount} guesses)` : ''}</h3>
        ${p.guesses ? renderGrid(p.guesses, data.maxGuesses, '', true, true) : ''}
      </div>`;
    });
    html += `</div>`;

    if (isHost) {
      if (data.currentRound < data.totalRounds) {
        html += `<div class="wordle-footer"><button class="btn btn-sm btn-primary" onclick="socket.emit('wordle-next')">Next Round →</button></div>`;
      } else {
        html += `<div class="wordle-footer"><button class="btn btn-sm btn-primary" onclick="socket.emit('wordle-next')">See Results</button></div>`;
      }
    }
    html += `</div>`;
    gameView.innerHTML = html;
  }

  function renderFinished(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    renderReveal(data);
    // Add back-to-lobby button for finished state
    const isHostPlayer = sessionStorage.getItem('isHost') === 'true';
    const container = document.querySelector('.wordle-game');
    if (container) {
      const footer = document.createElement('div');
      footer.className = 'wordle-footer';
      footer.style.marginTop = '16px';
      footer.innerHTML = isHostPlayer
        ? '<button class="btn btn-sm btn-primary" id="wordle-lobby-btn">\ud83c\udfe0 Back to Lobby</button>'
        : '<p style="color:var(--text-dim)">Waiting for host...</p>';
      container.appendChild(footer);
      document.getElementById('wordle-lobby-btn')?.addEventListener('click', () => {
        socket.emit('back-to-lobby');
      });
    }
  }

  function renderGrid(guesses, maxGuesses, input, solved, mini) {
    const sizeClass = mini ? 'wordle-grid-mini' : 'wordle-grid';
    let html = `<div class="${sizeClass}">`;
    for (let row = 0; row < maxGuesses; row++) {
      html += `<div class="wordle-row">`;
      if (row < guesses.length) {
        // Filled row — only animate flip for rows we haven't shown yet
        const shouldFlip = !mini && row >= animatedRowCount;
        guesses[row].result.forEach((cell, i) => {
          if (shouldFlip) {
            html += `<div class="wordle-cell wordle-${cell.status} wordle-flip" style="animation-delay:${i * 0.15}s">${cell.letter}</div>`;
          } else {
            html += `<div class="wordle-cell wordle-${cell.status}">${cell.letter}</div>`;
          }
        });
      } else if (row === guesses.length && !solved) {
        // Current input row
        for (let i = 0; i < 5; i++) {
          const letter = input[i] || '';
          html += `<div class="wordle-cell ${letter ? 'wordle-filled wordle-pop' : ''}">${letter}</div>`;
        }
      } else {
        // Empty row
        for (let i = 0; i < 5; i++) {
          html += `<div class="wordle-cell"></div>`;
        }
      }
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderKeyboard(keyboard) {
    let html = `<div class="wordle-keyboard">`;
    KEYBOARD_ROWS.forEach(row => {
      html += `<div class="wordle-kb-row">`;
      row.forEach(key => {
        const status = keyboard[key] || '';
        const isWide = key === 'ENTER' || key === '⌫';
        html += `<button class="wordle-key ${status ? 'wordle-key-' + status : ''} ${isWide ? 'wordle-key-wide' : ''}" data-key="${key}">${key}</button>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
    return html;
  }

  function attachKeyboardHandlers() {
    document.querySelectorAll('.wordle-key').forEach(btn => {
      btn.addEventListener('click', () => handleKey(btn.dataset.key));
    });
    // Also handle physical keyboard
    if (window._wordleKeyHandler) document.removeEventListener('keydown', window._wordleKeyHandler);
    window._wordleKeyHandler = function (e) {
      if (!currentData || currentData.mySolved || currentData.myGuessCount >= currentData.maxGuesses) return;
      if (e.key === 'Enter') handleKey('ENTER');
      else if (e.key === 'Backspace') handleKey('⌫');
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    document.addEventListener('keydown', window._wordleKeyHandler);
  }

  function handleKey(key) {
    if (!currentData || currentData.mySolved || currentData.myGuessCount >= currentData.maxGuesses) return;

    if (key === '⌫') {
      currentInput = currentInput.slice(0, -1);
      renderGuessing(currentData);
    } else if (key === 'ENTER') {
      if (currentInput.length === 5) {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('wordle-guess', { guess: currentInput });
        currentInput = '';
      }
    } else if (currentInput.length < 5 && /^[A-Z]$/.test(key)) {
      if (typeof SFX !== 'undefined') SFX.tick();
      currentInput += key;
      renderGuessing(currentData);
    }
  }

  socket.on('wordle-state', render);
  socket.on('wordle-update', render);

  socket.on('wordle-error', ({ message }) => {
    if (typeof SFX !== 'undefined') SFX.wrong();
    // Shake the current input row
    const rows = document.querySelectorAll('.wordle-row');
    const currentRow = rows[currentData ? (currentData.myGuesses || []).length : 0];
    if (currentRow) {
      currentRow.classList.add('wordle-shake');
      setTimeout(() => currentRow.classList.remove('wordle-shake'), 500);
    }
    if (typeof showToast === 'function') showToast(message, 'error');
  });
})();
