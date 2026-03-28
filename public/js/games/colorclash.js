// Color Clash (UNO) — Client-side game logic
(function () {
  const gameView = document.getElementById('game-view');
  const myName = sessionStorage.getItem('playerName');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  const COLOR_HEX = { red: '#e74c3c', blue: '#3867d6', green: '#27ae60', yellow: '#f7b731', wild: '#9b59b6' };
  const LABEL_MAP = { skip: '⊘', reverse: '⟲', draw2: '+2', wild: '✦', wild4: '+4' };

  let prevHandCount = 0;
  let prevTopCardKey = '';
  let animatingPlay = false;
  let animatingDraw = false;

  function cardLabel(card) { return LABEL_MAP[card.value] || card.value; }
  function cardColor(card) { return COLOR_HEX[card.color] || '#9b59b6'; }
  function cardKey(card) { return (card.color || '') + '-' + (card.value || ''); }

  socket.on('cc-state', (data) => renderGame(data, true));
  socket.on('cc-update', (data) => renderGame(data, false));

  socket.on('cc-over', (data) => {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    showGameOver(data.winner, data.players);
  });

  socket.on('game-over', (data) => {
    if (!gameView.querySelector('.cc-game') && !gameView.querySelector('.cc-hand')) return;
    if (typeof SFX !== 'undefined') SFX.gameOver();
    showGameOver(null, data.players || []);
  });

  function showGameOver(winner, players) {
    gameView.innerHTML = `
      <div class="cc-game fade-in">
        <h2 class="cc-title">🎉 ${winner ? 'Game Over!' : 'Game Ended'}</h2>
        ${winner ? `<div class="cc-winner-banner">${escapeHtml(winner)} wins!</div>` : ''}
        <div class="cc-final-scores">
          ${players.map((p, i) => `
            <div class="cc-score-row" style="animation: fadeSlideUp 0.3s ease-out ${i * 0.08}s backwards">
              <span class="cc-rank">${['🥇','🥈','🥉'][i] || (i+1)}</span>
              <span class="cc-sname">${escapeHtml(p.name)}</span>
              <span class="cc-spts">${p.score} pts</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? '<button class="btn btn-sm btn-primary mt-12" id="cc-back">Back to Lobby</button>' : '<p class="cc-wait">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('cc-back')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  function renderGame(data, isInitial) {
    const { hand, topCard, currentColor, isMyTurn, currentPlayer, playerOrder, mustPickColor, pendingDraw, deckCount, direction, lastAction, phase } = data;

    if (phase === 'over') return;

    // Detect what changed
    const newHandCount = hand.length;
    const newTopKey = cardKey(topCard);
    const drewCards = !isInitial && newHandCount > prevHandCount;
    const playedCard = !isInitial && newTopKey !== prevTopCardKey;
    prevHandCount = newHandCount;
    prevTopCardKey = newTopKey;

    const dirIcon = direction === 1 ? '↻' : '↺';
    const topCol = COLOR_HEX[currentColor] || '#9b59b6';

    // Play card-land sound for discard pile when a new card appears
    if (playedCard && !animatingPlay && typeof SFX !== 'undefined') SFX.cardDeal();
    if (drewCards && typeof SFX !== 'undefined') SFX.cardDraw();

    animatingPlay = false;
    animatingDraw = false;

    gameView.innerHTML = `
      <div class="cc-game">
        <div class="cc-header">
          <div class="cc-turn ${isMyTurn ? 'cc-my-turn' : ''}">
            ${isMyTurn ? '🎯 Your Turn!' : `⏳ ${escapeHtml(currentPlayer)}'s turn`}
          </div>
          <div class="cc-dir" title="Direction">${dirIcon}</div>
          <div class="cc-deck-count">🃏 ${deckCount}</div>
        </div>

        ${lastAction && lastAction.type !== 'play' ? `<div class="cc-action-banner cc-ab-${lastAction.type}">${actionBannerText(lastAction)}</div>` : ''}

        <!-- Table Surface -->
        <div class="cc-table-surface">
          <!-- Opponents -->
          <div class="cc-opponents">
            ${playerOrder.filter(p => p.name !== myName).map(p => `
              <div class="cc-opp ${p.isCurrent ? 'cc-opp-active' : ''}" data-id="${p.id}">
                <div class="cc-opp-avatar">${escapeHtml(p.name).charAt(0).toUpperCase()}</div>
                <div class="cc-opp-fan">${renderFanCards(p.cardCount)}</div>
                <div class="cc-opp-name">${escapeHtml(p.name)}</div>
                <div class="cc-opp-count">${p.cardCount} card${p.cardCount !== 1 ? 's' : ''}</div>
                ${p.calledUno && p.cardCount <= 2 ? '<div class="cc-uno-badge">UNO!</div>' : ''}
                ${!p.calledUno && p.cardCount === 1 ? `<button class="cc-catch-btn" data-target="${p.id}">Catch!</button>` : ''}
              </div>
            `).join('')}
          </div>

          ${pendingDraw > 0 ? `<div class="cc-pending-draw">⚠️ +${pendingDraw} cards pending!</div>` : ''}

          <!-- Discard pile & draw -->
          <div class="cc-table" id="cc-table">
            <div class="cc-discard-area" id="cc-discard-area">
              <div class="cc-top-card ${topCard.color === 'wild' ? 'cc-card-wild' : ''} ${playedCard ? 'cc-card-land' : ''}" id="cc-top-card"
                style="${topCard.color !== 'wild' ? 'background:' + cardColor(topCard) + ';' : ''} ${topCard.color === 'yellow' ? 'color:#333;' : ''}">
                <span class="cc-tc-label">${cardLabel(topCard)}</span>
              </div>
              ${currentColor !== topCard.color ? `<div class="cc-active-color" style="background: ${topCol}"></div>` : ''}
            </div>
            <div class="cc-draw-area" id="cc-draw-area">
              ${isMyTurn && !mustPickColor ? `
                <button class="cc-draw-pile" id="cc-draw">
                  <div class="cc-draw-stack">
                    <div class="cc-draw-card-bg"></div>
                    <div class="cc-draw-card-bg cc-dcs2"></div>
                    <div class="cc-draw-card-bg cc-dcs3"></div>
                  </div>
                  <span>${pendingDraw > 0 ? 'Draw ' + pendingDraw : 'Draw'}</span>
                </button>
              ` : `
                <div class="cc-draw-pile-static">
                  <div class="cc-draw-stack">
                    <div class="cc-draw-card-bg"></div>
                    <div class="cc-draw-card-bg cc-dcs2"></div>
                    <div class="cc-draw-card-bg cc-dcs3"></div>
                  </div>
                </div>
              `}
            </div>
          </div>
        </div>

        ${mustPickColor ? `
          <div class="cc-color-picker">
            <p>Pick a color:</p>
            <div class="cc-colors">
              <button class="cc-color-btn cc-cb-red" data-color="red"></button>
              <button class="cc-color-btn cc-cb-blue" data-color="blue"></button>
              <button class="cc-color-btn cc-cb-green" data-color="green"></button>
              <button class="cc-color-btn cc-cb-yellow" data-color="yellow"></button>
            </div>
          </div>
        ` : ''}

        ${hand.length <= 2 && isMyTurn ? '<button class="cc-uno-btn" id="cc-uno">UNO!</button>' : ''}

        <!-- My hand -->
        <div class="cc-hand" id="cc-hand">
          ${hand.map((card, i) => {
            const playable = isMyTurn && !mustPickColor && canPlayClient(card, currentColor, data.currentValue, pendingDraw);
            const animClass = isInitial ? 'cc-card-deal-in' : (drewCards && i >= prevHandCount - (newHandCount - prevHandCount) ? 'cc-card-draw-in' : '');
            return `
              <button class="cc-card ${card.color === 'wild' ? 'cc-card-wild' : ''} ${playable ? 'cc-playable' : 'cc-dim'} ${animClass}" data-index="${i}"
                style="${card.color !== 'wild' ? 'background:' + cardColor(card) + ';' : ''} ${card.color === 'yellow' ? 'color:#333;' : ''} --deal-i: ${i};"
                ${!playable ? 'disabled' : ''}>
                <span class="cc-card-label">${cardLabel(card)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // ── Card play: fly card to discard pile ──
    gameView.querySelectorAll('.cc-card:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        if (animatingPlay) return;
        animatingPlay = true;

        if (typeof SFX !== 'undefined') SFX.cardPlay();

        const cardRect = btn.getBoundingClientRect();
        const discardEl = document.getElementById('cc-top-card');
        const discardRect = discardEl ? discardEl.getBoundingClientRect() : { left: window.innerWidth / 2 - 45, top: 200 };

        // Create flying clone
        const clone = btn.cloneNode(true);
        clone.className = 'cc-card cc-flying-card';
        clone.style.cssText = `
          position: fixed; z-index: 9999;
          left: ${cardRect.left}px; top: ${cardRect.top}px;
          width: ${cardRect.width}px; height: ${cardRect.height}px;
          background: ${btn.style.background}; color: ${btn.style.color || '#fff'};
          pointer-events: none; transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          border: 2.5px solid rgba(255,255,255,0.5);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        `;
        document.body.appendChild(clone);

        // Fade original
        btn.style.opacity = '0';
        btn.style.transform = 'scale(0.5)';

        // Fly to discard pile
        requestAnimationFrame(() => {
          clone.style.left = discardRect.left + (discardRect.width - cardRect.width) / 2 + 'px';
          clone.style.top = discardRect.top + (discardRect.height - cardRect.height) / 2 + 'px';
          clone.style.transform = 'scale(1.15) rotate(' + (Math.random() * 10 - 5) + 'deg)';
          clone.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5)';
        });

        setTimeout(() => {
          clone.style.transform = 'scale(1) rotate(0deg)';
        }, 250);

        setTimeout(() => {
          clone.remove();
          socket.emit('cc-play', { cardIndex: parseInt(btn.dataset.index) });
        }, 380);
      });
    });

    // ── Draw: fly card from deck to hand ──
    document.getElementById('cc-draw')?.addEventListener('click', () => {
      if (animatingDraw) return;
      animatingDraw = true;

      const drawEl = document.getElementById('cc-draw-area');
      const handEl = document.getElementById('cc-hand');
      if (!drawEl || !handEl) {
        socket.emit('cc-draw');
        return;
      }

      const drawRect = drawEl.getBoundingClientRect();
      const handRect = handEl.getBoundingClientRect();
      const count = pendingDraw > 0 ? Math.min(pendingDraw, 4) : 1;

      for (let c = 0; c < count; c++) {
        const flyCard = document.createElement('div');
        flyCard.className = 'cc-draw-fly-card';
        flyCard.innerHTML = '<div class="cc-draw-fly-inner"><div class="cc-draw-fly-back"></div><div class="cc-draw-fly-front">?</div></div>';
        flyCard.style.cssText = `
          position: fixed; z-index: ${9998 - c};
          left: ${drawRect.left + 10}px; top: ${drawRect.top + 10}px;
          width: 60px; height: 85px;
          pointer-events: none; perspective: 600px;
        `;
        document.body.appendChild(flyCard);

        const inner = flyCard.querySelector('.cc-draw-fly-inner');
        inner.style.cssText = `
          width: 100%; height: 100%; position: relative;
          transform-style: preserve-3d; transition: transform 0.5s ease;
        `;

        setTimeout(() => {
          flyCard.style.transition = 'left 0.45s cubic-bezier(0.4, 0, 0.2, 1), top 0.45s cubic-bezier(0.4, 0, 0.2, 1)';
          flyCard.style.left = (handRect.left + handRect.width / 2 - 30) + 'px';
          flyCard.style.top = (handRect.top) + 'px';
          inner.style.transform = 'rotateY(180deg)';
        }, c * 100 + 30);

        setTimeout(() => {
          if (typeof SFX !== 'undefined') SFX.cardDeal();
        }, c * 100 + 50);

        setTimeout(() => { flyCard.remove(); }, c * 100 + 550);
      }

      setTimeout(() => {
        socket.emit('cc-draw');
      }, count * 100 + 400);
    });

    // Color picker
    gameView.querySelectorAll('.cc-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('cc-pick-color', { color: btn.dataset.color });
      });
    });

    // UNO button
    document.getElementById('cc-uno')?.addEventListener('click', () => {
      if (typeof SFX !== 'undefined') SFX.unoCall();
      const unoBtn = document.getElementById('cc-uno');
      if (unoBtn) {
        unoBtn.classList.add('cc-uno-pop');
        setTimeout(() => unoBtn.classList.remove('cc-uno-pop'), 400);
      }
      socket.emit('cc-uno');
    });

    // Catch buttons
    gameView.querySelectorAll('.cc-catch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('cc-catch', { targetId: btn.dataset.target });
      });
    });
  }

  function canPlayClient(card, currentColor, currentValue, pendingDraw) {
    if (pendingDraw > 0) {
      if (currentValue === 'draw2' && card.value === 'draw2') return true;
      if (currentValue === 'wild4' && card.value === 'wild4') return true;
      return false;
    }
    if (card.color === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.value === currentValue && card.color !== 'wild') return true;
    return false;
  }

  function renderFanCards(count) {
    const show = Math.min(count, 7);
    let html = '<div class="cc-fan">';
    for (let i = 0; i < show; i++) {
      const angle = (i - (show - 1) / 2) * 8;
      html += `<div class="cc-fan-card" style="transform: rotate(${angle}deg)"></div>`;
    }
    html += '</div>';
    return html;
  }

  function actionBannerText(action) {
    if (action.type === 'skip') return `⊘ ${action.player} played Skip!`;
    if (action.type === 'reverse') return `⟲ Direction reversed!`;
    if (action.type === 'draw') return `${action.player} drew ${action.count} card${action.count > 1 ? 's' : ''}`;
    if (action.type === 'caught') return `🚨 ${action.catcher} caught ${action.target}! +2 penalty cards`;
    if (action.type === 'uno') return `🔔 ${action.player} called UNO!`;
    return '';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
