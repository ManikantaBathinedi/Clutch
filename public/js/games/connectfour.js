// ─── CONNECT FOUR — CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  function render(data) {
    const myColor = data.myColor;
    const myDisc = myColor === 'R' ? '🔴' : '🟡';
    const oppDisc = myColor === 'R' ? '🟡' : '🔴';
    const turnName = data.turn === data.player1 ? data.player1Name : data.player2Name;
    const isFinished = data.phase === 'finished';

    let statusText;
    if (isFinished) {
      if (data.winner === 'draw') statusText = "It's a draw!";
      else statusText = (data.winner === data.player1 ? data.player1Name : data.player2Name) + ' wins!';
    } else {
      statusText = data.isMyTurn ? 'Your turn!' : `${turnName}'s turn`;
    }

    // Build win cells set for highlighting
    const winSet = new Set();
    if (data.winCells) data.winCells.forEach(c => winSet.add(c.r + ',' + c.c));

    let boardHtml = '<div class="cf-board">';
    // Column drop buttons
    boardHtml += '<div class="cf-drop-row">';
    for (let c = 0; c < 7; c++) {
      const canDrop = !isFinished && data.isMyTurn && data.board[0][c] === null;
      boardHtml += `<button class="cf-drop-btn ${canDrop ? '' : 'cf-drop-disabled'}" data-col="${c}" ${canDrop ? '' : 'disabled'}>${myDisc}</button>`;
    }
    boardHtml += '</div>';

    // Grid
    for (let r = 0; r < 6; r++) {
      boardHtml += '<div class="cf-row">';
      for (let c = 0; c < 7; c++) {
        const cell = data.board[r][c];
        const isWin = winSet.has(r + ',' + c);
        const isLast = data.lastMove && data.lastMove.row === r && data.lastMove.col === c;
        let disc = '';
        if (cell === 'R') disc = '🔴';
        else if (cell === 'Y') disc = '🟡';

        boardHtml += `<div class="cf-cell ${isWin ? 'cf-win' : ''} ${isLast ? 'cf-last' : ''}">${disc}</div>`;
      }
      boardHtml += '</div>';
    }
    boardHtml += '</div>';

    gameView.innerHTML = `
      <div class="cf-game fade-in">
        <div class="cf-header">
          <div class="cf-player ${data.turn === data.player1 && !isFinished ? 'cf-active' : ''} ${data.winner === data.player1 ? 'cf-winner' : ''}">
            <span class="cf-disc">🔴</span>
            <span class="cf-pname">${escapeHtml(data.player1Name)}</span>
          </div>
          <div class="cf-status">${statusText}</div>
          <div class="cf-player ${data.turn === data.player2 && !isFinished ? 'cf-active' : ''} ${data.winner === data.player2 ? 'cf-winner' : ''}">
            <span class="cf-disc">🟡</span>
            <span class="cf-pname">${escapeHtml(data.player2Name)}</span>
          </div>
        </div>
        ${boardHtml}
        ${isFinished && isHost ? `
          <div style="margin-top:18px;display:flex;gap:12px;justify-content:center">
            <button class="btn btn-sm btn-primary" id="cf-rematch">🔄 Rematch</button>
            <button class="btn btn-sm" id="cf-lobby">🏠 Back to Lobby</button>
          </div>
        ` : (isFinished ? '<p style="color:var(--text-dim);text-align:center;margin-top:14px">Waiting for host...</p>' : '')}
      </div>
    `;

    // Drop button handlers
    if (!isFinished && data.isMyTurn) {
      document.querySelectorAll('.cf-drop-btn:not(.cf-drop-disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
          const col = parseInt(btn.dataset.col);
          socket.emit('connectfour-move', { col });
        });
      });
    }

    // Cell click on top row as fallback
    document.querySelectorAll('.cf-row').forEach((rowEl, rIdx) => {
      if (rIdx > 0) return; // only allow clicking top visible row cells
    });

    document.getElementById('cf-rematch')?.addEventListener('click', () => socket.emit('rematch'));
    document.getElementById('cf-lobby')?.addEventListener('click', () => socket.emit('back-to-lobby'));
  }

  function handleUpdate(data) {
    if (typeof SFX !== 'undefined') {
      if (data.phase === 'finished') SFX.gameOver();
      else SFX.tick();
    }
    render(data);
  }

  function handleGameOver(data) {
    if (typeof SFX !== 'undefined') SFX.gameOver();
    // Game-over popup handled by lobby.js
  }

  socket.on('connectfour-state', render);
  socket.on('connectfour-update', handleUpdate);
  socket.on('game-over', handleGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
