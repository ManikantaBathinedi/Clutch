// ─── CHESS CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const PIECE_UNICODE = {
    wK: '♚', wQ: '♛', wR: '♜', wB: '♝', wN: '♞', wP: '♟',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
  };

  let currentData = null;
  let selectedSquare = null;
  let highlightedMoves = [];
  let promotionPending = null;
  let flipped = false;
  let prevMoveCount = 0;
  let aiMode = false;
  let aiThinking = false;

  // ── Sound effects ──
  function playChessSound(type) {
    if (typeof SFX === 'undefined' || SFX.isMuted()) return;
    try {
      if (type === 'move') SFX.chessMove();
      else if (type === 'capture') SFX.chessCapture();
      else if (type === 'check') SFX.chessCheck();
      else if (type === 'castle') SFX.chessCastle();
      else if (type === 'gameOver') SFX.chessGameEnd();
    } catch (e) { /* ignore */ }
  }

  function detectSoundType(data) {
    if (!data.moveHistory || data.moveHistory.length === 0) return null;
    if (data.moveHistory.length <= prevMoveCount) return null;
    const lastNotation = data.moveHistory[data.moveHistory.length - 1];
    if (data.phase === 'checkmate' || data.phase === 'stalemate' || data.phase === 'draw') return 'gameOver';
    if (data.inCheck) return 'check';
    if (lastNotation === 'O-O' || lastNotation === 'O-O-O') return 'castle';
    if (lastNotation && lastNotation.includes('x')) return 'capture';
    return 'move';
  }

  // ── AI Engine (client-side minimax) ──
  const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
  const PST_PAWN = [
    [0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],
    [5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],
    [5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]
  ];
  const PST_KNIGHT = [
    [-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],
    [-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],
    [-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],
    [-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]
  ];
  const PST_BISHOP = [
    [-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
    [-10,0,10,10,10,10,0,-10],[-10,5,5,10,10,5,5,-10],
    [-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],
    [-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]
  ];
  const PST_ROOK = [
    [0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],
    [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]
  ];
  const PST_QUEEN = [
    [-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]
  ];
  const PST_KING_MID = [
    [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],
    [20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]
  ];
  const PST_MAP = { P: PST_PAWN, N: PST_KNIGHT, B: PST_BISHOP, R: PST_ROOK, Q: PST_QUEEN, K: PST_KING_MID };

  function aiDeepCopy(board) { return board.map(row => [...row]); }

  function aiGetRawMoves(board, r, c, castling, enPassant) {
    const piece = board[r][c]; if (!piece) return [];
    const color = piece[0], type = piece[1], moves = [], enemy = color === 'w' ? 'b' : 'w';
    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1;
      if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
        moves.push({ r: r + dir, c });
        if (r === startRow && !board[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c });
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          if (board[nr][nc] && board[nr][nc][0] === enemy) moves.push({ r: nr, c: nc });
          if (enPassant && enPassant.row === nr && enPassant.col === nc) moves.push({ r: nr, c: nc, enPassant: true });
        }
      }
    } else if (type === 'N') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (!board[nr][nc] || board[nr][nc][0] !== color)) moves.push({ r: nr, c: nc });
      }
    } else if (type === 'B' || type === 'R' || type === 'Q') {
      const dirs = type === 'B' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : type === 'R' ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          if (!board[nr][nc]) { moves.push({ r: nr, c: nc }); } else { if (board[nr][nc][0] !== color) moves.push({ r: nr, c: nc }); break; }
          nr += dr; nc += dc;
        }
      }
    } else if (type === 'K') {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (!board[nr][nc] || board[nr][nc][0] !== color)) moves.push({ r: nr, c: nc });
      }
      if (castling) {
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          if (castling[color + 'K'] && !board[row][5] && !board[row][6] && board[row][7] === color + 'R') {
            if (!aiSqAttacked(board, row, 4, enemy) && !aiSqAttacked(board, row, 5, enemy) && !aiSqAttacked(board, row, 6, enemy))
              moves.push({ r: row, c: 6, castle: 'K' });
          }
          if (castling[color + 'Q'] && !board[row][3] && !board[row][2] && !board[row][1] && board[row][0] === color + 'R') {
            if (!aiSqAttacked(board, row, 4, enemy) && !aiSqAttacked(board, row, 3, enemy) && !aiSqAttacked(board, row, 2, enemy))
              moves.push({ r: row, c: 2, castle: 'Q' });
          }
        }
      }
    }
    return moves;
  }

  function aiSqAttacked(board, r, c, byColor) {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      if (board[row][col] && board[row][col][0] === byColor) {
        if (aiGetRawMoves(board, row, col, null, null).some(m => m.r === r && m.c === c)) return true;
      }
    }
    return false;
  }

  function aiFindKing(board, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === color + 'K') return { r, c };
    return null;
  }

  function aiInCheck(board, color) {
    const king = aiFindKing(board, color);
    return king ? aiSqAttacked(board, king.r, king.c, color === 'w' ? 'b' : 'w') : false;
  }

  function aiApplyMove(board, fromR, fromC, move) {
    const piece = board[fromR][fromC];
    board[move.r][move.c] = piece;
    board[fromR][fromC] = null;
    if (move.enPassant) { const dir = piece[0] === 'w' ? 1 : -1; board[move.r + dir][move.c] = null; }
    if (move.castle) { const row = move.r; if (move.castle === 'K') { board[row][5] = board[row][7]; board[row][7] = null; } else { board[row][3] = board[row][0]; board[row][0] = null; } }
    if (piece[1] === 'P' && (move.r === 0 || move.r === 7)) board[move.r][move.c] = piece[0] + 'Q';
  }

  function aiGetAllLegalMoves(board, color, castling, enPassant) {
    const moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c][0] === color) {
        for (const m of aiGetRawMoves(board, r, c, castling, enPassant)) {
          const tb = aiDeepCopy(board);
          aiApplyMove(tb, r, c, m);
          if (!aiInCheck(tb, color)) moves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, castle: m.castle, enPassant: m.enPassant });
        }
      }
    }
    return moves;
  }

  function aiEvalBoard(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c]; if (!p) continue;
      const type = p[1], color = p[0];
      let val = PIECE_VALUES[type] || 0;
      const pst = PST_MAP[type];
      if (pst) { val += color === 'w' ? pst[r][c] : pst[7 - r][c]; }
      score += color === 'w' ? val : -val;
    }
    return score;
  }

  function aiMinimax(board, depth, alpha, beta, isMax, castling, enPassant) {
    const color = isMax ? 'w' : 'b';
    const moves = aiGetAllLegalMoves(board, color, castling, enPassant);
    if (moves.length === 0) return aiInCheck(board, color) ? (isMax ? -99999 : 99999) : 0;
    if (depth === 0) return aiEvalBoard(board);

    if (isMax) {
      let best = -Infinity;
      for (const m of moves) {
        const tb = aiDeepCopy(board);
        aiApplyMove(tb, m.fromR, m.fromC, m);
        const nc = { ...castling };
        if (m.fromR === 7 && m.fromC === 4) { nc.wK = false; nc.wQ = false; }
        if (m.fromR === 0 && m.fromC === 4) { nc.bK = false; nc.bQ = false; }
        const ep = (board[m.fromR][m.fromC] && board[m.fromR][m.fromC][1] === 'P' && Math.abs(m.fromR - m.toR) === 2) ? { row: (m.fromR + m.toR) / 2, col: m.fromC } : null;
        const val = aiMinimax(tb, depth - 1, alpha, beta, false, nc, ep);
        best = Math.max(best, val);
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        const tb = aiDeepCopy(board);
        aiApplyMove(tb, m.fromR, m.fromC, m);
        const nc = { ...castling };
        if (m.fromR === 7 && m.fromC === 4) { nc.wK = false; nc.wQ = false; }
        if (m.fromR === 0 && m.fromC === 4) { nc.bK = false; nc.bQ = false; }
        const ep = (board[m.fromR][m.fromC] && board[m.fromR][m.fromC][1] === 'P' && Math.abs(m.fromR - m.toR) === 2) ? { row: (m.fromR + m.toR) / 2, col: m.fromC } : null;
        const val = aiMinimax(tb, depth - 1, alpha, beta, true, nc, ep);
        best = Math.min(best, val);
        beta = Math.min(beta, val);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function aiFindBestMove(data) {
    const board = data.board;
    const aiColor = data.myColor === 'w' ? 'b' : 'w';
    // Use actual castling state from board position instead of assuming all true
    const castling = { wK: true, wQ: true, bK: true, bQ: true };
    // Check if rooks/kings have moved (heuristic from board state)
    if (board[7][4] !== 'wK') { castling.wK = false; castling.wQ = false; }
    if (board[7][7] !== 'wR') castling.wK = false;
    if (board[7][0] !== 'wR') castling.wQ = false;
    if (board[0][4] !== 'bK') { castling.bK = false; castling.bQ = false; }
    if (board[0][7] !== 'bR') castling.bK = false;
    if (board[0][0] !== 'bR') castling.bQ = false;

    const moves = aiGetAllLegalMoves(board, aiColor, castling, null);
    if (moves.length === 0) return null;

    // Shuffle for variety
    for (let i = moves.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [moves[i], moves[j]] = [moves[j], moves[i]]; }

    const isMax = aiColor === 'w';
    let bestMove = moves[0], bestVal = isMax ? -Infinity : Infinity;
    const depth = moves.length > 30 ? 2 : 3;
    for (const m of moves) {
      const tb = aiDeepCopy(board);
      aiApplyMove(tb, m.fromR, m.fromC, m);
      const nc = { ...castling };
      if (m.fromR === 7 && m.fromC === 4) { nc.wK = false; nc.wQ = false; }
      if (m.fromR === 0 && m.fromC === 4) { nc.bK = false; nc.bQ = false; }
      if (m.fromR === 7 && m.fromC === 7) nc.wK = false;
      if (m.fromR === 7 && m.fromC === 0) nc.wQ = false;
      if (m.fromR === 0 && m.fromC === 7) nc.bK = false;
      if (m.fromR === 0 && m.fromC === 0) nc.bQ = false;
      const ep = (board[m.fromR][m.fromC] && board[m.fromR][m.fromC][1] === 'P' && Math.abs(m.fromR - m.toR) === 2) ? { row: (m.fromR + m.toR) / 2, col: m.fromC } : null;
      const val = aiMinimax(tb, depth - 1, -Infinity, Infinity, !isMax, nc, ep);
      if (isMax ? val > bestVal : val < bestVal) { bestVal = val; bestMove = m; }
    }
    return bestMove;
  }

  function render(data) {
    currentData = data;
    if (!flipped && data.myColor === 'b') flipped = true;

    // Detect AI mode from server
    if (data.aiMode) aiMode = true;

    // Play sound based on last move
    const soundType = detectSoundType(data);
    if (soundType) playChessSound(soundType);
    prevMoveCount = (data.moveHistory || []).length;

    if (data.phase === 'checkmate' || data.phase === 'stalemate' || data.phase === 'draw') {
      renderGameOver(data);
      return;
    }
    renderBoard(data);

    // AI auto-move with robust error handling
    if (aiMode && !data.isMyTurn && !aiThinking && (data.phase === 'playing' || data.phase === 'check')) {
      aiThinking = true;
      // Safety timeout: reset aiThinking after 8 seconds max
      const safetyTimer = setTimeout(() => { aiThinking = false; }, 8000);
      setTimeout(() => {
        try {
          if (!currentData || currentData.isMyTurn || (currentData.phase !== 'playing' && currentData.phase !== 'check')) { aiThinking = false; clearTimeout(safetyTimer); return; }
          const move = aiFindBestMove(currentData);
          if (move) {
            socket.emit('chess-ai-move', { fromR: move.fromR, fromC: move.fromC, toR: move.toR, toC: move.toC });
          } else {
            // Fallback: pick a random legal move if minimax fails
            const aiColor = currentData.myColor === 'w' ? 'b' : 'w';
            const fallbackMoves = aiGetAllLegalMoves(currentData.board, aiColor, { wK: true, wQ: true, bK: true, bQ: true }, null);
            if (fallbackMoves.length > 0) {
              const fm = fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
              socket.emit('chess-ai-move', { fromR: fm.fromR, fromC: fm.fromC, toR: fm.toR, toC: fm.toC });
            }
          }
        } catch (e) {
          console.error('[Chess AI] Error:', e);
          // Fallback: try a random legal move
          try {
            const aiColor = currentData.myColor === 'w' ? 'b' : 'w';
            const fallbackMoves = aiGetAllLegalMoves(currentData.board, aiColor, { wK: true, wQ: true, bK: true, bQ: true }, null);
            if (fallbackMoves.length > 0) {
              const fm = fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
              socket.emit('chess-ai-move', { fromR: fm.fromR, fromC: fm.fromC, toR: fm.toR, toC: fm.toC });
            }
          } catch (e2) { /* give up */ }
        }
        aiThinking = false;
        clearTimeout(safetyTimer);
      }, 600);
    }
  }

  function renderBoard(data) {
    const turnLabel = data.turn === 'w' ? data.whitePlayer.name : data.blackPlayer.name;
    const aiIsThinking = aiMode && !data.isMyTurn && (data.phase === 'playing' || data.phase === 'check');
    const statusText = data.inCheck ? '⚠️ Check!' : (data.isMyTurn ? 'Your turn' : (aiIsThinking ? `${turnLabel} is thinking...` : `${turnLabel}'s turn`));
    const myColorLabel = data.myColor === 'w' ? 'White' : (data.myColor === 'b' ? 'Black' : 'Spectator');

    const topPlayer = flipped ? data.whitePlayer : data.blackPlayer;
    const bottomPlayer = flipped ? data.blackPlayer : data.whitePlayer;
    const topColor = flipped ? 'w' : 'b';
    const bottomColor = flipped ? 'b' : 'w';
    const topCaptured = flipped ? data.capturedByBlack : data.capturedByWhite;
    const bottomCaptured = flipped ? data.capturedByWhite : data.capturedByBlack;
    const gameOver = data.phase === 'checkmate' || data.phase === 'stalemate' || data.phase === 'draw';

    let html = `<div class="chess-game fade-in">`;

    // Status bar
    html += `<div class="chess-status">
      <span class="chess-turn-indicator ${data.isMyTurn ? 'my-turn' : ''}">${statusText}</span>
      <span class="chess-color-badge chess-color-${data.myColor || 'spec'}">${myColorLabel}</span>
      ${aiMode ? '<span class="chess-ai-badge">🤖 vs AI</span>' : ''}
    </div>`;

    // Draw offer banner
    if (data.drawOffer && data.drawOffer.from !== socket.id) {
      html += `<div class="chess-draw-offer">
        <span>🤝 Opponent offers a draw</span>
        <button class="btn btn-sm" onclick="window._chessDrawRespond(true)">Accept</button>
        <button class="btn btn-sm btn-danger" onclick="window._chessDrawRespond(false)">Decline</button>
      </div>`;
    }

    // Main layout: board area + side panel
    html += `<div class="chess-layout">`;

    // Board column
    html += `<div class="chess-board-col">`;
    html += renderPlayerBar(topPlayer, topColor, topCaptured, data.turn === topColor);

    html += `<div class="chess-board-wrap"><div class="chess-board" id="chess-board">`;
    for (let ri = 0; ri < 8; ri++) {
      const r = flipped ? (7 - ri) : ri;
      for (let ci = 0; ci < 8; ci++) {
        const c = flipped ? (7 - ci) : ci;
        const isLight = (r + c) % 2 === 0;
        const piece = data.board[r][c];
        const isSelected = selectedSquare && selectedSquare.r === r && selectedSquare.c === c;
        const isHighlighted = highlightedMoves.some(m => m.toR === r && m.toC === c);
        const isLastFrom = data.lastMove && data.lastMove.fromR === r && data.lastMove.fromC === c;
        const isLastTo = data.lastMove && data.lastMove.toR === r && data.lastMove.toC === c;
        const hasCapture = isHighlighted && piece;

        let cls = 'chess-sq ' + (isLight ? 'chess-sq-light' : 'chess-sq-dark');
        if (isSelected) cls += ' chess-sq-selected';
        if (isLastFrom || isLastTo) cls += ' chess-sq-last-move';

        html += `<div class="${cls}" data-r="${r}" data-c="${c}">`;
        if (isHighlighted) {
          html += `<div class="chess-move-dot ${hasCapture ? 'chess-capture-ring' : ''}"></div>`;
        }
        if (piece) {
          const pieceColor = piece[0] === 'w' ? 'chess-piece-white' : 'chess-piece-black';
          const isKingInCheck = data.inCheck && piece[1] === 'K' && piece[0] === data.turn;
          html += `<span class="chess-piece ${pieceColor} ${(isLastTo && piece) ? 'chess-piece-enter' : ''} ${isKingInCheck ? 'chess-check-glow' : ''}">${PIECE_UNICODE[piece]}</span>`;
        }
        if (ci === 0) html += `<span class="chess-coord-rank">${8 - r}</span>`;
        if (ri === 7) html += `<span class="chess-coord-file">${'abcdefgh'[c]}</span>`;
        html += `</div>`;
      }
    }
    html += `</div></div>`;

    html += renderPlayerBar(bottomPlayer, bottomColor, bottomCaptured, data.turn === bottomColor);
    html += `</div>`; // end board-col

    // Side panel
    html += `<div class="chess-side-panel">`;

    // Move history in side panel
    html += `<div class="chess-side-history"><div class="chess-side-history-title">Moves</div><div class="chess-side-history-list">`;
    const moves = data.moveHistory || [];
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      html += `<div class="chess-move-row"><span class="chess-move-num">${moveNum}.</span><span class="chess-move-w">${moves[i]}</span>`;
      if (moves[i + 1]) html += `<span class="chess-move-b">${moves[i + 1]}</span>`;
      html += `</div>`;
    }
    html += `</div></div>`;

    // Action buttons stacked vertically in side panel
    html += `<div class="chess-side-actions">`;
    html += `<button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('chess')">📖 Rules</button>`;
    if (data.myColor) {
      html += `<button class="btn btn-sm" onclick="window._chessFlip()">🔄 Flip</button>`;
      html += `<button class="btn btn-sm" onclick="window._chessOfferDraw()" ${gameOver ? 'disabled' : ''}>🤝 Draw</button>`;
      html += `<button class="btn btn-sm btn-danger" onclick="window._chessResign()" ${gameOver ? 'disabled' : ''}>🏳️ Resign</button>`;
    }
    if (isHost) {
      html += `<button class="btn btn-sm btn-danger" onclick="socket.emit('end-game-early')">End Game</button>`;
    }
    html += `</div>`;

    html += `</div>`; // end side-panel
    html += `</div>`; // end chess-layout
    html += `</div>`; // end chess-game

    gameView.innerHTML = html;

    // Auto-scroll move history
    const histList = document.querySelector('.chess-side-history-list');
    if (histList) histList.scrollTop = histList.scrollHeight;

    document.querySelectorAll('.chess-sq').forEach(sq => {
      sq.addEventListener('click', () => {
        handleSquareClick(parseInt(sq.dataset.r), parseInt(sq.dataset.c));
      });
    });
  }

  function renderPlayerBar(player, color, captured, isActive) {
    const capturedHtml = captured.map(p => `<span class="chess-captured-piece">${PIECE_UNICODE[p]}</span>`).join('');
    return `<div class="chess-player-bar ${isActive ? 'chess-player-active' : ''}">
      <div class="chess-player-color" style="background:${color === 'w' ? '#f0f0f0' : '#333'};color:${color === 'w' ? '#333' : '#f0f0f0'}">
        ${color === 'w' ? '♔' : '♚'}
      </div>
      <div class="chess-player-info">
        <span class="chess-player-name">${player.name}</span>
        <div class="chess-captured">${capturedHtml}</div>
      </div>
      ${isActive ? '<div class="chess-active-dot"></div>' : ''}
    </div>`;
  }

  function handleSquareClick(r, c) {
    if (!currentData || !currentData.isMyTurn) return;
    if (aiMode && aiThinking) return;

    const piece = currentData.board[r][c];

    if (selectedSquare) {
      const move = highlightedMoves.find(m => m.toR === r && m.toC === c);
      if (move) {
        const srcPiece = currentData.board[selectedSquare.r][selectedSquare.c];
        if (srcPiece && srcPiece[1] === 'P' && (r === 0 || r === 7)) {
          showPromotionDialog(selectedSquare.r, selectedSquare.c, r, c);
          return;
        }
        socket.emit('chess-move', { fromR: selectedSquare.r, fromC: selectedSquare.c, toR: r, toC: c });
        selectedSquare = null;
        highlightedMoves = [];
        return;
      }
      if (piece && piece[0] === currentData.myColor) { selectPiece(r, c); return; }
      selectedSquare = null;
      highlightedMoves = [];
      renderBoard(currentData);
      return;
    }

    if (piece && piece[0] === currentData.myColor) selectPiece(r, c);
  }

  function selectPiece(r, c) {
    selectedSquare = { r, c };
    highlightedMoves = (currentData.legalMoves || []).filter(m => m.fromR === r && m.fromC === c);
    renderBoard(currentData);
  }

  function showPromotionDialog(fromR, fromC, toR, toC) {
    const color = currentData.myColor;
    const pieces = ['Q', 'R', 'B', 'N'];
    const overlay = document.createElement('div');
    overlay.className = 'chess-promotion-overlay';
    overlay.innerHTML = `<div class="chess-promotion-dialog">
      <h3>Promote to:</h3>
      <div class="chess-promotion-choices">
        ${pieces.map(p => `<button class="chess-promo-btn" data-piece="${p}">
          <span class="chess-piece ${color === 'w' ? 'chess-piece-white' : 'chess-piece-black'}">${PIECE_UNICODE[color + p]}</span>
        </button>`).join('')}
      </div>
    </div>`;
    gameView.appendChild(overlay);
    overlay.querySelectorAll('.chess-promo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('chess-move', { fromR, fromC, toR, toC, promotion: btn.dataset.piece });
        overlay.remove();
        selectedSquare = null;
        highlightedMoves = [];
      });
    });
  }

  function renderGameOver(data) {
    let result = '';
    if (data.phase === 'checkmate') {
      if (data.resigned) {
        const resignedName = data.resigned === socket.id ? 'You' : 'Opponent';
        result = `${resignedName} resigned`;
      } else {
        result = data.winner === socket.id ? '🎉 Checkmate — You win!' : '💀 Checkmate — You lose';
      }
    } else if (data.phase === 'stalemate') {
      result = '🤝 Stalemate — Draw';
    } else if (data.phase === 'draw') {
      result = '🤝 Draw';
    }

    renderBoard(data);
    const overlay = document.createElement('div');
    overlay.className = 'chess-result-overlay chess-result-animate';
    overlay.innerHTML = `<div class="chess-result-box">
      <h2>${result}</h2>
      <p>${data.moveHistory ? data.moveHistory.length : 0} moves played</p>
      ${isHost
        ? '<button class="btn btn-sm btn-primary" id="chess-lobby-btn" style="margin-top:14px">🏠 Back to Lobby</button>'
        : '<p style="color:var(--text-dim);font-size:0.82rem;margin-top:10px">Waiting for host\u2026</p>'}
    </div>`;
    const boardWrap = document.querySelector('.chess-board-wrap');
    if (boardWrap) boardWrap.appendChild(overlay);
    document.getElementById('chess-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  // Global handlers
  window._chessFlip = function () { flipped = !flipped; if (currentData) renderBoard(currentData); };
  window._chessResign = function () { if (confirm('Are you sure you want to resign?')) socket.emit('chess-resign'); };
  window._chessOfferDraw = function () { socket.emit('chess-draw-offer'); };
  window._chessDrawRespond = function (accept) { socket.emit('chess-draw-respond', { accept }); };
  window._chessToggleAI = function () { aiMode = !aiMode; if (currentData) renderBoard(currentData); };

  socket.on('chess-state', render);
  socket.on('chess-update', render);
})();
