// Memory Match — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let mismatchTimer = null;

  socket.on('mm-state', (data) => render(data));
  socket.on('mm-update', (data) => render(data));
  socket.on('mm-flip', (data) => render(data));

  socket.on('mm-mismatch', (data) => {
    if (typeof SFX !== 'undefined') SFX.wrong();
    render(data);
    // Auto-hide after 1s
    mismatchTimer = setTimeout(() => {
      socket.emit('mm-hide');
    }, 1200);
  });

  socket.on('mm-match', (data) => {
    if (typeof SFX !== 'undefined') SFX.correct();
    render(data);
  });

  socket.on('game-over', (data) => {
    if (!gameView.querySelector('.mm-game')) return;
    if (mismatchTimer) { clearTimeout(mismatchTimer); mismatchTimer = null; }
    if (typeof SFX !== 'undefined') SFX.gameOver();
    showGameOver(data);
  });

  function render(data) {
    const { cards, isMyTurn, currentPlayer, scores, totalPairs, matchedCount, phase, flipLock } = data;

    const cols = cards.length <= 16 ? 4 : cards.length <= 24 ? 6 : 6;

    gameView.innerHTML = `
      <div class="mm-game fade-in">
        <div class="mm-top-bar">
          <span class="mm-pairs">${matchedCount}/${totalPairs} pairs</span>
          <span class="mm-turn ${isMyTurn ? 'mm-my-turn' : ''}">${isMyTurn ? '🎯 Your Turn!' : '⏳ ' + escapeHtml(currentPlayer) + "'s turn"}</span>
        </div>

        <div class="mm-board" style="grid-template-columns: repeat(${cols}, 1fr);">
          ${cards.map((card, i) => {
            const isFlipped = card.state === 'flipped';
            const isMatched = card.state === 'matched';
            const canClick = !isFlipped && !isMatched && isMyTurn && !flipLock;
            return `
              <button class="mm-card ${isFlipped ? 'mm-flipped' : ''} ${isMatched ? 'mm-matched' : ''} ${canClick ? 'mm-clickable' : ''}"
                data-index="${i}" ${!canClick ? 'disabled' : ''}>
                <div class="mm-card-inner">
                  <div class="mm-card-front">❓</div>
                  <div class="mm-card-back">${card.emoji || ''}</div>
                </div>
              </button>
            `;
          }).join('')}
        </div>

        <div class="mm-scoreboard">
          ${(scores || []).map((s, i) => `
            <div class="mm-score-row">
              <span>${['🥇','🥈','🥉'][i] || (i+1)} ${escapeHtml(s.name)}</span>
              <span>${s.pairs} pairs | ${s.score} pts</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Card clicks
    gameView.querySelectorAll('.mm-card.mm-clickable').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('mm-flip', { cardIndex: parseInt(btn.dataset.index) });
      });
    });
  }

  function showGameOver(data) {
    gameView.innerHTML = `
      <div class="mm-game fade-in">
        <h2 class="mm-title">🎉 Game Over!</h2>
        <div class="mm-final-scores">
          ${(data.players || []).map((p, i) => `
            <div class="mm-score-row" style="animation: fadeSlideUp 0.3s ease-out ${i * 0.08}s backwards">
              <span>${['🥇','🥈','🥉'][i] || (i+1)} ${escapeHtml(p.name)}</span>
              <span>${p.score} pts</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? '<button class="btn btn-sm btn-primary mt-12" id="mm-back">Back to Lobby</button>' : '<p style="text-align:center;color:var(--text-dim)">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('mm-back')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
