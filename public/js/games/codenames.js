// Codenames — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  // ─── TEAM SELECTION PHASE ───
  socket.on('codenames-teams', (data) => {
    renderTeamSelect(data);
  });

  function renderTeamSelect(data) {
    const redPlayers = data.teams.red.players.map(n => `<li>${escapeHtml(n)}${n === data.teams.red.spymaster ? ' <span class="cn-spy-badge">🕵️ Spymaster</span>' : ''}</li>`).join('');
    const bluePlayers = data.teams.blue.players.map(n => `<li>${escapeHtml(n)}${n === data.teams.blue.spymaster ? ' <span class="cn-spy-badge">🕵️ Spymaster</span>' : ''}</li>`).join('');

    gameView.innerHTML = `
      <div class="cn-team-select fade-in">
        <h2 class="cn-title">🕵️ Codenames</h2>
        <p class="cn-subtitle">Join a team and pick your spymasters!</p>

        <div class="cn-teams-row">
          <div class="cn-team-card cn-red">
            <h3>🔴 Red Team</h3>
            <ul class="cn-player-list">${redPlayers || '<li class="cn-empty">No players yet</li>'}</ul>
            <button class="btn cn-join-btn cn-join-red" id="join-red">Join Red</button>
            <button class="btn cn-spy-btn" id="spy-red">Be Spymaster</button>
          </div>
          <div class="cn-team-card cn-blue">
            <h3>🔵 Blue Team</h3>
            <ul class="cn-player-list">${bluePlayers || '<li class="cn-empty">No players yet</li>'}</ul>
            <button class="btn cn-join-btn cn-join-blue" id="join-blue">Join Blue</button>
            <button class="btn cn-spy-btn" id="spy-blue">Be Spymaster</button>
          </div>
        </div>

        ${isHost ? `<button class="btn btn-sm btn-primary cn-start-btn" id="cn-start" ${(!data.teams.red.spymaster || !data.teams.blue.spymaster || data.teams.red.players.length < 1 || data.teams.blue.players.length < 1) ? 'disabled' : ''}>Start Game</button>` : '<p class="cn-wait">Waiting for host to start...</p>'}
      </div>
    `;

    document.getElementById('join-red')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('codenames-join', { team: 'red' });
    });
    document.getElementById('join-blue')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('codenames-join', { team: 'blue' });
    });
    document.getElementById('spy-red')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('codenames-spymaster', { team: 'red' });
    });
    document.getElementById('spy-blue')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('codenames-spymaster', { team: 'blue' });
    });
    document.getElementById('cn-start')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.gameStart();
      socket.emit('codenames-start');
    });
  }

  // ─── GAME BOARD ───
  socket.on('codenames-state', (data) => {
    renderBoard(data);
  });

  socket.on('codenames-update', (data) => {
    renderBoard(data);
  });

  function renderBoard(data) {
    const { cards, currentTeam, clue, guessesLeft, isSpymaster, playerTeam, remaining, phase, winner, teams } = data;

    const teamColor = currentTeam === 'red' ? '#e74c3c' : '#3867d6';
    const canGuess = phase === 'guess' && playerTeam === currentTeam && !isSpymaster;
    const canClue = phase === 'clue' && isSpymaster && playerTeam === currentTeam;

    let statusText = '';
    if (phase === 'clue') {
      statusText = isSpymaster && playerTeam === currentTeam
        ? '🕵️ Give your clue!'
        : `Waiting for ${currentTeam.toUpperCase()} spymaster's clue...`;
    } else if (phase === 'guess') {
      statusText = canGuess
        ? `Pick a card! (${guessesLeft} guess${guessesLeft !== 1 ? 'es' : ''} left)`
        : `${currentTeam.toUpperCase()} team is guessing...`;
    }

    gameView.innerHTML = `
      <div class="cn-board fade-in">
        <div class="cn-header">
          <div class="cn-score cn-score-red">🔴 ${remaining.red} left</div>
          <div class="cn-turn" style="color: ${teamColor}">
            ${phase === 'over' ? '' : (currentTeam.toUpperCase() + "'s Turn")}
          </div>
          <div class="cn-score cn-score-blue">🔵 ${remaining.blue} left</div>
        </div>

        ${clue ? `<div class="cn-clue-display">Clue: <strong>${escapeHtml(clue.word)}</strong> — ${clue.number}</div>` : ''}
        <p class="cn-status">${statusText}</p>

        <div class="game-layout">
          <div class="game-main">
            <div class="cn-grid">
              ${cards.map((card, i) => {
                let cls = 'cn-card';
                if (card.revealed) {
                  cls += ' cn-revealed cn-type-' + card.type;
                } else if (isSpymaster && card.type) {
                  cls += ' cn-spy-peek cn-peek-' + card.type;
                }
                if (canGuess && !card.revealed) cls += ' cn-clickable';
                return `<button class="${cls}" data-index="${i}" ${card.revealed || !canGuess ? 'disabled' : ''}>${escapeHtml(card.word)}</button>`;
              }).join('')}
            </div>
          </div>

          <div class="game-side-panel">
            ${canClue ? `
              <input type="text" id="cn-clue-word" class="game-input" placeholder="One-word clue" maxlength="30" autocomplete="off">
              <select id="cn-clue-number" class="game-input" style="padding:7px 10px">
                ${[0,1,2,3,4,5,6,7,8,9].map(n => `<option value="${n}">${n}</option>`).join('')}
              </select>
              <button class="btn btn-sm btn-primary" id="cn-give-clue">Give Clue</button>
            ` : ''}
            <button class="btn btn-sm cn-end-turn-btn" id="cn-end-turn" ${!canGuess ? 'disabled' : ''}>End Turn</button>
            ${isSpymaster ? '<div class="cn-spy-label" style="font-size:0.7rem;text-align:center;margin-top:4px">👁️ Spymaster View</div>' : ''}
            ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
          </div>
        </div>
      </div>
    `;

    // Card click handlers
    if (canGuess) {
      gameView.querySelectorAll('.cn-card:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('codenames-pick', { cardIndex: parseInt(btn.dataset.index) });
        });
      });
      document.getElementById('cn-end-turn')?.addEventListener('click', () => {
        socket.emit('codenames-end-turn');
      });
    }

    // Clue input handler
    if (canClue) {
      const clueBtn = document.getElementById('cn-give-clue');
      const clueInput = document.getElementById('cn-clue-word');
      clueBtn?.addEventListener('click', () => {
        const word = clueInput.value.trim();
        const number = document.getElementById('cn-clue-number').value;
        if (!word) return;
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('codenames-clue', { word, number });
      });
      clueInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') clueBtn?.click();
      });
      clueInput?.focus();
    }
  }

  // ─── GAME OVER ───
  socket.on('codenames-over', (data) => {
    const { winner, cards } = data;
    if (typeof SFX !== 'undefined') SFX.gameOver();

    gameView.innerHTML = `
      <div class="cn-board fade-in">
        <h2 class="cn-title" style="color: ${winner === 'red' ? '#e74c3c' : '#3867d6'}">${winner.toUpperCase()} Team Wins! 🎉</h2>

        <div class="cn-grid cn-grid-final">
          ${cards.map(card => {
            return `<div class="cn-card cn-revealed cn-type-${card.type}">${escapeHtml(card.word)}</div>`;
          }).join('')}
        </div>

        ${isHost ? '<button class="btn btn-sm btn-primary mt-12" id="cn-back">Back to Lobby</button>' : '<p class="cn-wait">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('cn-back')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  });

  // Backup: handle generic game-over from end-game-early
  socket.on('game-over', (data) => {
    if (!gameView.querySelector('.cn-board') && !gameView.querySelector('.cn-grid')) return;
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="cn-board fade-in">
        <h2 class="cn-title">Game Ended</h2>
        ${data.cards ? `<div class="cn-grid cn-grid-final">
          ${data.cards.map(card => `<div class="cn-card cn-revealed cn-type-${card.type}">${escapeHtml(card.word)}</div>`).join('')}
        </div>` : '<p style="text-align:center;color:var(--text-dim)">The host ended the game.</p>'}
        ${isHost ? '<button class="btn btn-sm btn-primary mt-12" id="cn-back2">Back to Lobby</button>' : '<p class="cn-wait">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('cn-back2')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
