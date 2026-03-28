// ─── JUST ONE CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  function renderCluePhase(data) {
    if (data.isGuesser) {
      gameView.innerHTML = `
        <div class="jo-game fade-in" style="text-align:center">
          <div class="jo-header">Round ${data.round} / ${data.totalRounds} &nbsp; | &nbsp; Team Score: ${data.teamScore}</div>
          <h2 style="margin:20px 0">You're the Guesser!</h2>
          <p style="color:var(--text-dim)">Other players are writing clues for you...</p>
          <div class="jo-progress">${data.totalClues} / ${data.totalClueGivers} clues submitted</div>
          <div class="spinner" style="margin:20px auto"></div>
        </div>
      `;
      return;
    }

    // Clue giver view
    if (data.hasSubmitted) {
      gameView.innerHTML = `
        <div class="jo-game fade-in" style="text-align:center">
          <div class="jo-header">Round ${data.round} / ${data.totalRounds} &nbsp; | &nbsp; Team Score: ${data.teamScore}</div>
          <div class="jo-word">${escapeHtml(data.word)}</div>
          <p style="color:var(--success);margin:12px 0">✓ Clue submitted! Waiting for others...</p>
          <div class="jo-progress">${data.totalClues} / ${data.totalClueGivers} clues submitted</div>
        </div>
      `;
      return;
    }

    gameView.innerHTML = `
      <div class="jo-game fade-in">
        <div class="jo-header">Round ${data.round} / ${data.totalRounds} &nbsp; | &nbsp; Team Score: ${data.teamScore}</div>
        <div style="text-align:center">
          <p style="color:var(--text-dim);margin-bottom:4px">The word for <strong>${escapeHtml(data.guesserName)}</strong> is:</p>
          <div class="jo-word">${escapeHtml(data.word)}</div>
          <p style="color:var(--text-mid);font-size:0.8rem;margin:8px 0">Write a ONE-WORD clue. Duplicates will be removed!</p>
        </div>
        <div class="jo-clue-input">
          <input type="text" id="jo-clue" class="game-input" placeholder="One word clue..." maxlength="30" autocomplete="off">
          <button class="btn btn-sm btn-primary" id="jo-submit-clue">Submit Clue</button>
        </div>
        <div class="jo-progress">${data.totalClues} / ${data.totalClueGivers} clues submitted</div>
      </div>
    `;

    document.getElementById('jo-submit-clue').addEventListener('click', () => {
      const clue = document.getElementById('jo-clue').value.trim();
      if (clue) socket.emit('justone-clue', { clue });
    });
    document.getElementById('jo-clue').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const clue = e.target.value.trim();
        if (clue) socket.emit('justone-clue', { clue });
      }
    });
  }

  function renderReview(data) {
    // Only host/clue givers see this; guesser still waits
    if (data.isGuesser) {
      gameView.innerHTML = `
        <div class="jo-game fade-in" style="text-align:center">
          <div class="jo-header">Round ${data.round} / ${data.totalRounds}</div>
          <h2 style="margin:20px 0">🔍 Reviewing Clues...</h2>
          <p style="color:var(--text-dim)">Duplicate clues are being removed</p>
          <div class="spinner" style="margin:20px auto"></div>
        </div>
      `;
      return;
    }

    gameView.innerHTML = `
      <div class="jo-game fade-in">
        <div class="jo-header">Round ${data.round} / ${data.totalRounds}</div>
        <div style="text-align:center;margin-bottom:16px">
          <p style="color:var(--text-dim)">Word: <strong>${escapeHtml(data.word)}</strong></p>
          <h3>Reviewing Clues</h3>
        </div>
        <div class="jo-clue-list">
          ${data.allClues.map(c => `
            <div class="jo-clue-item ${c.isDuplicate ? 'jo-duplicate' : ''}">
              <span class="jo-clue-text">${escapeHtml(c.clue)}</span>
              <span class="jo-clue-author">${escapeHtml(c.playerName)}</span>
              ${c.isDuplicate ? '<span class="jo-dupe-badge">DUPLICATE</span>' : ''}
            </div>
          `).join('')}
        </div>
        ${isHost ? `<button class="btn btn-sm btn-primary" id="jo-confirm-clues" style="margin-top:16px;display:block;margin-left:auto;margin-right:auto">Confirm & Show to Guesser</button>` : ''}
      </div>
    `;

    document.getElementById('jo-confirm-clues')?.addEventListener('click', () => {
      socket.emit('justone-confirm');
    });
  }

  function renderGuessPhase(data) {
    if (!data.isGuesser) {
      gameView.innerHTML = `
        <div class="jo-game fade-in" style="text-align:center">
          <div class="jo-header">Round ${data.round} / ${data.totalRounds}</div>
          <p style="color:var(--text-dim);margin:8px 0">Word: <strong>${escapeHtml(data.word || '???')}</strong></p>
          <h3 style="margin:12px 0">${escapeHtml(data.guesserName)} is guessing...</h3>
          <div class="jo-clue-list">
            ${data.filteredClues.map(c => `<div class="jo-clue-item"><span class="jo-clue-text">${escapeHtml(c)}</span></div>`).join('')}
          </div>
        </div>
      `;
      return;
    }

    gameView.innerHTML = `
      <div class="jo-game fade-in">
        <div class="jo-header">Round ${data.round} / ${data.totalRounds}</div>
        <div style="text-align:center;margin-bottom:16px">
          <h3>Your Clues:</h3>
        </div>
        <div class="jo-clue-list">
          ${data.clues.length > 0
            ? data.clues.map(c => `<div class="jo-clue-item jo-reveal-clue"><span class="jo-clue-text">${escapeHtml(c)}</span></div>`).join('')
            : '<div style="text-align:center;color:var(--text-dim)">All clues were duplicates! 😬</div>'
          }
        </div>
        <div class="jo-guess-input">
          <input type="text" id="jo-guess" class="game-input" placeholder="Your guess..." maxlength="50" autocomplete="off">
          <button class="btn btn-sm btn-primary" id="jo-submit-guess">Guess!</button>
          <button class="btn btn-sm" id="jo-skip-guess" style="margin-left:8px">Skip</button>
        </div>
      </div>
    `;

    document.getElementById('jo-submit-guess').addEventListener('click', () => {
      const guess = document.getElementById('jo-guess').value.trim();
      if (guess) socket.emit('justone-guess', { guess });
    });
    document.getElementById('jo-guess').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const guess = e.target.value.trim();
        if (guess) socket.emit('justone-guess', { guess });
      }
    });
    document.getElementById('jo-skip-guess').addEventListener('click', () => {
      socket.emit('justone-skip');
    });
  }

  function renderReveal(data) {
    if (typeof SFX !== 'undefined') {
      if (data.correct) SFX.correct(); else SFX.wrong();
    }

    gameView.innerHTML = `
      <div class="jo-game fade-in" style="text-align:center">
        <div class="jo-header">Round ${data.round} / ${data.totalRounds} &nbsp; | &nbsp; Team Score: ${data.teamScore}</div>
        <div class="jo-reveal-result ${data.correct ? 'jo-correct' : 'jo-wrong'}">
          ${data.correct ? '✅ Correct!' : '❌ Wrong!'}
        </div>
        <div style="margin:12px 0">
          <div style="font-size:0.85rem;color:var(--text-dim)">The word was:</div>
          <div class="jo-word">${escapeHtml(data.word)}</div>
          <div style="font-size:0.9rem;margin-top:8px">Guess: <strong>${escapeHtml(data.guess)}</strong></div>
        </div>
        ${isHost ? `<button class="btn btn-sm btn-primary" id="jo-next" style="margin-top:20px">${data.round >= data.totalRounds ? '🏆 Final Results' : 'Next Round ➜'}</button>` : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('jo-next')?.addEventListener('click', () => {
      socket.emit('justone-next');
    });
  }

  function renderGameOver(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">☝️ Just One — Final Results</h2>
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:2rem;font-weight:800;color:var(--accent)">${data.correctCount} / ${data.totalRounds}</div>
          <div style="font-size:0.85rem;color:var(--text-dim)">words guessed correctly</div>
        </div>
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

  socket.on('justone-state', (data) => {
    if (data.phase === 'clue') renderCluePhase(data);
    else if (data.phase === 'review') renderReview(data);
    else if (data.phase === 'guess') renderGuessPhase(data);
    else if (data.phase === 'reveal') renderReveal(data);
  });
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
