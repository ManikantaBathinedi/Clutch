// ─── WAVELENGTH CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;

  function clearTimer() { clearInterval(timerInterval); }

  function startTimer(phaseStartTime, timeLimit) {
    clearTimer();
    const timerEl = document.getElementById('wl-timer');
    if (!timerEl) return;
    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - phaseStartTime) / 1000;
      const remaining = Math.max(0, Math.ceil(timeLimit - elapsed));
      timerEl.textContent = remaining;
      if (remaining <= 5 && remaining > 0) {
        timerEl.classList.add('wl-timer-warn');
        if (typeof SFX !== 'undefined') SFX.timerWarn();
      }
      if (remaining <= 0) {
        clearTimer();
        timerEl.textContent = '0';
      }
    }, 1000);
  }

  function renderClueGiver(data) {
    clearTimer();
    gameView.innerHTML = `
      <div class="wl-game fade-in">
        <div class="wl-header">
          <span>Round ${data.round} / ${data.totalRounds}</span>
          <span class="wl-timer" id="wl-timer">--</span>
        </div>
        <h3 style="text-align:center;margin-bottom:12px">You're the Clue Giver!</h3>
        <div class="wl-spectrum">
          <div class="wl-label-left">${data.leftLabel}</div>
          <div class="wl-bar">
            <div class="wl-target" style="left:${data.target}%"></div>
          </div>
          <div class="wl-label-right">${data.rightLabel}</div>
        </div>
        <p style="text-align:center;color:var(--text-dim);font-size:0.8rem;margin:8px 0">The target is at ${data.target}%. Give a clue!</p>
        <div class="wl-clue-input">
          <input type="text" id="wl-clue" class="game-input" placeholder="Type your clue..." maxlength="50" autocomplete="off">
          <button class="btn btn-sm btn-primary" id="wl-submit-clue">Send Clue</button>
        </div>
      </div>
    `;
    startTimer(data.phaseStartTime, data.timeLimit);

    document.getElementById('wl-submit-clue').addEventListener('click', () => {
      const clue = document.getElementById('wl-clue').value.trim();
      if (clue) socket.emit('wavelength-clue', { clue });
    });
    document.getElementById('wl-clue').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const clue = e.target.value.trim();
        if (clue) socket.emit('wavelength-clue', { clue });
      }
    });
  }

  function renderGuesser(data) {
    clearTimer();
    if (data.phase === 'clue' && !data.clue) {
      gameView.innerHTML = `
        <div class="wl-game fade-in" style="text-align:center">
          <div class="wl-header">
            <span>Round ${data.round} / ${data.totalRounds}</span>
            <span class="wl-timer" id="wl-timer">--</span>
          </div>
          <div class="wl-spectrum">
            <div class="wl-label-left">${data.leftLabel}</div>
            <div class="wl-bar"></div>
            <div class="wl-label-right">${data.rightLabel}</div>
          </div>
          <p class="wl-waiting">⏳ Waiting for <strong>${escapeHtml(data.clueGiverName)}</strong> to give a clue...</p>
        </div>
      `;
      startTimer(data.phaseStartTime, data.timeLimit);
      return;
    }

    if (data.phase === 'guess') {
      gameView.innerHTML = `
        <div class="wl-game fade-in">
          <div class="wl-header">
            <span>Round ${data.round} / ${data.totalRounds}</span>
            <span class="wl-timer" id="wl-timer">--</span>
          </div>
          <div style="text-align:center;margin-bottom:12px">
            <div class="wl-clue-display">"${escapeHtml(data.clue)}"</div>
            <div style="font-size:0.8rem;color:var(--text-dim)">— ${escapeHtml(data.clueGiverName)}</div>
          </div>
          <div class="wl-spectrum">
            <div class="wl-label-left">${data.leftLabel}</div>
            <div class="wl-bar">
              <div class="wl-slider-track">
                <input type="range" id="wl-guess-slider" min="0" max="100" value="50" class="wl-range">
                <div class="wl-slider-val" id="wl-slider-val">50</div>
              </div>
            </div>
            <div class="wl-label-right">${data.rightLabel}</div>
          </div>
          <div style="text-align:center;margin-top:12px">
            <button class="btn btn-sm btn-primary" id="wl-submit-guess">Lock In Guess</button>
          </div>
        </div>
      `;
      startTimer(data.phaseStartTime, data.timeLimit);

      const slider = document.getElementById('wl-guess-slider');
      const valDisplay = document.getElementById('wl-slider-val');
      slider.addEventListener('input', () => { valDisplay.textContent = slider.value; });

      document.getElementById('wl-submit-guess').addEventListener('click', () => {
        socket.emit('wavelength-guess', { guess: parseInt(slider.value, 10) });
        document.getElementById('wl-submit-guess').disabled = true;
        document.getElementById('wl-submit-guess').textContent = '✓ Locked In';
      });
    }
  }

  function renderReveal(data) {
    clearTimer();
    if (typeof SFX !== 'undefined') SFX.roundResults();

    const guessMarkers = data.players.filter(p => p.guess !== null && !p.isClueGiver).map(p =>
      `<div class="wl-guess-marker" style="left:${p.guess}%" title="${escapeHtml(p.name)}: ${p.guess}">
        <span class="wl-marker-dot"></span>
        <span class="wl-marker-label">${escapeHtml(p.name)}</span>
      </div>`
    ).join('');

    gameView.innerHTML = `
      <div class="wl-game fade-in">
        <div class="wl-header">
          <span>Round ${data.round} / ${data.totalRounds}</span>
          <span>Results</span>
        </div>
        <div style="text-align:center;margin-bottom:8px">
          <div class="wl-clue-display">"${escapeHtml(data.clue)}"</div>
        </div>
        <div class="wl-spectrum wl-reveal">
          <div class="wl-label-left">${data.leftLabel}</div>
          <div class="wl-bar">
            <div class="wl-target wl-target-reveal" style="left:${data.target}%">🎯</div>
            ${guessMarkers}
          </div>
          <div class="wl-label-right">${data.rightLabel}</div>
        </div>
        <div class="wl-scores">
          ${data.players.map(p => `
            <div class="wl-score-row">
              <span>${escapeHtml(p.name)} ${p.isClueGiver ? '(Clue Giver)' : ''}</span>
              <span>${p.distance !== null ? `${p.distance} away` : '—'}</span>
              <span class="wl-pts">+${p.points}</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? `<button class="btn btn-sm btn-primary" id="wl-next" style="margin-top:16px;display:block;margin-left:auto;margin-right:auto">${data.round >= data.totalRounds ? '🏆 Final Results' : 'Next Round ➜'}</button>` : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('wl-next')?.addEventListener('click', () => {
      socket.emit('wavelength-next');
    });
  }

  function renderGameOver(data) {
    clearTimer();
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">📡 Wavelength — Final Results</h2>
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
          <div class="result-actions" style="margin-top:24px;display:flex;gap:12px;justify-content:center">
            <button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button>
          </div>
        ` : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  socket.on('wavelength-clue-view', renderClueGiver);
  socket.on('wavelength-guess-view', renderGuesser);
  socket.on('wavelength-reveal', renderReveal);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
