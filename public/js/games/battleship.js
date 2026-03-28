// ─── BATTLESHIP CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const SHIPS = [
    { name: 'Carrier', size: 5, symbol: 'A', icon: '🚢' },
    { name: 'Battleship', size: 4, symbol: 'B', icon: '⛴️' },
    { name: 'Cruiser', size: 3, symbol: 'C', icon: '🛥️' },
    { name: 'Submarine', size: 3, symbol: 'S', icon: '🔱' },
    { name: 'Destroyer', size: 2, symbol: 'D', icon: '🚤' }
  ];

  let currentData = null;
  let placingShips = [];
  let currentShipIndex = 0;
  let currentDirection = 'h';
  let hoverCells = [];

  // Build a local board showing placed ships during placement phase
  function getPlacingBoard(size) {
    const board = Array.from({ length: size }, () => Array(size).fill(null));
    placingShips.forEach((p, i) => {
      const ship = SHIPS[i];
      for (let j = 0; j < ship.size; j++) {
        const r = p.direction === 'v' ? p.row + j : p.row;
        const c = p.direction === 'h' ? p.col + j : p.col;
        if (r < size && c < size) board[r][c] = ship.symbol;
      }
    });
    return board;
  }

  function render(data) {
    currentData = data;
    if (data.phase === 'placing') renderPlacing(data);
    else if (data.phase === 'playing') renderPlaying(data);
    else if (data.phase === 'finished') renderFinished(data);
  }

  function renderPlacing(data) {
    if (data.shipsPlaced) {
      gameView.innerHTML = `<div class="bs-game fade-in">
        <div class="bs-waiting">
          <div class="spinner" style="margin-bottom:16px"></div>
          <h2>Ships Deployed!</h2>
          <p style="color:var(--text-dim)">Waiting for ${data.opponentName} to place their ships...</p>
        </div>
      </div>`;
      return;
    }

    const ship = currentShipIndex < SHIPS.length ? SHIPS[currentShipIndex] : null;
    let html = `<div class="bs-game fade-in">
      <h2 class="bs-title">🚢 Deploy Your Fleet</h2>`;

    if (ship) {
      html += `<div class="bs-place-info">
        <span class="bs-ship-name">${ship.icon} ${ship.name} (${ship.size} cells)</span>
      </div>`;
    } else {
      html += `<div class="bs-place-info"><span class="bs-ship-name">✅ All ships placed! Deploying...</span></div>`;
    }

    html += `<div class="game-layout">`;
    html += `<div class="game-main">`;
    html += `<div class="bs-ship-progress">`;
    SHIPS.forEach((s, i) => {
      const placed = i < currentShipIndex;
      const active = i === currentShipIndex;
      html += `<span class="bs-ship-pip ${placed ? 'placed' : ''} ${active ? 'active' : ''}">${s.icon}</span>`;
    });
    html += `</div>`;
    html += renderGrid(getPlacingBoard(data.gridSize || 10), 'bs-place-grid', true, data.gridSize);
    html += `</div>`;

    html += `<div class="game-side-panel">`;
    if (ship) {
      html += `<button class="btn btn-sm" onclick="window._bsRotate()">🔄 ${currentDirection === 'h' ? 'HORIZ' : 'VERT'}</button>`;
      html += `<button class="btn btn-sm" onclick="window._bsAutoPlace()">🎲 Auto Place</button>`;
      if (currentShipIndex > 0) html += `<button class="btn btn-sm btn-danger" onclick="window._bsUndoShip()">↩️ Undo</button>`;
    }
    html += `<button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('battleship')">📖 Rules</button>`;
    html += `</div>`;
    html += `</div>`; // end game-layout
    html += `</div>`;

    gameView.innerHTML = html;
    attachPlacingHandlers(data.gridSize);
  }

  function renderPlaying(data) {
    const turnText = data.isMyTurn ? '🎯 Your Turn — Fire!' : `⏳ ${data.opponentName}'s Turn`;

    let html = `<div class="bs-game fade-in">
      <div class="bs-status ${data.isMyTurn ? 'bs-my-turn' : ''}">${turnText}</div>`;

    // Last shot notification
    if (data.lastShot) {
      const isMyShot = data.lastShot.playerId === socket.id;
      const shotLabel = isMyShot ? 'Your shot' : `${data.opponentName}'s shot`;
      const hitMsg = data.lastShot.hit
        ? (data.lastShot.sunk ? `💥 ${shotLabel}: HIT & SUNK ${data.lastShot.sunk}!` : `💥 ${shotLabel}: HIT!`)
        : `🌊 ${shotLabel}: Miss`;
      if (typeof SFX !== 'undefined') {
        if (data.lastShot.hit) SFX.correct();
        else SFX.wrong();
      }
      html += `<div class="bs-last-shot ${data.lastShot.hit ? 'bs-hit' : 'bs-miss'}">${hitMsg}</div>`;
    }

    html += `<div class="game-layout">`;
    html += `<div class="game-main">`;
    html += `<div class="bs-boards">`;
    // Opponent's board (where we fire)
    html += `<div class="bs-board-section">
      <h3 class="bs-board-label">🎯 ${data.opponentName}'s Waters</h3>
      ${renderGrid(data.opponentBoard, 'bs-attack-grid', false, data.gridSize, true)}
      <div class="bs-fleet-status">`;
    (data.opponentShips || []).forEach(s => {
      html += `<span class="bs-ship-status ${s.sunk ? 'bs-sunk' : ''}">${s.sunk ? '💀' : '🚢'} ${s.name}</span>`;
    });
    html += `</div></div>`;

    // My board
    html += `<div class="bs-board-section">
      <h3 class="bs-board-label">🛡️ Your Fleet</h3>
      ${renderGrid(data.myBoard, 'bs-my-grid', false, data.gridSize)}
      <div class="bs-fleet-status">`;
    (data.myShips || []).forEach(s => {
      html += `<span class="bs-ship-status ${s.sunk ? 'bs-sunk' : ''}">${s.sunk ? '💀' : '🚢'} ${s.name}</span>`;
    });
    html += `</div></div>`;

    html += `</div>`; // end bs-boards
    html += `</div>`; // end game-main

    html += `<div class="game-side-panel">`;
    if (isHost) html += `<button class="btn btn-sm btn-danger" onclick="socket.emit('end-game-early')">End Game</button>`;
    html += `<button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('battleship')">📖 Rules</button>`;
    html += `</div>`;
    html += `</div>`; // end game-layout
    html += `</div>`;

    gameView.innerHTML = html;

    // Attach fire handlers
    if (data.isMyTurn) {
      document.querySelectorAll('.bs-attack-grid .bs-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const r = parseInt(cell.dataset.r);
          const c = parseInt(cell.dataset.c);
          if (data.opponentBoard[r][c] !== null) return; // already shot
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('battleship-fire', { row: r, col: c });
        });
      });
    }
  }

  function renderFinished(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    renderPlaying(data);
    const resultText = data.winner === socket.id ? '🎉 Victory! You sank the enemy fleet!' : '💀 Defeat! Your fleet was destroyed!';
    const isHostPlayer = sessionStorage.getItem('isHost') === 'true';
    const overlay = document.createElement('div');
    overlay.className = 'bs-result-overlay bs-result-animate';
    overlay.innerHTML = `<div class="bs-result-box"><h2>${resultText}</h2>${isHostPlayer ? '<button class="btn btn-sm btn-primary" id="bs-lobby-btn" style="margin-top:16px">🏠 Back to Lobby</button>' : '<p style="color:var(--text-dim);margin-top:12px">Waiting for host...</p>'}</div>`;
    const gameEl = document.querySelector('.bs-game');
    if (gameEl) gameEl.appendChild(overlay);
    document.getElementById('bs-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  function renderGrid(grid, cls, isPlacing, size, isAttack) {
    size = size || 10;
    const SHIP_ICONS = { A: '🚢', B: '⛴️', C: '🛥️', S: '🔱', D: '🚤' };
    let html = `<div class="${cls}" style="grid-template-columns:28px repeat(${size},1fr)">`;
    // Header row
    html += `<div class="bs-cell bs-header"></div>`;
    for (let c = 0; c < size; c++) {
      html += `<div class="bs-cell bs-header">${String.fromCharCode(65 + c)}</div>`;
    }
    for (let r = 0; r < size; r++) {
      html += `<div class="bs-cell bs-row-label">${r + 1}</div>`;
      for (let c = 0; c < size; c++) {
        const val = grid[r][c];
        let cellCls = 'bs-cell';
        let content = '';
        if (val === 'X') { cellCls += ' bs-hit bs-hit-anim'; content = '💥'; }
        else if (val === 'O') { cellCls += ' bs-miss bs-miss-anim'; content = '•'; }
        else if (val && !isAttack) {
          cellCls += ' bs-ship';
          // Show ship icon for placed ships
          if (isPlacing) {
            const icon = SHIP_ICONS[val] || '🚢';
            content = `<span class="bs-ship-icon">${icon}</span>`;
          }
        }
        else if (isAttack && val === null) { cellCls += ' bs-water'; }
        html += `<div class="${cellCls}" data-r="${r}" data-c="${c}">${content}</div>`;
      }
    }
    html += `</div>`;
    return html;
  }

  function attachPlacingHandlers(size) {
    document.querySelectorAll('.bs-place-grid .bs-cell:not(.bs-header):not(.bs-row-label)').forEach(cell => {
      cell.addEventListener('click', () => {
        const r = parseInt(cell.dataset.r);
        const c = parseInt(cell.dataset.c);
        if (isNaN(r) || isNaN(c)) return;
        tryPlaceShip(r, c);
      });
      cell.addEventListener('mouseenter', () => {
        const r = parseInt(cell.dataset.r);
        const c = parseInt(cell.dataset.c);
        if (isNaN(r) || isNaN(c)) return;
        showShipPreview(r, c, size);
      });
      cell.addEventListener('mouseleave', clearPreview);
    });
  }

  function showShipPreview(row, col, size) {
    clearPreview();
    if (currentShipIndex >= SHIPS.length) return;
    const ship = SHIPS[currentShipIndex];
    const localBoard = getPlacingBoard(size);
    const cells = [];
    let valid = true;
    for (let j = 0; j < ship.size; j++) {
      const r = currentDirection === 'v' ? row + j : row;
      const c = currentDirection === 'h' ? col + j : col;
      if (r >= size || c >= size) { valid = false; break; }
      cells.push({ r, c });
    }
    // Check overlap with placed ships using localBoard
    if (valid) {
      for (const cell of cells) {
        if (localBoard[cell.r][cell.c] !== null) { valid = false; break; }
      }
    }
    cells.forEach(cell => {
      const el = document.querySelector(`.bs-place-grid .bs-cell[data-r="${cell.r}"][data-c="${cell.c}"]`);
      if (el) el.classList.add(valid ? 'bs-preview-valid' : 'bs-preview-invalid');
    });
    hoverCells = cells;
  }

  function clearPreview() {
    hoverCells.forEach(cell => {
      const el = document.querySelector(`.bs-place-grid .bs-cell[data-r="${cell.r}"][data-c="${cell.c}"]`);
      if (el) { el.classList.remove('bs-preview-valid', 'bs-preview-invalid'); }
    });
    hoverCells = [];
  }

  function tryPlaceShip(row, col) {
    if (currentShipIndex >= SHIPS.length) return;
    const ship = SHIPS[currentShipIndex];
    const size = currentData.gridSize || 10;
    const localBoard = getPlacingBoard(size);

    // Validate bounds and overlap using localBoard
    for (let j = 0; j < ship.size; j++) {
      const r = currentDirection === 'v' ? row + j : row;
      const c = currentDirection === 'h' ? col + j : col;
      if (r >= size || c >= size) return;
      if (localBoard[r][c] !== null) return; // overlap with existing ship
    }

    if (typeof SFX !== 'undefined') SFX.click();
    placingShips.push({ row, col, direction: currentDirection });
    currentShipIndex++;

    if (currentShipIndex >= SHIPS.length) {
      // Show the last placed ship on the board briefly before submitting
      render(currentData);
      setTimeout(() => {
        socket.emit('battleship-place', { placements: placingShips });
      }, 600);
      return;
    }
    render(currentData);
  }

  window._bsRotate = function () {
    currentDirection = currentDirection === 'h' ? 'v' : 'h';
    if (currentData) render(currentData);
  };

  window._bsUndoShip = function () {
    if (currentShipIndex > 0) {
      placingShips.pop();
      currentShipIndex--;
      if (currentData) render(currentData);
    }
  };

  window._bsAutoPlace = function () {
    socket.emit('battleship-auto-place');
  };

  socket.on('battleship-state', render);
  socket.on('battleship-update', render);
})();
