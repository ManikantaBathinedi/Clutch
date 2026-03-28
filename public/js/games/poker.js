// ─── POKER (TEXAS HOLD'EM) CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const SUIT_HTML = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const SUIT_COLOR = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };

  // Track animation state
  let dealAnimationPlayed = false;
  let lastRoundNumber = 0;
  let handRefOpen = true;
  let communityRevealed = {};  // track which community cards have been animated

  function render(data) {
    if (data.phase === 'waiting') { renderWaiting(data); return; }
    if (data.phase === 'finished') { renderFinished(data); return; }
    if (data.phase === 'showdown') { renderShowdown(data); return; }

    // New hand? Reset animation state
    if (data.roundNumber !== lastRoundNumber) {
      dealAnimationPlayed = false;
      communityRevealed = {};
      lastRoundNumber = data.roundNumber;
    }

    renderTable(data);
  }

  function renderWaiting(data) {
    gameView.innerHTML = `
      <div class="poker-game fade-in" style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
        <div style="text-align:center;">
          <div style="font-size:3rem;margin-bottom:16px;">🃏</div>
          <h2 style="margin-bottom:12px;">Waiting for Players</h2>
          <p style="color:var(--text-dim);font-size:1.1rem;">${data.error || 'Need at least 2 players to start Poker'}</p>
        </div>
      </div>
    `;
  }

  function renderTable(data) {
    gameView.innerHTML = `
      <div class="poker-game fade-in">
        <div class="poker-top-info">
          <span class="poker-round">Hand #${data.roundNumber}</span>
          <span class="poker-phase">${phaseLabel(data.phase)}</span>
          <span class="poker-blinds">Blinds: ${data.smallBlind}/${data.bigBlind}</span>
        </div>

        <div class="poker-layout">
          <div class="poker-sidebar poker-sidebar-left">
            ${renderChipLeaderboard(data)}
          </div>

          <div class="poker-main">
            <div class="poker-table">
              <!-- Deck visual -->
              <div class="poker-deck-stack">
                <div class="poker-deck-card dc1"></div>
                <div class="poker-deck-card dc2"></div>
                <div class="poker-deck-card dc3"></div>
              </div>

              <div class="poker-pot">
                <span class="poker-pot-label">POT</span>
                <span class="poker-pot-amount">${formatChips(data.pot)}</span>
              </div>

              <div class="poker-community" id="poker-community">
                ${renderCommunity(data.community)}
              </div>

              <div class="poker-seats">
                ${data.players.map((p, i) => renderSeat(p, data, i)).join('')}
              </div>
            </div>

            ${data.lastAction ? `<div class="poker-action-msg">${getActionMsg(data)}</div>` : ''}

            <div class="poker-my-hand" id="poker-my-hand">
              ${renderMyHand(data)}
            </div>

            <div class="poker-controls">
              ${renderControls(data)}
            </div>
          </div>

          <div class="poker-sidebar poker-sidebar-right">
            ${renderHandRef()}
          </div>
        </div>
      </div>
    `;

    attachEvents(data);

    // Animate deal if new hand
    if (!dealAnimationPlayed) {
      dealAnimationPlayed = true;
      animateDeal(data);
    }

    // Animate community cards appearing
    animateCommunityCards(data);
  }

  function renderShowdown(data) {
    gameView.innerHTML = `
      <div class="poker-game fade-in">
        <div class="poker-top-info">
          <span class="poker-round">Hand #${data.roundNumber}</span>
          <span class="poker-phase">SHOWDOWN</span>
        </div>

        <div class="poker-layout">
          <div class="poker-sidebar poker-sidebar-left">
            ${renderChipLeaderboard(data)}
          </div>

          <div class="poker-main">
            <div class="poker-table">
              <div class="poker-pot">
                <span class="poker-pot-label">POT</span>
                <span class="poker-pot-amount">${formatChips(data.pot)}</span>
              </div>

              <div class="poker-community">
                ${renderCommunity(data.community)}
              </div>

              <div class="poker-seats">
                ${data.players.map((p, i) => renderSeat(p, data, i)).join('')}
              </div>
            </div>

            <div class="poker-showdown-results">
              ${data.winners ? data.winners.map(w => {
                const p = data.players.find(pl => pl.id === w.id);
                return `<div class="poker-winner-card">
                  <span class="poker-winner-name">${p ? escapeHtml(p.name) : '?'}</span>
                  <span class="poker-winner-hand">🏆 ${w.handName}</span>
                  <div class="poker-winner-cards">${w.cards.map(c => renderCard(c, false)).join('')}</div>
                </div>`;
              }).join('') : ''}

              ${data.handResults ? `<div class="poker-hand-results">
                ${data.handResults.filter(h => !data.winners.find(w => w.id === h.id)).map(h => {
                  const p = data.players.find(pl => pl.id === h.id);
                  return `<div class="poker-loser-hand">
                    <span>${p ? escapeHtml(p.name) : '?'}: ${h.handName}</span>
                  </div>`;
                }).join('')}
              </div>` : ''}
            </div>

            ${isHost ? `<button class="btn btn-sm btn-primary poker-next-btn" id="poker-next-hand">Next Hand ➜</button>` : '<p style="color:var(--text-dim);font-size:0.85rem;text-align:center;margin-top:12px">Waiting for host...</p>'}
          </div>

          <div class="poker-sidebar poker-sidebar-right">
            ${renderHandRef()}
          </div>
        </div>
      </div>
    `;

    const nextBtn = document.getElementById('poker-next-hand');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        socket.emit('poker-new-hand');
        nextBtn.disabled = true;
      });
    }

    // Attach hand ref toggle
    attachHandRefToggle();
  }

  function renderFinished(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    const sorted = [...data.players].sort((a, b) => b.chips - a.chips);
    gameView.innerHTML = `
      <div class="poker-game fade-in" style="text-align:center">
        <h2 style="margin-bottom:16px">🏆 Poker Game Over!</h2>
        <div class="poker-final-results">
          ${sorted.map((p, i) => `
            <div class="poker-final-row ${i === 0 ? 'poker-final-winner' : ''}">
              <span class="poker-final-rank">${i === 0 ? '👑' : '#' + (i+1)}</span>
              <span>${escapeHtml(p.name)}</span>
              <span class="poker-final-chips">${formatChips(p.chips)} chips</span>
            </div>
          `).join('')}
        </div>
        ${isHost
          ? '<button class="btn btn-sm btn-primary" id="poker-lobby-btn" style="margin-top:20px">🏠 Back to Lobby</button>'
          : '<p style="color:var(--text-dim);margin-top:16px;font-size:0.85rem">Waiting for host...</p>'}
      </div>
    `;
    if (isHost) {
      document.getElementById('poker-lobby-btn')?.addEventListener('click', () => {
        socket.emit('poker-end');
      });
    }
  }

  // ─── Card rendering with flip animation support ───

  function renderCard(card, withFlip) {
    if (card.hidden) {
      return `<div class="poker-card poker-card-back">
        <div class="poker-card-back-design">
          <div class="poker-card-back-inner"></div>
        </div>
      </div>`;
    }
    const isRed = card.color === 'red';
    const flipClass = withFlip ? 'poker-card-flip' : '';
    return `<div class="poker-card ${isRed ? 'poker-card-red' : 'poker-card-black'} ${flipClass}">
      <div class="poker-card-front">
        <span class="poker-card-corner poker-card-tl">
          <span class="poker-card-value">${card.value}</span>
          <span class="poker-card-suit">${card.symbol}</span>
        </span>
        <span class="poker-card-center-suit">${card.symbol}</span>
        <span class="poker-card-corner poker-card-br">
          <span class="poker-card-value">${card.value}</span>
          <span class="poker-card-suit">${card.symbol}</span>
        </span>
      </div>
    </div>`;
  }

  function renderCardSmall(card) {
    if (card.hidden) return `<div class="poker-card-sm poker-card-back-sm"><div class="poker-card-back-mini"></div></div>`;
    const isRed = card.color === 'red';
    return `<div class="poker-card-sm ${isRed ? 'poker-card-red' : ''}">${card.value}${card.symbol}</div>`;
  }

  function renderMiniCard(value, suit, isRed) {
    return `<span class="poker-ref-card ${isRed ? 'poker-ref-card-red' : ''}">${value}${suit}</span>`;
  }

  function renderCommunity(community) {
    if (community.length === 0) {
      return `<div class="poker-no-community">
        <div class="poker-community-placeholder">
          <span class="poker-cp-card"></span>
          <span class="poker-cp-card"></span>
          <span class="poker-cp-card"></span>
          <span class="poker-cp-card"></span>
          <span class="poker-cp-card"></span>
        </div>
      </div>`;
    }
    // Count how many new cards are being revealed in this render
    let newCardIndex = 0;
    return community.map((c, i) => {
      const isNew = !communityRevealed[i];
      let delayStyle = '';
      if (isNew) {
        delayStyle = ` style="animation-delay:${newCardIndex * 0.35}s;opacity:0"`;
        newCardIndex++;
      }
      if (isNew) {
        const isRed = c.color === 'red';
        if (c.hidden) {
          return `<div class="poker-card poker-card-back poker-card-flip"${delayStyle}>
            <div class="poker-card-back-design"><div class="poker-card-back-inner"></div></div>
          </div>`;
        }
        return `<div class="poker-card ${isRed ? 'poker-card-red' : 'poker-card-black'} poker-card-flip"${delayStyle}>
          <div class="poker-card-front">
            <span class="poker-card-corner poker-card-tl">
              <span class="poker-card-value">${c.value}</span>
              <span class="poker-card-suit">${c.symbol}</span>
            </span>
            <span class="poker-card-center-suit">${c.symbol}</span>
            <span class="poker-card-corner poker-card-br">
              <span class="poker-card-value">${c.value}</span>
              <span class="poker-card-suit">${c.symbol}</span>
            </span>
          </div>
        </div>`;
      }
      return renderCard(c, false);
    }).join('');
  }

  function animateCommunityCards(data) {
    // Mark all current community cards as revealed for next render
    if (data.community) {
      data.community.forEach((c, i) => { communityRevealed[i] = true; });
    }
  }

  function animateDeal(data) {
    if (typeof SFX !== 'undefined') SFX.cardDeal();
    const deckEl = document.querySelector('.poker-deck-stack');
    const handEl = document.getElementById('poker-my-hand');
    if (!deckEl || !handEl) return;

    // Create flying cards from deck to each seat
    const seatEls = document.querySelectorAll('.poker-seat');
    const deckRect = deckEl.getBoundingClientRect();

    let delay = 0;
    const totalCards = data.players.length * 2;

    for (let round = 0; round < 2; round++) {
      seatEls.forEach((seat, idx) => {
        const seatRect = seat.getBoundingClientRect();
        const flyCard = document.createElement('div');
        flyCard.className = 'poker-fly-card';
        flyCard.style.left = deckRect.left + 'px';
        flyCard.style.top = deckRect.top + 'px';
        flyCard.innerHTML = '<div class="poker-card-back-design"><div class="poker-card-back-inner"></div></div>';
        document.body.appendChild(flyCard);

        const destX = seatRect.left + seatRect.width / 2 - 18;
        const destY = seatRect.top + seatRect.height / 2 - 24;

        setTimeout(() => {
          flyCard.style.transform = `translate(${destX - deckRect.left}px, ${destY - deckRect.top}px) rotate(${Math.random() * 20 - 10}deg)`;
          flyCard.style.opacity = '1';
          setTimeout(() => {
            flyCard.style.opacity = '0';
            setTimeout(() => flyCard.remove(), 200);
          }, 300);
        }, delay);

        delay += 120;
      });
    }

    // After all cards dealt, flip my cards
    setTimeout(() => {
      const myCards = handEl.querySelectorAll('.poker-card');
      myCards.forEach((card, i) => {
        setTimeout(() => {
          card.classList.add('poker-card-deal-in');
        }, i * 200);
      });
    }, delay + 200);
  }

  function renderSeat(player, data, idx) {
    const isCurrent = player.id === data.currentPlayerId;

    let status = '';
    if (player.folded) status = 'FOLD';
    else if (player.allIn) status = 'ALL IN';
    else if (player.sittingOut) status = 'OUT';

    return `
      <div class="poker-seat ${isCurrent ? 'poker-seat-active' : ''} ${player.folded ? 'poker-seat-folded' : ''}">
        <div class="poker-seat-avatar">${player.avatar}</div>
        <div class="poker-seat-name">${escapeHtml(player.name)}${player.isDealer ? ' <span class="poker-dealer-chip">D</span>' : ''}</div>
        <div class="poker-seat-chips">${formatChips(player.chips)}</div>
        <div class="poker-seat-cards">
          ${player.hand.map(c => renderCardSmall(c)).join('')}
        </div>
        ${player.currentBet > 0 ? `<div class="poker-seat-bet">${formatChips(player.currentBet)}</div>` : ''}
        ${status ? `<div class="poker-seat-status">${status}</div>` : ''}
      </div>
    `;
  }

  function renderMyHand(data) {
    const me = data.players.find(p => p.hand && p.hand.length > 0 && !p.hand[0].hidden);
    if (!me || me.folded) return '';
    return `
      <div class="poker-my-cards">
        ${me.hand.map(c => renderCard(c, false)).join('')}
      </div>
    `;
  }

  function renderControls(data) {
    if (!data.isMyTurn) return '';
    const canCheck = data.toCall === 0;
    const canCall = data.toCall > 0;
    const callAmount = Math.min(data.toCall, data.myChips);

    return `
      <div class="poker-action-btns">
        <button class="poker-btn poker-fold-btn" id="poker-fold">Fold</button>
        <button class="poker-btn poker-check-btn" id="poker-check" ${!canCheck ? 'disabled' : ''}>Check</button>
        <button class="poker-btn poker-call-btn" id="poker-call" ${!canCall ? 'disabled' : ''}>Call ${canCall ? formatChips(callAmount) : ''}</button>
        <button class="poker-btn poker-raise-btn" id="poker-raise-btn">Raise</button>
        <button class="poker-btn poker-allin-btn" id="poker-allin">All In (${formatChips(data.myChips)})</button>
      </div>
      <div class="poker-raise-area hidden" id="poker-raise-area">
        <input type="range" id="poker-raise-slider" min="${data.toCall + data.minRaise}" max="${data.myChips}" value="${Math.min(data.toCall + data.minRaise, data.myChips)}" step="${data.bigBlind}">
        <div class="poker-raise-display">
          <span id="poker-raise-value">${data.toCall + data.minRaise}</span>
          <button class="poker-btn poker-confirm-raise" id="poker-confirm-raise">Raise ➜</button>
        </div>
      </div>
    `;
  }

  function attachEvents(data) {
    const foldBtn = document.getElementById('poker-fold');
    const checkBtn = document.getElementById('poker-check');
    const callBtn = document.getElementById('poker-call');
    const raiseBtn = document.getElementById('poker-raise-btn');
    const allInBtn = document.getElementById('poker-allin');
    const raiseArea = document.getElementById('poker-raise-area');
    const raiseSlider = document.getElementById('poker-raise-slider');
    const raiseValue = document.getElementById('poker-raise-value');
    const confirmRaise = document.getElementById('poker-confirm-raise');

    if (foldBtn) foldBtn.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('poker-fold'); disableAll(); });
    if (checkBtn) checkBtn.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('poker-check'); disableAll(); });
    if (callBtn) callBtn.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('poker-call'); disableAll(); });
    if (allInBtn) allInBtn.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('poker-allin'); disableAll(); });

    if (raiseBtn && raiseArea) {
      raiseBtn.addEventListener('click', () => raiseArea.classList.toggle('hidden'));
    }

    if (raiseSlider && raiseValue) {
      raiseSlider.addEventListener('input', () => {
        raiseValue.textContent = formatChips(parseInt(raiseSlider.value));
      });
    }

    if (confirmRaise && raiseSlider) {
      confirmRaise.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('poker-raise', { amount: parseInt(raiseSlider.value) });
        disableAll();
      });
    }

    attachHandRefToggle();
  }

  function attachHandRefToggle() {
    const refToggle = document.getElementById('poker-ref-toggle');
    const refBody = document.getElementById('poker-ref-body');
    if (refToggle && refBody) {
      refToggle.addEventListener('click', () => {
        handRefOpen = !handRefOpen;
        refBody.classList.toggle('poker-ref-collapsed');
        refToggle.querySelector('.poker-ref-arrow').textContent = handRefOpen ? '▲' : '▼';
      });
    }
  }

  function disableAll() {
    document.querySelectorAll('.poker-btn').forEach(btn => btn.disabled = true);
  }

  function getActionMsg(data) {
    const la = data.lastAction;
    if (!la) return '';
    const p = data.players.find(pl => pl.id === la.player);
    const name = p ? escapeHtml(p.name) : '?';
    switch (la.type) {
      case 'fold': return `${name} folded`;
      case 'check': return `${name} checked`;
      case 'call': return `${name} called ${formatChips(la.amount)}`;
      case 'raise': return `${name} raised to ${formatChips(la.total)}`;
      case 'all-in': return `${name} went ALL IN! (${formatChips(la.amount)})`;
      default: return '';
    }
  }

  function phaseLabel(phase) {
    return { 'pre-flop': 'PRE-FLOP', 'flop': 'FLOP', 'turn': 'TURN', 'river': 'RIVER' }[phase] || phase.toUpperCase();
  }

  function formatChips(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function renderChipLeaderboard(data) {
    const sorted = [...data.players].sort((a, b) => b.chips - a.chips);
    const myChips = data.myChips || 0;
    const maxChips = sorted.length > 0 ? sorted[0].chips : 1000;
    return `
      <div class="poker-chip-board">
        <div class="poker-sb-title">💰 Chip Count</div>
        <div class="poker-chip-my">
          <span>Your Chips</span>
          <span class="poker-chip-my-val">${formatChips(myChips)}</span>
        </div>
        <div class="poker-chip-list">
          ${sorted.map((p, i) => {
            const isMe = p.hand && p.hand.length > 0 && !p.hand[0].hidden;
            const medal = i === 0 ? '👑' : '';
            const barPct = Math.max(5, Math.round((p.chips / maxChips) * 100));
            return `<div class="poker-chip-row ${isMe ? 'poker-chip-row-me' : ''} ${p.folded ? 'poker-chip-row-fold' : ''}">
              <span class="poker-chip-rank">${medal || '#' + (i + 1)}</span>
              <span class="poker-chip-name">${escapeHtml(p.name)}</span>
              <div class="poker-chip-bar-wrap">
                <div class="poker-chip-bar" style="width:${Math.min(barPct, 100)}%"></div>
              </div>
              <span class="poker-chip-val">${formatChips(p.chips)}</span>
              ${p.folded ? '<span class="poker-chip-tag fold">FOLD</span>' : ''}
              ${p.allIn ? '<span class="poker-chip-tag allin">ALL IN</span>' : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderHandRef() {
    const hands = [
      { name: 'Royal Flush',     desc: 'A, K, Q, J, 10 of the same suit', cards: [{v:'A',s:'♠'},{v:'K',s:'♠'},{v:'Q',s:'♠'},{v:'J',s:'♠'},{v:'10',s:'♠'}], rank: 10 },
      { name: 'Straight Flush',  desc: 'Five cards in sequence, same suit', cards: [{v:'5',s:'♥',r:1},{v:'6',s:'♥',r:1},{v:'7',s:'♥',r:1},{v:'8',s:'♥',r:1},{v:'9',s:'♥',r:1}], rank: 9 },
      { name: 'Four of a Kind',  desc: 'Four cards of the same value', cards: [{v:'7',s:'♠'},{v:'7',s:'♥',r:1},{v:'7',s:'♦',r:1},{v:'7',s:'♣'},{v:'K',s:'♠'}], rank: 8 },
      { name: 'Full House',      desc: 'Three of a kind plus a pair', cards: [{v:'10',s:'♠'},{v:'10',s:'♥',r:1},{v:'10',s:'♣'},{v:'4',s:'♦',r:1},{v:'4',s:'♠'}], rank: 7 },
      { name: 'Flush',           desc: 'Five cards of the same suit', cards: [{v:'2',s:'♦',r:1},{v:'5',s:'♦',r:1},{v:'8',s:'♦',r:1},{v:'J',s:'♦',r:1},{v:'A',s:'♦',r:1}], rank: 6 },
      { name: 'Straight',        desc: 'Five cards in sequence, any suit', cards: [{v:'3',s:'♠'},{v:'4',s:'♥',r:1},{v:'5',s:'♣'},{v:'6',s:'♦',r:1},{v:'7',s:'♠'}], rank: 5 },
      { name: 'Three of a Kind', desc: 'Three cards of the same value', cards: [{v:'Q',s:'♠'},{v:'Q',s:'♥',r:1},{v:'Q',s:'♣'},{v:'5',s:'♦',r:1},{v:'8',s:'♠'}], rank: 4 },
      { name: 'Two Pair',        desc: 'Two different pairs', cards: [{v:'J',s:'♠'},{v:'J',s:'♥',r:1},{v:'3',s:'♣'},{v:'3',s:'♦',r:1},{v:'K',s:'♠'}], rank: 3 },
      { name: 'One Pair',        desc: 'Two cards of the same value', cards: [{v:'9',s:'♠'},{v:'9',s:'♥',r:1},{v:'A',s:'♣'},{v:'5',s:'♦',r:1},{v:'3',s:'♠'}], rank: 2 },
      { name: 'High Card',       desc: 'No matches — highest card wins', cards: [{v:'A',s:'♠'},{v:'K',s:'♥',r:1},{v:'8',s:'♣'},{v:'5',s:'♦',r:1},{v:'2',s:'♠'}], rank: 1 }
    ];
    return `
      <div class="poker-hand-ref">
        <div class="poker-sb-title poker-ref-toggle" id="poker-ref-toggle">
          📖 Hand Rankings <span class="poker-ref-arrow">${handRefOpen ? '▲' : '▼'}</span>
        </div>
        <div class="poker-ref-body ${handRefOpen ? '' : 'poker-ref-collapsed'}" id="poker-ref-body">
          ${hands.map(h => `
            <div class="poker-ref-row">
              <div class="poker-ref-top">
                <span class="poker-ref-rank">${h.rank}</span>
                <span class="poker-ref-name">${h.name}</span>
              </div>
              <div class="poker-ref-desc">${h.desc}</div>
              <div class="poker-ref-cards">
                ${h.cards.map(c => renderMiniCard(c.v, c.s, !!c.r)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ─── SOCKET LISTENERS ───
  socket.on('poker-state', (data) => render(data));
  socket.on('poker-update', (data) => render(data));

  window.pokerGame = { render };
})();
