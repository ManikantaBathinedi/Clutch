// Hangman — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;
  let timeLeft = 60;

  socket.on('hangman-state', (data) => render(data));
  socket.on('hangman-update', (data) => render(data));

  socket.on('hangman-round-over', (data) => {
    if (typeof SFX !== 'undefined') {
      if (data.roundResult === 'solved') SFX.correct();
      else SFX.wrong();
    }
    clearTimer();
    render(data);
  });

  socket.on('game-over', (data) => {
    if (!gameView.querySelector('.hm-game')) return;
    clearTimer();
    if (typeof SFX !== 'undefined') SFX.gameOver();
    showGameOver(data);
  });

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function startTimer(seconds) {
    clearTimer();
    timeLeft = seconds;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 5 && timeLeft > 0 && typeof SFX !== 'undefined') SFX.timerWarn();
      if (timeLeft <= 0) {
        clearTimer();
        socket.emit('hangman-timeout');
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('hm-timer');
    if (el) {
      el.textContent = timeLeft + 's';
      el.className = 'hm-timer' + (timeLeft <= 10 ? ' hm-timer-warn' : '');
    }
  }

  function render(data) {
    const { revealedWord, guessedLetters, wrongCount, maxWrong, currentRound, totalRounds,
      timeLimit, roundOver, roundResult, word, roundScorer, scores } = data;

    if (!roundOver && !timerInterval) startTimer(timeLeft > 0 ? timeLeft : timeLimit);

    const stickman = getStickmanSVG(wrongCount, maxWrong);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

    gameView.innerHTML = `
      <div class="hm-game fade-in">
        <div class="hm-top-bar">
          <span class="hm-round">Round ${currentRound}/${totalRounds}</span>
          <span class="hm-timer" id="hm-timer">${timeLeft}s</span>
          <span class="hm-wrong">${wrongCount}/${maxWrong} ❌</span>
        </div>

        <div class="game-layout">
          <div class="game-main">
            <div class="hm-main">
              <div class="hm-stickman">${stickman}</div>
              <div class="hm-word">
                ${revealedWord.map(ch => `<span class="hm-letter ${ch !== '_' ? 'hm-revealed' : ''}">${ch}</span>`).join('')}
              </div>
            </div>

            ${roundOver ? `
              <div class="hm-result hm-result-${roundResult}">
                ${roundResult === 'solved' ? `🎉 Solved by ${escapeHtml(roundScorer || '?')}!` :
                  roundResult === 'hanged' ? `💀 Hanged! The word was: <strong>${escapeHtml(word)}</strong>` :
                  `⏰ Time's up! The word was: <strong>${escapeHtml(word)}</strong>`}
              </div>
            ` : `
              <div class="hm-keyboard" id="hm-keyboard">
                ${alphabet.map(l => {
                  const used = guessedLetters.includes(l);
                  const correct = used && revealedWord.includes(l);
                  return `<button class="hm-key ${used ? (correct ? 'hm-key-correct' : 'hm-key-wrong') : ''}"
                    data-letter="${l}" ${used ? 'disabled' : ''}>${l}</button>`;
                }).join('')}
              </div>
            `}

            <div class="hm-scoreboard">
              ${(scores || []).map((s, i) => `
                <div class="hm-score-row"><span>${['🥇','🥈','🥉'][i] || (i+1)} ${escapeHtml(s.name)}</span><span>${s.score} pts</span></div>
              `).join('')}
            </div>
          </div>

          <div class="game-side-panel">
            ${roundOver && isHost ? '<button class="btn btn-sm btn-primary" id="hm-next">Next Word ➜</button><button class="btn btn-sm btn-danger" id="hm-end">End Game</button>' : ''}
            ${!roundOver && isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
            <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('hangman')">📖 Rules</button>
          </div>
        </div>
      </div>
    `;

    // Keyboard click
    if (!roundOver) {
      gameView.querySelectorAll('.hm-key:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('hangman-guess', { letter: btn.dataset.letter });
          btn.disabled = true;
          btn.classList.add('hm-key-pending');
        });
      });
    }

    // Physical keyboard
    if (!roundOver && !gameView._keyHandler) {
      gameView._keyHandler = (e) => {
        if (roundOver) return;
        const l = e.key.toLowerCase();
        if (/^[a-z]$/.test(l)) {
          const btn = document.querySelector(`.hm-key[data-letter="${l}"]:not([disabled])`);
          if (btn) btn.click();
        }
      };
      document.addEventListener('keydown', gameView._keyHandler);
    }

    // Next / End buttons
    document.getElementById('hm-next')?.addEventListener('click', () => {
      clearTimer();
      socket.emit('hangman-next');
    });
    document.getElementById('hm-end')?.addEventListener('click', () => {
      clearTimer();
      socket.emit('back-to-lobby');
    });
  }

  function showGameOver(data) {
    clearTimer();
    if (gameView._keyHandler) {
      document.removeEventListener('keydown', gameView._keyHandler);
      gameView._keyHandler = null;
    }
    gameView.innerHTML = `
      <div class="hm-game fade-in">
        <h2 class="hm-title">🎉 Game Over!</h2>
        <div class="hm-final-scores">
          ${(data.players || []).map((p, i) => `
            <div class="hm-score-row" style="animation: fadeSlideUp 0.3s ease-out ${i * 0.08}s backwards">
              <span>${['🥇','🥈','🥉'][i] || (i+1)} ${escapeHtml(p.name)}</span>
              <span>${p.score} pts</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? '<button class="btn btn-sm btn-primary mt-12" id="hm-back">Back to Lobby</button>' : '<p style="text-align:center;color:var(--text-dim)">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('hm-back')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  function getStickmanSVG(wrong, max) {
    const parts = [
      // 1: head
      '<circle cx="50" cy="25" r="10" stroke="currentColor" stroke-width="2" fill="none"/>',
      // 2: body
      '<line x1="50" y1="35" x2="50" y2="60" stroke="currentColor" stroke-width="2"/>',
      // 3: left arm
      '<line x1="50" y1="42" x2="35" y2="55" stroke="currentColor" stroke-width="2"/>',
      // 4: right arm
      '<line x1="50" y1="42" x2="65" y2="55" stroke="currentColor" stroke-width="2"/>',
      // 5: left leg
      '<line x1="50" y1="60" x2="35" y2="78" stroke="currentColor" stroke-width="2"/>',
      // 6: right leg
      '<line x1="50" y1="60" x2="65" y2="78" stroke="currentColor" stroke-width="2"/>'
    ];

    const gallows = `
      <line x1="10" y1="85" x2="40" y2="85" stroke="currentColor" stroke-width="2"/>
      <line x1="25" y1="85" x2="25" y2="5" stroke="currentColor" stroke-width="2"/>
      <line x1="25" y1="5" x2="50" y2="5" stroke="currentColor" stroke-width="2"/>
      <line x1="50" y1="5" x2="50" y2="15" stroke="currentColor" stroke-width="2"/>
    `;

    const bodyParts = parts.slice(0, wrong).join('');
    return `<svg viewBox="0 0 80 90" class="hm-svg">${gallows}${bodyParts}</svg>`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
