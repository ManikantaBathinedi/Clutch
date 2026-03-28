// ─── RUMMY CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const SUIT_HTML = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const SUIT_COLOR = { hearts: '#e53935', diamonds: '#e53935', clubs: '#222', spades: '#222' };
  const RANK_ORDER = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

  let currentData = null;
  let selectedCards = new Set();
  let customHandOrder = []; // Card IDs in user's preferred order
  let draggedCardId = null;

  function getOrderedHand(hand) {
    // Build lookup
    const handMap = {};
    hand.forEach(c => { handMap[c.id] = c; });

    if (customHandOrder.length === 0) {
      // Initial sort by suit then rank
      const sorted = [...hand].sort((a, b) => {
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return (RANK_ORDER[a.value] || 0) - (RANK_ORDER[b.value] || 0);
      });
      customHandOrder = sorted.map(c => c.id);
      return sorted;
    }

    // Maintain custom order, add new cards at end
    const ordered = [];
    const used = new Set();
    for (const id of customHandOrder) {
      if (handMap[id]) {
        ordered.push(handMap[id]);
        used.add(id);
      }
    }
    // Add new cards (from draw) at end
    for (const c of hand) {
      if (!used.has(c.id)) ordered.push(c);
    }
    customHandOrder = ordered.map(c => c.id);
    return ordered;
  }

  function render(data) {
    currentData = data;
    if (data.phase === 'finished') { renderFinished(data); return; }
    renderGame(data);
  }

  function renderGame(data) {
    const turnPlayer = data.players.find(p => p.isCurrentTurn);
    const turnText = data.isMyTurn
      ? (data.hasDrawn ? '🃏 Lay melds or discard a card' : '🃏 Draw a card from deck or discard pile')
      : `⏳ ${turnPlayer ? turnPlayer.name : ''}'s turn`;

    const canLayMeld = data.isMyTurn && data.hasDrawn && selectedCards.size >= 3;
    const canDiscard = data.isMyTurn && data.hasDrawn && selectedCards.size === 1;

    let html = `<div class="rummy-game fade-in">
      <div class="rummy-status ${data.isMyTurn ? 'rummy-my-turn' : ''}">${turnText}</div>
      <div class="rummy-error-msg" id="rummy-error-msg" style="display:none"></div>`;

    html += `<div class="game-layout">`;
    html += `<div class="game-main">`;

    // Green felt table with opponents around it
    const opponents = data.players.filter(p => p.id !== socket.id);
    html += `<div class="rummy-felt-table">`;

    // Opponents seated around top of table
    html += `<div class="rummy-table-seats">`;
    opponents.forEach(p => {
      const fanCards = Math.min(p.cardCount, 7);
      let fanHtml = '';
      for (let i = 0; i < fanCards; i++) {
        const angle = (i - (fanCards - 1) / 2) * 8;
        const yOff = Math.abs(i - (fanCards - 1) / 2) * 2;
        fanHtml += `<div class="rummy-opp-card-back" style="transform:rotate(${angle}deg) translateY(${yOff}px)"></div>`;
      }
      html += `<div class="rummy-table-seat ${p.isCurrentTurn ? 'rummy-active-player' : ''}">
        <span class="rummy-seat-avatar">${p.avatar}</span>
        <span class="rummy-seat-name">${p.name}</span>
        <div class="rummy-seat-fan">${fanHtml}</div>
        <span class="rummy-seat-count">${p.cardCount} cards</span>
      </div>`;
    });
    html += `</div>`;

    // Table surface: deck + discard
    html += `<div class="rummy-table-surface">
      <div class="rummy-deck-area">
        <div class="rummy-deck ${data.isMyTurn && !data.hasDrawn ? 'rummy-clickable' : ''}" id="rummy-draw-deck">
          <span class="rummy-deck-count">${data.deckCount}</span>
          <span>🂠</span>
        </div>
        <span class="rummy-label">Deck</span>
      </div>
      <div class="rummy-discard-area">
        <div class="rummy-discard ${data.isMyTurn && !data.hasDrawn && data.discardTop ? 'rummy-clickable' : ''}" id="rummy-draw-discard">
          ${data.discardTop ? renderCard(data.discardTop, false) : '<span style="color:var(--text-dim)">Empty</span>'}
        </div>
        <span class="rummy-label">Discard</span>
      </div>
    </div>`;

    // Melds on table
    const allMelds = data.melds || {};
    const hasMelds = Object.values(allMelds).some(m => m.length > 0);
    if (hasMelds) {
      html += `<div class="rummy-table-melds"><div class="rummy-melds">`;
      for (const [pid, playerMelds] of Object.entries(allMelds)) {
        const pName = (data.players.find(p => p.id === pid) || {}).name || 'Player';
        playerMelds.forEach((meld, mi) => {
          html += `<div class="rummy-meld" data-player="${pid}" data-meld="${mi}">
            <span class="rummy-meld-owner">${pName}</span>
            <div class="rummy-meld-cards">${meld.map(c => renderCard(c, false, true)).join('')}</div>
          </div>`;
        });
      }
      html += `</div></div>`;
    }

    html += `</div>`; // end felt table

    // My hand with drag-and-drop reorder
    const orderedHand = getOrderedHand(data.myHand);
    html += `<div class="rummy-hand-section">
      <h3>Your Hand (${data.myHand.length})</h3>
      <div class="rummy-hand" id="rummy-hand">`;
    orderedHand.forEach((card, idx) => {
      const isSelected = selectedCards.has(card.id);
      html += `<div class="rummy-card-wrapper ${isSelected ? 'rummy-card-selected' : ''} rummy-card-deal" style="animation-delay:${idx * 0.05}s" data-card-id="${card.id}" draggable="true">
        ${renderCard(card, true)}
      </div>`;
    });
    html += `</div>`;

    html += `</div>`;

    html += `</div>`; // end game-main

    // Side panel with action buttons
    html += `<div class="game-side-panel">
      <button class="btn btn-sm btn-primary" id="rummy-lay-meld" ${canLayMeld ? '' : 'disabled'}>📋 Lay Meld</button>
      <button class="btn btn-sm btn-danger" id="rummy-discard" ${canDiscard ? '' : 'disabled'}>🗑️ Discard</button>
      <button class="btn btn-sm" onclick="window._rummyClearSelection()">✕ Clear</button>
      <button class="btn btn-sm" onclick="window._rummySortHand()">🔤 Sort</button>
      <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('rummy')">📖 Rules</button>
      ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
    </div>`;
    html += `</div>`; // end game-layout
    html += `</div>`;

    gameView.innerHTML = html;
    attachHandlers(data);
  }

  function renderCard(card, interactive, small) {
    const color = SUIT_COLOR[card.suit] || '#333';
    const sizeClass = small ? 'rummy-card-sm' : 'rummy-card';
    return `<div class="${sizeClass}" style="color:${color}">
      <span class="rummy-card-value">${card.value}</span>
      <span class="rummy-card-suit">${SUIT_HTML[card.suit]}</span>
    </div>`;
  }

  function updateActionButtons() {
    const data = currentData;
    if (!data) return;
    const canLayMeld = data.isMyTurn && data.hasDrawn && selectedCards.size >= 3;
    const canDiscard = data.isMyTurn && data.hasDrawn && selectedCards.size === 1;
    const meldBtn = document.getElementById('rummy-lay-meld');
    const discardBtn = document.getElementById('rummy-discard');
    if (meldBtn) meldBtn.disabled = !canLayMeld;
    if (discardBtn) discardBtn.disabled = !canDiscard;
  }

  function showError(msg) {
    const el = document.getElementById('rummy-error-msg');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
  }

  function attachHandlers(data) {
    // Draw from deck
    const deckEl = document.getElementById('rummy-draw-deck');
    if (deckEl && data.isMyTurn && !data.hasDrawn) {
      deckEl.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.cardDraw();
        socket.emit('rummy-draw-deck');
      });
    }
    // Draw from discard
    const discardEl = document.getElementById('rummy-draw-discard');
    if (discardEl && data.isMyTurn && !data.hasDrawn && data.discardTop) {
      discardEl.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.cardDraw();
        socket.emit('rummy-draw-discard');
      });
    }

    // Card selection (click) + drag-and-drop reorder
    document.querySelectorAll('.rummy-card-wrapper').forEach(el => {
      // Click to select/deselect
      el.addEventListener('click', (e) => {
        if (el.classList.contains('rummy-card-drag-complete')) return;
        const id = el.dataset.cardId;
        if (selectedCards.has(id)) {
          selectedCards.delete(id);
          el.classList.remove('rummy-card-selected');
        } else {
          selectedCards.add(id);
          el.classList.add('rummy-card-selected');
        }
        if (typeof SFX !== 'undefined') SFX.click();
        updateActionButtons();
      });

      // Drag-and-drop reorder
      el.addEventListener('dragstart', (e) => {
        draggedCardId = el.dataset.cardId;
        el.classList.add('rummy-card-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedCardId);
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('rummy-card-dragging');
        draggedCardId = null;
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedCardId && el.dataset.cardId !== draggedCardId) {
          el.classList.add('rummy-card-dragover');
        }
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('rummy-card-dragover');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('rummy-card-dragover');
        const srcId = e.dataTransfer.getData('text/plain');
        const tgtId = el.dataset.cardId;
        if (!srcId || srcId === tgtId) return;

        const oldIdx = customHandOrder.indexOf(srcId);
        const newIdx = customHandOrder.indexOf(tgtId);
        if (oldIdx >= 0 && newIdx >= 0) {
          customHandOrder.splice(oldIdx, 1);
          customHandOrder.splice(newIdx, 0, srcId);
          // Mark to prevent click from firing
          el.classList.add('rummy-card-drag-complete');
          setTimeout(() => el.classList.remove('rummy-card-drag-complete'), 100);
          render(currentData);
        }
      });
    });

    // Lay meld button
    const meldBtn = document.getElementById('rummy-lay-meld');
    if (meldBtn) {
      meldBtn.addEventListener('click', () => {
        const cardIds = [...selectedCards];
        if (cardIds.length < 3) {
          showError('Select at least 3 cards for a meld');
          return;
        }
        if (typeof SFX !== 'undefined') SFX.cardPlay();
        socket.emit('rummy-lay-meld', { cardIds });
        selectedCards.clear();
      });
    }

    // Discard button
    const discardBtn = document.getElementById('rummy-discard');
    if (discardBtn) {
      discardBtn.addEventListener('click', () => {
        const cardId = [...selectedCards][0];
        if (!cardId) return;
        if (typeof SFX !== 'undefined') SFX.cardPlay();
        socket.emit('rummy-discard', { cardId });
        selectedCards.clear();
      });
    }
  }

  function renderFinished(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    renderGame(data);
    const winnerName = (data.players.find(p => p.id === data.winner) || {}).name || 'Someone';
    const isWinner = data.winner === socket.id;
    const isHostPlayer = sessionStorage.getItem('isHost') === 'true';
    const overlay = document.createElement('div');
    overlay.className = 'rummy-result-overlay rummy-result-animate';
    overlay.innerHTML = `<div class="rummy-result-box">
      <h2>${isWinner ? '🎉 You win! Rummy!' : `💀 ${winnerName} went out!`}</h2>
      ${isHostPlayer ? '<button class="btn btn-sm btn-primary" id="rummy-lobby-btn" style="margin-top:16px">🏠 Back to Lobby</button>' : '<p style="color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
    </div>`;
    const el = document.querySelector('.rummy-game');
    if (el) el.appendChild(overlay);
    document.getElementById('rummy-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  window._rummyClearSelection = function () {
    selectedCards.clear();
    if (currentData) render(currentData);
  };

  window._rummySortHand = function () {
    customHandOrder = [];
    if (currentData) render(currentData);
  };

  socket.on('rummy-state', (data) => {
    customHandOrder = []; // Reset order on new game
    selectedCards.clear();
    render(data);
  });
  socket.on('rummy-update', render);
  socket.on('rummy-error', (data) => {
    showError(data.message || 'Invalid action');
  });
})();
