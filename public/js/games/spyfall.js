// ─── SPYFALL CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let timerInterval = null;
  let roundEndTime = 0;

  function render(data) {
    clearInterval(timerInterval);

    if (data.roundOver || data.phase === 'reveal') {
      renderReveal(data);
      return;
    }

    roundEndTime = data.roundStartTime + data.timeLimit * 1000;
    const locationList = data.allLocations.map(loc =>
      `<span class="sf-loc-item">${loc}</span>`
    ).join('');

    gameView.innerHTML = `
      <div class="sf-game fade-in">
        <div class="sf-header">
          <div class="sf-round">Round ${data.round} / ${data.totalRounds}</div>
          <div class="sf-timer" id="sf-timer">--:--</div>
        </div>

        <div class="game-layout">
          <div class="game-main">
            <div class="sf-role-card ${data.isSpy ? 'sf-spy' : ''}">
              ${data.isSpy
                ? `<div class="sf-role-icon">🕵️</div>
                   <div class="sf-role-title">You are the SPY!</div>
                   <div class="sf-role-hint">Figure out the location without blowing your cover</div>`
                : `<div class="sf-role-icon">📍</div>
                   <div class="sf-role-title">${data.location}</div>
                   <div class="sf-role-sub">Your role: <strong>${data.role}</strong></div>
                   <div class="sf-role-hint">Find the spy without revealing the location</div>`
              }
            </div>

            <div class="sf-asker">
              🎤 <strong>${escapeHtml(data.currentAskerName)}</strong> asks a question
            </div>

            <div class="sf-players">
              <div class="sf-section-label">Players</div>
              ${data.players.map(p => `
                <div class="sf-player" data-id="${p.id}">
                  <span class="sf-player-avatar">${p.avatar || '😎'}</span>
                  <span class="sf-player-name">${escapeHtml(p.name)}</span>
                </div>
              `).join('')}
            </div>

            ${data.isSpy ? `
              <div class="sf-locations">
                <div class="sf-section-label">Possible Locations</div>
                <div class="sf-loc-grid">${locationList}</div>
              </div>
            ` : ''}
          </div>

          <div class="game-side-panel">
            ${isHost ? `<button class="btn btn-sm" id="sf-next-asker">Next ➜</button>` : ''}
            <button class="btn btn-sm btn-danger" id="sf-call-vote">📢 Vote</button>
            ${data.isSpy ? `<button class="btn btn-sm btn-accent" id="sf-guess-loc">🎯 Guess</button>` : ''}
            <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('spyfall')">📖 Rules</button>
            ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
          </div>
        </div>
      </div>
    `;

    startTimer();

    // Button handlers
    const nextAskerBtn = document.getElementById('sf-next-asker');
    if (nextAskerBtn) {
      nextAskerBtn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('spyfall-next-asker');
      });
    }

    document.getElementById('sf-call-vote')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      showVotePicker(data.players);
    });

    document.getElementById('sf-guess-loc')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      showLocationGuess(data.allLocations);
    });
  }

  function startTimer() {
    const timerEl = document.getElementById('sf-timer');
    if (!timerEl) return;
    timerInterval = setInterval(() => {
      const left = Math.max(0, roundEndTime - Date.now());
      const mins = Math.floor(left / 60000);
      const secs = Math.floor((left % 60000) / 1000);
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (left <= 60000) timerEl.classList.add('sf-timer-warn');
      if (left <= 0) {
        clearInterval(timerInterval);
        timerEl.textContent = '0:00';
        if (isHost) socket.emit('spyfall-timeout');
      }
    }, 1000);
  }

  function showVotePicker(players) {
    const overlay = document.createElement('div');
    overlay.className = 'category-overlay';
    overlay.innerHTML = `
      <div class="category-modal">
        <h3 class="category-title">Who is the Spy?</h3>
        <p class="category-subtitle">Vote to accuse a player</p>
        <div class="category-grid">
          ${players.map(p => `
            <button class="category-btn" data-id="${p.id}">
              <span class="category-icon">${p.avatar || '😎'}</span>
              <span class="category-label">${escapeHtml(p.name)}</span>
            </button>
          `).join('')}
        </div>
        <button class="category-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelector('.category-cancel').addEventListener('click', () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
    });

    overlay.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('spyfall-vote-start', { targetId: btn.dataset.id });
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 200);
      });
    });
  }

  function showLocationGuess(locations) {
    const overlay = document.createElement('div');
    overlay.className = 'category-overlay';
    overlay.innerHTML = `
      <div class="category-modal">
        <h3 class="category-title">🎯 Guess the Location</h3>
        <p class="category-subtitle">Choose carefully — wrong guess and you lose!</p>
        <div class="category-grid">
          ${locations.map(loc => `
            <button class="category-btn" data-loc="${loc}">
              <span class="category-label">${loc}</span>
            </button>
          `).join('')}
        </div>
        <button class="category-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelector('.category-cancel').addEventListener('click', () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
    });

    overlay.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('spyfall-guess', { guess: btn.dataset.loc });
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 200);
      });
    });
  }

  function renderVoting(data) {
    const votingHtml = `
      <div class="sf-vote-panel fade-in">
        <h3>📢 Vote: Is <strong>${escapeHtml(data.voteTargetName)}</strong> the Spy?</h3>
        <p style="color:var(--text-dim);font-size:0.85rem;margin:8px 0">Votes: ${Object.keys(data.votes).length} / ${data.totalVoters}</p>
        <div class="sf-vote-btns">
          <button class="btn btn-sm btn-success" id="sf-vote-yes">👍 Guilty</button>
          <button class="btn btn-sm btn-danger" id="sf-vote-no">👎 Not Guilty</button>
        </div>
      </div>
    `;
    const existing = document.querySelector('.sf-vote-panel');
    if (existing) existing.remove();
    const panel = document.createElement('div');
    panel.innerHTML = votingHtml;
    const container = document.querySelector('.sf-game') || gameView;
    container.appendChild(panel.firstElementChild);

    document.getElementById('sf-vote-yes')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('spyfall-vote', { vote: true });
      document.getElementById('sf-vote-yes').disabled = true;
      document.getElementById('sf-vote-no').disabled = true;
    });
    document.getElementById('sf-vote-no')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('spyfall-vote', { vote: false });
      document.getElementById('sf-vote-yes').disabled = true;
      document.getElementById('sf-vote-no').disabled = true;
    });
  }

  function renderReveal(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.roundResults();
    const vr = data.voteResults;
    const sg = data.spyGuess;

    let revealMsg = '';
    if (sg) {
      revealMsg = sg.correct
        ? `🕵️ The spy <strong>${escapeHtml(sg.spyName)}</strong> correctly guessed the location!`
        : `🕵️ The spy <strong>${escapeHtml(sg.spyName)}</strong> guessed "${escapeHtml(sg.guess)}" — WRONG!`;
    } else if (vr) {
      revealMsg = vr.spyCaught
        ? `✅ <strong>${escapeHtml(vr.targetName)}</strong> was the spy! Well caught!`
        : vr.wrongTarget
          ? `❌ <strong>${escapeHtml(vr.targetName)}</strong> was NOT the spy! The spy was <strong>${escapeHtml(vr.spyName)}</strong>!`
          : '⏰ Time ran out — the spy wins!';
    } else {
      revealMsg = `⏰ Time ran out — the spy wins!`;
    }

    gameView.innerHTML = `
      <div class="sf-game fade-in" style="text-align:center">
        <h2 style="margin-bottom:16px">Round ${data.round} Results</h2>
        <div class="sf-reveal-card">
          <div style="font-size:1.1rem;margin-bottom:12px">${revealMsg}</div>
          <div style="margin:12px 0;font-size:0.9rem;color:var(--text-mid)">
            📍 Location: <strong>${escapeHtml(data.location || '')}</strong>
          </div>
        </div>
        ${isHost ? `<button class="btn btn-sm btn-primary" id="sf-next-round" style="margin-top:20px">${data.round >= data.totalRounds ? '🏆 Final Results' : 'Next Round ➜'}</button>` : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('sf-next-round')?.addEventListener('click', () => {
      socket.emit('spyfall-next');
    });
  }

  function renderGameOver(data) {
    clearInterval(timerInterval);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🕵️ Spyfall — Final Results</h2>
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
          <div class="result-actions" style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
            <button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button>
          </div>
        ` : '<p style="color: var(--text-dim); margin-top: 16px;">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  // Socket listeners
  socket.on('spyfall-state', render);
  socket.on('spyfall-voting', renderVoting);
  socket.on('spyfall-vote-result', (data) => {
    // Re-render with updated state showing the vote result
    render(data);
  });
  socket.on('spyfall-reveal', renderReveal);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
