// Blackjack — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const SUIT_COLORS = { hearts: '#e74c3c', diamonds: '#e74c3c', clubs: '#2d3436', spades: '#2d3436' };

  let prevMyCardCount = 0;
  let prevDealerCardCount = 0;

  socket.on('bj-state', (data) => renderGame(data));
  socket.on('bj-update', (data) => renderGame(data));

  function renderCard(card, hidden, index, isNew) {
    const animClass = isNew ? 'bj-card-fly-in' : '';
    const delay = index * 0.12;
    if (!card || hidden || card.hidden) {
      return `<div class="bj-card bj-card-hidden ${animClass}" style="--card-i:${index}; animation-delay:${delay}s">🂠</div>`;
    }
    const col = SUIT_COLORS[card.suit] || '#333';
    const sym = SUIT_SYMBOLS[card.suit] || '';
    return `<div class="bj-card ${animClass}" style="color:${col}; --card-i:${index}; animation-delay:${delay}s"><span class="bj-cv">${card.value}</span><span class="bj-cs">${sym}</span></div>`;
  }

  let lastPhase = '';
  let lastStatus = '';

  function renderGame(data) {
    const { phase, dealer, me, myTotal, isMyTurn, players, roundNumber } = data;

    if (phase === 'betting') {
      renderBetting(data);
      lastPhase = phase;
      lastStatus = '';
      return;
    }

    if (phase === 'ended') {
      renderEnded(data);
      return;
    }

    // Sound effects for state transitions
    if (typeof SFX !== 'undefined') {
      if (me.status === 'busted' && lastStatus !== 'busted') SFX.bust();
      if (phase === 'resolved' && lastPhase !== 'resolved') {
        if (me.result === 'blackjack' || me.result === 'win') SFX.bjWin();
        else if (me.result === 'lose' || me.result === 'bust') SFX.bust();
      }
    }
    lastPhase = phase;
    lastStatus = me.status;

    // Detect new cards
    const myCardCount = (me.hand || []).length;
    const dealerCardCount = (dealer.hand || []).length;
    const isFirstDeal = lastPhase === 'betting' || prevMyCardCount === 0;
    const myNewCards = isFirstDeal ? myCardCount : Math.max(0, myCardCount - prevMyCardCount);
    const dealerNewCards = isFirstDeal ? dealerCardCount : Math.max(0, dealerCardCount - prevDealerCardCount);
    prevMyCardCount = myCardCount;
    prevDealerCardCount = dealerCardCount;

    // Play card sound for new cards
    if (!isFirstDeal && (myNewCards > 0 || dealerNewCards > 0) && typeof SFX !== 'undefined') SFX.cardDeal();

    const dealerCards = (dealer.hand || []).map((c, i) => {
      const isNew = isFirstDeal || i >= dealerCardCount - dealerNewCards;
      return renderCard(c, false, i, isNew);
    }).join('');

    const myCards = (me.hand || []).map((c, i) => {
      const isNew = isFirstDeal || i >= myCardCount - myNewCards;
      return renderCard(c, false, i, isNew);
    }).join('');

    gameView.innerHTML = `
      <div class="bj-game fade-in">
        <div class="bj-round">Round ${roundNumber}</div>

        <div class="game-layout">
          <div class="game-main">
            <div class="bj-table">
              <!-- Dealer -->
              <div class="bj-dealer-area">
                <div class="bj-dealer-label">🎩 Dealer ${dealer.total !== null ? '(' + dealer.total + ')' : ''}</div>
                <div class="bj-cards-row">${dealerCards}</div>
              </div>

              <!-- Other players (seats) -->
              <div class="bj-others">
                ${players.filter(p => !p.isMe).map(p => `
                  <div class="bj-other ${p.isCurrent ? 'bj-active' : ''}">
                    <div class="bj-other-avatar">${p.avatar || escapeHtml(p.name).charAt(0).toUpperCase()}</div>
                    <div class="bj-other-name">${escapeHtml(p.name)}</div>
                    <div class="bj-other-info">${p.status === 'busted' ? '💥 Bust' : p.status === 'resolved' ? resultEmoji(p.result) : p.cardCount + ' cards'}</div>
                    <div class="bj-other-bet">💰 ${p.bet}</div>
                  </div>
                `).join('')}
              </div>

              <!-- My hand -->
              <div class="bj-my-area">
                <div class="bj-my-label">
                  Your Hand (${myTotal})
                  ${me.status === 'busted' ? ' — 💥 BUST!' : ''}
                  ${me.result && me.status === 'resolved' ? ' — ' + resultText(me.result, me.payout) : ''}
                </div>
                <div class="bj-cards-row">${myCards}</div>
                <div class="bj-chips">💰 ${me.chips} chips | Bet: ${me.bet}</div>
              </div>
              <div class="bj-my-seat-label">Your Seat</div>
            </div>

            ${phase === 'resolved' ? `
              <div class="bj-results">
                ${players.map(p => `
                  <div class="bj-result-row bj-res-${p.result || 'pending'}">
                    <span>${escapeHtml(p.name)}</span>
                    <span>${resultText(p.result, 0)} | ${p.chips} chips</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="game-side-panel">
            <button class="btn btn-sm bj-btn bj-hit" id="bj-hit" ${!(isMyTurn && me.status === 'playing') ? 'disabled' : ''}>Hit</button>
            <button class="btn btn-sm bj-btn bj-stand" id="bj-stand" ${!(isMyTurn && me.status === 'playing') ? 'disabled' : ''}>Stand</button>
            <button class="btn btn-sm bj-btn bj-double" id="bj-double" ${!(isMyTurn && me.status === 'playing') || me.hand.length !== 2 ? 'disabled' : ''}>Double</button>
            ${isHost && phase === 'resolved' ? '<button class="btn btn-sm btn-primary" id="bj-next">Next Round</button><button class="btn btn-sm" id="bj-lobby">Back to Lobby</button>' : ''}
            <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('blackjack')">📖 Rules</button>
          </div>
        </div>
      </div>
    `;

    // Action handlers
    document.getElementById('bj-hit')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.cardPlay();
      socket.emit('bj-hit');
    });
    document.getElementById('bj-stand')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('bj-stand');
    });
    document.getElementById('bj-double')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.cardPlay();
      socket.emit('bj-double');
    });
    document.getElementById('bj-next')?.addEventListener('click', () => {
      socket.emit('bj-new-round');
    });
    document.getElementById('bj-lobby')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  function renderBetting(data) {
    const { me, roundNumber, players } = data;

    gameView.innerHTML = `
      <div class="bj-game fade-in">
        <h2 class="bj-title">🃏 Blackjack — Round ${roundNumber}</h2>
        <div class="bj-chips-display">💰 ${me.chips} chips</div>

        <div class="bj-bet-area">
          <p class="bj-bet-label">Place your bet:</p>
          <div class="bj-bet-chips">
            <button class="bj-chip-btn" data-amount="10">10</button>
            <button class="bj-chip-btn" data-amount="25">25</button>
            <button class="bj-chip-btn" data-amount="50">50</button>
            <button class="bj-chip-btn" data-amount="100">100</button>
            <button class="bj-chip-btn" data-amount="250">250</button>
          </div>
          <div class="bj-custom-bet">
            <input type="number" id="bj-bet-input" class="game-input" min="10" max="${me.chips}" value="25" placeholder="Custom bet" style="text-align:center;font-weight:700;max-width:160px;display:inline-block">
            <button class="btn btn-sm btn-primary" id="bj-place-bet">Place Bet</button>
          </div>
        </div>

        <div class="bj-waiting-bets">
          ${players.map(p => `
            <span class="bj-bet-status ${p.status === 'ready' ? 'bj-bet-done' : ''}">${escapeHtml(p.name)}: ${p.status === 'ready' ? '✅ ' + p.bet : '⏳'}</span>
          `).join('')}
        </div>
      </div>
    `;

    // Chip buttons set the input
    gameView.querySelectorAll('.bj-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('bj-bet-input');
        if (input) input.value = btn.dataset.amount;
        if (typeof SFX !== 'undefined') SFX.click();
      });
    });

    document.getElementById('bj-place-bet')?.addEventListener('click', () => {
      const input = document.getElementById('bj-bet-input');
      const amount = parseInt(input?.value);
      if (amount && amount >= 10) {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('bj-bet', { amount });
      }
    });
  }

  function renderEnded(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    const { players } = data;
    gameView.innerHTML = `
      <div class="bj-game fade-in">
        <h2 class="bj-title">Game Ended</h2>
        <div class="bj-results">
          ${(players || []).map(p => `
            <div class="bj-result-row">
              <span>${escapeHtml(p.name)}</span>
              <span>${p.chips || 0} chips</span>
            </div>
          `).join('')}
          ${isHost ? '<button class="btn btn-sm btn-primary mt-12" id="bj-lobby2">Back to Lobby</button>' : '<p style="text-align:center;color:var(--text-dim)">Waiting for host...</p>'}
        </div>
      </div>
    `;
    document.getElementById('bj-lobby2')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  // Backup: handle generic game-over from end-game-early
  socket.on('game-over', (data) => {
    if (!gameView.querySelector('.bj-game') && !gameView.querySelector('.bj-dealer-area')) return;
    renderEnded(data);
  });

  function resultEmoji(result) {
    const emojis = { blackjack: '🃏 BJ!', win: '✅ Win', lose: '❌ Lose', push: '🤝 Push', bust: '💥 Bust' };
    return emojis[result] || '⏳';
  }

  function resultText(result, payout) {
    const texts = { blackjack: '🃏 Blackjack!', win: '✅ Win!', lose: '❌ Lose', push: '🤝 Push', bust: '💥 Bust' };
    return texts[result] || 'Pending';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
