// ─── TIC TAC TOE — CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  function render(data) {
    const myMark = data.myMark;
    const turnName = data.turn === data.player1 ? data.player1Name : data.player2Name;
    const isFinished = data.phase === 'finished';

    let statusText;
    if (isFinished) {
      if (data.winner === 'draw') statusText = "It's a draw!";
      else statusText = (data.winner === data.player1 ? data.player1Name : data.player2Name) + ' wins!';
    } else {
      statusText = data.isMyTurn ? 'Your turn!' : `${turnName}'s turn`;
    }

    const winSet = new Set();
    if (data.winCells) data.winCells.forEach(c => winSet.add(c.r + ',' + c.c));

    let boardHtml = '<div class="ttt-board">';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = data.board[r][c];
        const isWin = winSet.has(r + ',' + c);
        const isLast = data.lastMove && data.lastMove.row === r && data.lastMove.col === c;
        const canClick = !isFinished && data.isMyTurn && cell === null;
        let display = '';
        if (cell === 'X') display = '❌';
        else if (cell === 'O') display = '⭕';

        boardHtml += `<div class="ttt-cell ${isWin ? 'ttt-win' : ''} ${isLast ? 'ttt-last' : ''} ${canClick ? 'ttt-clickable' : ''}" data-row="${r}" data-col="${c}">${display}</div>`;
      }
    }
    boardHtml += '</div>';

    gameView.innerHTML = `
      <div class="ttt-game fade-in">
        <div class="ttt-header">
          <div class="ttt-player ${data.turn === data.player1 && !isFinished ? 'ttt-active' : ''} ${data.winner === data.player1 ? 'ttt-winner' : ''}">
            <span class="ttt-mark">❌</span>
            <span class="ttt-pname">${escapeHtml(data.player1Name)}</span>
          </div>
          <div class="ttt-status">${statusText}</div>
          <div class="ttt-player ${data.turn === data.player2 && !isFinished ? 'ttt-active' : ''} ${data.winner === data.player2 ? 'ttt-winner' : ''}">
            <span class="ttt-mark">⭕</span>
            <span class="ttt-pname">${escapeHtml(data.player2Name)}</span>
          </div>
        </div>
        ${boardHtml}
        ${isFinished && isHost ? `
          <div style="margin-top:18px;display:flex;gap:12px;justify-content:center">
            <button class="btn btn-sm btn-primary" id="ttt-rematch">🔄 Rematch</button>
            <button class="btn btn-sm" id="ttt-lobby">🏠 Back to Lobby</button>
          </div>
        ` : (isFinished ? '<p style="color:var(--text-dim);text-align:center;margin-top:14px">Waiting for host...</p>' : '')}
      </div>
    `;

    // Cell click handlers
    if (!isFinished && data.isMyTurn) {
      document.querySelectorAll('.ttt-clickable').forEach(cell => {
        cell.addEventListener('click', () => {
          const row = parseInt(cell.dataset.row);
          const col = parseInt(cell.dataset.col);
          socket.emit('tictactoe-move', { row, col });
        });
      });
    }

    document.getElementById('ttt-rematch')?.addEventListener('click', () => socket.emit('rematch'));
    document.getElementById('ttt-lobby')?.addEventListener('click', () => socket.emit('back-to-lobby'));
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
  }

  socket.on('tictactoe-state', render);
  socket.on('tictactoe-update', handleUpdate);
  socket.on('game-over', handleGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
