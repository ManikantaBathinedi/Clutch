// ─── KING'S CUP CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  const myId = socket.id;

  const suitColors = { '♥': '#e74c3c', '♦': '#e74c3c', '♠': '#1a1a2e', '♣': '#1a1a2e' };

  function render(data) {
    if (!data) return;
    const isMyTurn = data.currentPlayerId === myId;

    if (data.phase === 'draw') {
      gameView.innerHTML = `
        <div class="kc-game fade-in">
          <div class="kc-header">
            <span>Cards left: ${data.cardsLeft} / ${data.totalCards}</span>
            <span>Kings: ${data.kingsDrawn} / 4</span>
          </div>
          <div class="kc-kings-bar">
            ${'👑'.repeat(data.kingsDrawn)}${'⬜'.repeat(4 - data.kingsDrawn)}
          </div>
          <div class="kc-turn-info">
            <span class="kc-player-name">${escapeHtml(data.currentPlayerName)}'s turn</span>
          </div>
          <div class="kc-deck">
            ${isMyTurn ?
              '<button class="kc-card-back kc-drawable" id="kc-draw">🂠<div class="kc-draw-label">Tap to draw</div></button>' :
              '<div class="kc-card-back kc-waiting">🂠<div class="kc-draw-label">Waiting...</div></div>'
            }
          </div>
        </div>
      `;
      document.getElementById('kc-draw')?.addEventListener('click', () => {
        socket.emit('player-answer', { answer: 'draw' });
      });
    } else if (data.phase === 'reveal' && data.currentCard) {
      const card = data.currentCard;
      const rule = data.cardRule;
      const color = suitColors[card.suit] || '#fff';

      gameView.innerHTML = `
        <div class="kc-game fade-in">
          <div class="kc-header">
            <span>Cards left: ${data.cardsLeft} / ${data.totalCards}</span>
            <span>Kings: ${data.kingsDrawn} / 4</span>
          </div>
          <div class="kc-kings-bar">
            ${'👑'.repeat(data.kingsDrawn)}${'⬜'.repeat(4 - data.kingsDrawn)}
          </div>
          <div class="kc-turn-info">
            <span class="kc-player-name">${escapeHtml(data.currentPlayerName)} drew:</span>
          </div>
          <div class="kc-revealed">
            <div class="kc-card-face kc-card-flip" style="color:${color}">
              <div class="kc-card-value">${card.value}</div>
              <div class="kc-card-suit">${card.suit}</div>
            </div>
          </div>
          <div class="kc-rule-card">
            <div class="kc-rule-title">${rule ? escapeHtml(rule.title) : ''}</div>
            <div class="kc-rule-text">${rule ? escapeHtml(rule.rule) : ''}</div>
          </div>
          ${isMyTurn ? '<button class="btn btn-sm btn-primary" id="kc-next" style="margin-top:16px;display:block;margin-left:auto;margin-right:auto">Next Turn ➜</button>' : '<p style="text-align:center;color:var(--text-dim);margin-top:12px">Waiting for ' + escapeHtml(data.currentPlayerName) + '...</p>'}
        </div>
      `;
      document.getElementById('kc-next')?.addEventListener('click', () => {
        socket.emit('player-answer', { answer: 'next' });
      });
    }
  }

  function renderGameOver(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">👑 King's Cup!</h2>
        <p style="text-align:center;color:var(--text-dim);margin-bottom:8px">${data.cardsDrawn} cards drawn, ${data.kingsDrawn} kings found</p>
        <p style="text-align:center;font-size:1.2rem;margin-bottom:16px">The 4th King was drawn — time to chug the King's Cup! 🍺</p>
        ${isHost ? '<div style="margin-top:24px;display:flex;gap:12px;justify-content:center"><button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button></div>' : '<p style="color:var(--text-dim);margin-top:16px;text-align:center">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  socket.on('game-state', render);
  socket.on('round-result', render);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
