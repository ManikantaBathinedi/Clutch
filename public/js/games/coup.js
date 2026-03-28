// ─── COUP CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const ROLE_INFO = {
    Duke: { icon: '👑', color: '#9C27B0', ability: 'Tax: Take 3 coins. Blocks Foreign Aid.' },
    Assassin: { icon: '🗡️', color: '#F44336', ability: 'Assassinate: Pay 3, target loses influence.' },
    Captain: { icon: '⚓', color: '#2196F3', ability: 'Steal: Take 2 coins from target. Blocks stealing.' },
    Ambassador: { icon: '🤝', color: '#4CAF50', ability: 'Exchange: Swap cards with deck. Blocks stealing.' },
    Contessa: { icon: '👸', color: '#FF9800', ability: 'Blocks assassination.' }
  };

  let currentData = null;
  let selectedTarget = null;

  function render(data) {
    currentData = data;
    if (data.phase === 'finished') { renderFinished(data); return; }
    renderGame(data);
  }

  function renderGame(data) {
    let html = `<div class="coup-game fade-in">`;

    // Title and phase indicator
    html += `<div class="coup-header">
      <h2 class="coup-title">⚔️ Coup</h2>
      <span class="coup-phase-badge">${phaseLabel(data.phase)}</span>
    </div>`;

    html += `<div class="game-layout">`;
    html += `<div class="game-main">`;

    // Players circle
    html += `<div class="coup-players">`;
    data.players.forEach((p, pi) => {
      const isMe = p.id === socket.id;
      const deadClass = !p.alive ? 'coup-dead' : '';
      const activeClass = p.isCurrentTurn ? 'coup-active' : '';
      html += `<div class="coup-player ${deadClass} ${activeClass} ${isMe ? 'coup-me' : ''} coup-player-enter" style="animation-delay:${pi * 0.08}s" data-pid="${p.id}">
        <div class="coup-player-top">
          <span class="coup-avatar">${p.avatar}</span>
          <span class="coup-name">${isMe ? 'You' : p.name}</span>
        </div>
        <div class="coup-coins">💰 ${p.coins}</div>
        <div class="coup-influence">
          ${p.alive ? '🂠'.repeat(p.cardCount) : ''}
          ${p.revealedCards.map(c => `<span class="coup-revealed">${ROLE_INFO[c]?.icon || '❌'} ${c}</span>`).join('')}
        </div>
      </div>`;
    });
    html += `</div>`;

    // My cards (visible only to me)
    if (data.myCards) {
      html += `<div class="coup-my-cards"><h3>Your Influence</h3><div class="coup-cards-row">`;
      data.myCards.forEach((card, i) => {
        const revealed = data.myRevealed[i];
        const info = ROLE_INFO[card] || {};
        html += `<div class="coup-card ${revealed ? 'coup-card-dead' : ''} coup-card-animate" style="border-color:${info.color || '#666'};animation-delay:${i * 0.15}s" ${data.mustLoseCard && !revealed ? `data-lose-idx="${i}"` : ''}>
          <span class="coup-card-icon">${revealed ? '💀' : (info.icon || '?')}</span>
          <span class="coup-card-role">${card}</span>
          ${!revealed ? `<span class="coup-card-ability">${info.ability || ''}</span>` : ''}
        </div>`;
      });
      html += `</div></div>`;
    }

    // Action area based on phase
    html += renderActionArea(data);

    html += `</div>`; // close game-main

    // Side panel: action log + controls
    html += `<div class="game-side-panel">`;
    html += `<div class="coup-log" style="max-height:220px;overflow-y:auto;font-size:0.78rem;">`;
    (data.actionLog || []).forEach(log => {
      html += `<div class="coup-log-entry"><strong>${log.player || ''}</strong> ${log.action} ${log.detail || ''}</div>`;
    });
    html += `</div>`;
    if (isHost) {
      html += `<button class="btn btn-sm btn-danger" onclick="socket.emit('end-game-early')">End Game</button>`;
    }
    html += `<button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('coup')">📖 Rules</button>`;
    html += `</div>`; // close game-side-panel
    html += `</div>`; // close game-layout

    html += `</div>`;
    gameView.innerHTML = html;
    attachHandlers(data);
  }

  function phaseLabel(phase) {
    const labels = {
      action: '🎯 Action Phase',
      challenge: '❓ Challenge?',
      counteraction: '🛡️ Block?',
      'counter-challenge': '❓ Challenge Block?',
      'losing-card': '💀 Lose Influence',
      exchange: '🔄 Exchange Cards',
      finished: '🏁 Game Over'
    };
    return labels[phase] || phase;
  }

  function renderActionArea(data) {
    let html = `<div class="coup-action-area">`;

    if (data.isMyTurn && data.phase === 'action') {
      const myCoins = data.myCoins;
      const mustCoup = myCoins >= 10;
      const targets = data.players.filter(p => p.id !== socket.id && p.alive);

      if (mustCoup) {
        html += `<div class="coup-must-coup">⚠️ 10+ coins — You must Coup!</div>`;
      }

      html += `<div class="coup-actions-grid">`;
      if (!mustCoup) {
        html += actionBtn('income', '💰 Income', '+1 coin', true);
        html += actionBtn('foreign-aid', '💰 Foreign Aid', '+2 coins', true);
        html += actionBtn('tax', '👑 Tax (Duke)', '+3 coins', true);
        html += actionBtn('exchange', '🤝 Exchange (Ambassador)', 'Swap cards', true);
        html += actionBtn('assassinate', '🗡️ Assassinate', 'Pay 3, kill 1', myCoins >= 3);
        html += actionBtn('steal', '⚓ Steal (Captain)', 'Take 2 from target', targets.length > 0);
      }
      html += actionBtn('coup', '⚔️ Coup', 'Pay 7, kill 1', myCoins >= 7);
      html += `</div>`;

      // Target selection for targeted actions
      if (selectedTarget === null && targets.length > 0) {
        html += `<div class="coup-target-hint" id="coup-target-hint" style="display:none">Select a target player above</div>`;
      }
    }

    // Challenge response
    if (data.canChallenge) {
      const action = data.pendingAction;
      const actorName = (data.players.find(p => p.id === action.actor) || {}).name;
      html += `<div class="coup-response">
        <p>${actorName} claims <strong>${action.claimedRole}</strong> for ${action.type}</p>
        <button class="btn btn-sm btn-danger coup-btn" id="coup-challenge-yes">❓ Challenge!</button>
        <button class="btn btn-sm coup-btn" id="coup-challenge-pass">✓ Allow</button>
      </div>`;
    }

    // Counter response
    if (data.canCounter) {
      const action = data.pendingAction;
      const actorName = (data.players.find(p => p.id === action.actor) || {}).name;
      let blockOptions = '';
      if (action.type === 'foreign-aid') {
        blockOptions = `<button class="btn btn-sm btn-danger coup-btn" data-counter="Duke">👑 Block (Duke)</button>`;
      } else if (action.type === 'assassinate') {
        blockOptions = `<button class="btn btn-sm btn-danger coup-btn" data-counter="Contessa">👸 Block (Contessa)</button>`;
      } else if (action.type === 'steal') {
        blockOptions = `<button class="btn btn-sm btn-danger coup-btn" data-counter="Captain">⚓ Block (Captain)</button>
          <button class="btn btn-sm btn-danger coup-btn" data-counter="Ambassador">🤝 Block (Ambassador)</button>`;
      }
      html += `<div class="coup-response">
        <p>${actorName} is using ${action.type}</p>
        ${blockOptions}
        <button class="btn btn-sm coup-btn" id="coup-counter-pass">✓ Allow</button>
      </div>`;
    }

    // Counter-challenge response
    if (data.canCounterChallenge) {
      const counter = data.pendingCounter;
      const blockerName = (data.players.find(p => p.id === counter.blocker) || {}).name;
      html += `<div class="coup-response">
        <p>${blockerName} claims <strong>${counter.claimedRole}</strong> to block</p>
        <button class="btn btn-sm btn-danger coup-btn" id="coup-counter-challenge-yes">❓ Challenge Block!</button>
        <button class="btn btn-sm coup-btn" id="coup-counter-challenge-pass">✓ Accept Block</button>
      </div>`;
    }

    // Must lose card
    if (data.mustLoseCard) {
      html += `<div class="coup-response">
        <p>💀 You must lose a card! Click one of your cards above.</p>
      </div>`;
    }

    // Exchange
    if (data.exchangeOptions) {
      html += `<div class="coup-exchange">
        <p>Choose ${data.exchangeCount} card(s) to keep:</p>
        <div class="coup-exchange-cards">`;
      data.exchangeOptions.forEach((card, i) => {
        const info = ROLE_INFO[card] || {};
        html += `<button class="coup-exchange-btn" data-card="${card}" data-idx="${i}" style="border-color:${info.color}">
          ${info.icon || '?'} ${card}
        </button>`;
      });
      html += `</div>
        <button class="btn btn-sm btn-primary coup-btn" id="coup-confirm-exchange" disabled>Confirm</button>
      </div>`;
    }

    html += `</div>`;
    return html;
  }

  function actionBtn(action, label, desc, enabled) {
    return `<button class="coup-action-btn ${enabled ? '' : 'disabled'}" data-action="${action}" ${enabled ? '' : 'disabled'}>
      <span class="coup-action-label">${label}</span>
      <span class="coup-action-desc">${desc}</span>
    </button>`;
  }

  let exchangeSelected = new Set();

  function attachHandlers(data) {
    // Action buttons
    document.querySelectorAll('.coup-action-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.click();
        const action = btn.dataset.action;
        const needsTarget = ['coup', 'assassinate', 'steal'].includes(action);
        if (needsTarget) {
          promptTarget(action);
        } else {
          socket.emit('coup-action', { action });
        }
      });
    });

    // Challenge
    const challengeYes = document.getElementById('coup-challenge-yes');
    if (challengeYes) challengeYes.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('coup-challenge', { challenge: true }); });
    const challengePass = document.getElementById('coup-challenge-pass');
    if (challengePass) challengePass.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('coup-challenge', { challenge: false }); });

    // Counter
    document.querySelectorAll('[data-counter]').forEach(btn => {
      btn.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('coup-counter', { counter: true, claimedRole: btn.dataset.counter }); });
    });
    const counterPass = document.getElementById('coup-counter-pass');
    if (counterPass) counterPass.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('coup-counter', { counter: false }); });

    // Counter-challenge
    const ccYes = document.getElementById('coup-counter-challenge-yes');
    if (ccYes) ccYes.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('coup-counter-challenge', { challenge: true }); });
    const ccPass = document.getElementById('coup-counter-challenge-pass');
    if (ccPass) ccPass.addEventListener('click', () => { if (typeof SFX !== 'undefined') SFX.click(); socket.emit('coup-counter-challenge', { challenge: false }); });

    // Lose card
    document.querySelectorAll('[data-lose-idx]').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        if (typeof SFX !== 'undefined') SFX.cardPlay();
        socket.emit('coup-lose-card', { cardIndex: parseInt(card.dataset.loseIdx) });
      });
    });

    // Exchange
    exchangeSelected = new Set();
    document.querySelectorAll('.coup-exchange-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.idx;
        if (exchangeSelected.has(key)) exchangeSelected.delete(key);
        else if (exchangeSelected.size < data.exchangeCount) exchangeSelected.add(key);
        document.querySelectorAll('.coup-exchange-btn').forEach(b => b.classList.remove('selected'));
        exchangeSelected.forEach(k => {
          document.querySelector(`.coup-exchange-btn[data-idx="${k}"]`)?.classList.add('selected');
        });
        const confirmBtn = document.getElementById('coup-confirm-exchange');
        if (confirmBtn) confirmBtn.disabled = exchangeSelected.size !== data.exchangeCount;
      });
    });
    const confirmEx = document.getElementById('coup-confirm-exchange');
    if (confirmEx) {
      confirmEx.addEventListener('click', () => {
        const kept = [...exchangeSelected].map(idx => data.exchangeOptions[parseInt(idx)]);
        socket.emit('coup-exchange', { keptCards: kept });
      });
    }
  }

  function promptTarget(action) {
    const targets = currentData.players.filter(p => p.id !== socket.id && p.alive);
    // Highlight target players
    document.querySelectorAll('.coup-player').forEach(el => {
      const pid = el.dataset.pid;
      if (targets.some(t => t.id === pid)) {
        el.classList.add('coup-target-selectable');
        el.addEventListener('click', function handler() {
          socket.emit('coup-action', { action, targetId: pid });
          el.removeEventListener('click', handler);
          document.querySelectorAll('.coup-player').forEach(e => e.classList.remove('coup-target-selectable'));
        });
      }
    });
    const hint = document.getElementById('coup-target-hint');
    if (hint) hint.style.display = 'block';
  }

  function renderFinished(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    renderGame(data);
    const winnerName = (data.players.find(p => p.id === data.winner) || {}).name || 'Someone';
    const isWinner = data.winner === socket.id;
    const isHostPlayer = sessionStorage.getItem('isHost') === 'true';
    const overlay = document.createElement('div');
    overlay.className = 'coup-result-overlay coup-result-animate';
    overlay.innerHTML = `<div class="coup-result-box">
      <h2>${isWinner ? '🎉 You survived! Victory!' : `⚔️ ${winnerName} wins!`}</h2>
      ${isHostPlayer ? '<button class="btn btn-sm btn-primary" id="coup-lobby-btn" style="margin-top:16px">🏠 Back to Lobby</button>' : '<p style="color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}
    </div>`;
    const el = document.querySelector('.coup-game');
    if (el) el.appendChild(overlay);
    document.getElementById('coup-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  socket.on('coup-state', render);
  socket.on('coup-update', render);
})();
