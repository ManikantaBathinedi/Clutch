// ─── CHESS SERVER LOGIC ───
// Full chess implementation: 2 players, standard rules, check/checkmate/stalemate/draw.

const PIECES = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'
};

const INITIAL_BOARD = [
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR']
];

function deepCopy(board) {
  return board.map(row => [...row]);
}

function init(room) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  
  // AI mode: single player vs computer
  if (activePlayers.length === 1) {
    const human = activePlayers[0];
    // Randomly assign color
    const humanIsWhite = Math.random() < 0.5;
    const aiId = '__chess_ai__';
    
    room.gameState = {
      board: deepCopy(INITIAL_BOARD),
      turn: 'w',
      whiteId: humanIsWhite ? human.id : aiId,
      blackId: humanIsWhite ? aiId : human.id,
      whiteName: humanIsWhite ? human.name : '🤖 Computer',
      blackName: humanIsWhite ? '🤖 Computer' : human.name,
      whiteAvatar: humanIsWhite ? (human.avatar || '♔') : '🤖',
      blackAvatar: humanIsWhite ? '🤖' : (human.avatar || '♚'),
      spectators: [],
      moveHistory: [],
      capturedByWhite: [],
      capturedByBlack: [],
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
      phase: 'playing',
      inCheck: false,
      winner: null,
      lastMove: null,
      drawOffer: null,
      positionHistory: [],
      resigned: null,
      aiMode: true
    };
    room.gameState.positionHistory.push(boardToFEN(room.gameState));
    return;
  }
  
  if (activePlayers.length < 2) return;

  // Randomly assign colors
  const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
  const white = shuffled[0];
  const black = shuffled[1];
  const spectators = activePlayers.slice(2).map(p => p.id);

  room.gameState = {
    board: deepCopy(INITIAL_BOARD),
    turn: 'w', // 'w' or 'b'
    whiteId: white.id,
    blackId: black.id,
    whiteName: white.name,
    blackName: black.name,
    whiteAvatar: white.avatar || '♔',
    blackAvatar: black.avatar || '♚',
    spectators,
    moveHistory: [],
    capturedByWhite: [], // pieces black lost
    capturedByBlack: [], // pieces white lost
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null, // {row, col} of en passant target square
    halfMoveClock: 0,
    fullMoveNumber: 1,
    phase: 'playing', // playing, check, checkmate, stalemate, draw
    inCheck: false,
    winner: null,
    lastMove: null,
    drawOffer: null, // { from: playerId }
    positionHistory: [],
    resigned: null
  };

  // Store initial position for threefold repetition
  room.gameState.positionHistory.push(boardToFEN(room.gameState));
}

function boardToFEN(gs) {
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      if (!gs.board[r][c]) { empty++; }
      else {
        if (empty > 0) { fen += empty; empty = 0; }
        const piece = gs.board[r][c];
        const letter = piece[1];
        fen += piece[0] === 'w' ? letter.toUpperCase() : letter.toLowerCase();
      }
    }
    if (empty > 0) fen += empty;
    if (r < 7) fen += '/';
  }
  fen += ' ' + gs.turn;
  let castleStr = '';
  if (gs.castling.wK) castleStr += 'K';
  if (gs.castling.wQ) castleStr += 'Q';
  if (gs.castling.bK) castleStr += 'k';
  if (gs.castling.bQ) castleStr += 'q';
  fen += ' ' + (castleStr || '-');
  if (gs.enPassant) {
    const file = String.fromCharCode(97 + gs.enPassant.col);
    const rank = 8 - gs.enPassant.row;
    fen += ' ' + file + rank;
  } else {
    fen += ' -';
  }
  return fen;
}

function getPieceColor(piece) {
  return piece ? piece[0] : null;
}

function getPieceType(piece) {
  return piece ? piece[1] : null;
}

function isInBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// Get all pseudo-legal moves for a piece at (r,c) - doesn't check for leaving king in check
function getRawMoves(board, r, c, castling, enPassant) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const type = getPieceType(piece);
  const moves = [];
  const enemy = color === 'w' ? 'b' : 'w';

  if (type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    // Forward 1
    if (isInBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c });
      // Forward 2 from start
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push({ r: r + 2 * dir, c });
      }
    }
    // Captures
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (isInBounds(nr, nc)) {
        if (board[nr][nc] && getPieceColor(board[nr][nc]) === enemy) {
          moves.push({ r: nr, c: nc });
        }
        // En passant
        if (enPassant && enPassant.row === nr && enPassant.col === nc) {
          moves.push({ r: nr, c: nc, enPassant: true });
        }
      }
    }
  } else if (type === 'N') {
    const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (isInBounds(nr, nc) && getPieceColor(board[nr][nc]) !== color) {
        moves.push({ r: nr, c: nc });
      }
    }
  } else if (type === 'B') {
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      slideMoves(board, r, c, dr, dc, color, moves);
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      slideMoves(board, r, c, dr, dc, color, moves);
    }
  } else if (type === 'Q') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      slideMoves(board, r, c, dr, dc, color, moves);
    }
  } else if (type === 'K') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nc = c + dc;
      if (isInBounds(nr, nc) && getPieceColor(board[nr][nc]) !== color) {
        moves.push({ r: nr, c: nc });
      }
    }
    // Castling
    if (castling) {
      const row = color === 'w' ? 7 : 0;
      if (r === row && c === 4) {
        // Kingside
        const ksKey = color + 'K';
        if (castling[ksKey] && !board[row][5] && !board[row][6] && board[row][7] && getPieceType(board[row][7]) === 'R' && getPieceColor(board[row][7]) === color) {
          if (!isSquareAttacked(board, row, 4, enemy) && !isSquareAttacked(board, row, 5, enemy) && !isSquareAttacked(board, row, 6, enemy)) {
            moves.push({ r: row, c: 6, castle: 'K' });
          }
        }
        // Queenside
        const qsKey = color + 'Q';
        if (castling[qsKey] && !board[row][3] && !board[row][2] && !board[row][1] && board[row][0] && getPieceType(board[row][0]) === 'R' && getPieceColor(board[row][0]) === color) {
          if (!isSquareAttacked(board, row, 4, enemy) && !isSquareAttacked(board, row, 3, enemy) && !isSquareAttacked(board, row, 2, enemy)) {
            moves.push({ r: row, c: 2, castle: 'Q' });
          }
        }
      }
    }
  }

  return moves;
}

function slideMoves(board, r, c, dr, dc, color, moves) {
  let nr = r + dr, nc = c + dc;
  while (isInBounds(nr, nc)) {
    const target = board[nr][nc];
    if (!target) {
      moves.push({ r: nr, c: nc });
    } else {
      if (getPieceColor(target) !== color) moves.push({ r: nr, c: nc });
      break;
    }
    nr += dr;
    nc += dc;
  }
}

function isSquareAttacked(board, r, c, byColor) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && getPieceColor(piece) === byColor) {
        const rawMoves = getRawMoves(board, row, col, null, null);
        if (rawMoves.some(m => m.r === r && m.c === c)) return true;
      }
    }
  }
  return false;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === color + 'K') return { r, c };
    }
  }
  return null;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  const enemy = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, king.r, king.c, enemy);
}

// Get all legal moves for a color
function getAllLegalMoves(gs, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (gs.board[r][c] && getPieceColor(gs.board[r][c]) === color) {
        const rawMoves = getRawMoves(gs.board, r, c, gs.castling, gs.enPassant);
        for (const move of rawMoves) {
          // Simulate move and check if king is still safe
          const testBoard = deepCopy(gs.board);
          applyMoveToBoard(testBoard, r, c, move);
          if (!isInCheck(testBoard, color)) {
            moves.push({ fromR: r, fromC: c, toR: move.r, toC: move.c, ...move });
          }
        }
      }
    }
  }
  return moves;
}

function applyMoveToBoard(board, fromR, fromC, move) {
  const piece = board[fromR][fromC];
  board[move.r][move.c] = piece;
  board[fromR][fromC] = null;

  // En passant capture
  if (move.enPassant) {
    const dir = getPieceColor(piece) === 'w' ? 1 : -1;
    board[move.r + dir][move.c] = null;
  }

  // Castling
  if (move.castle) {
    const row = move.r;
    if (move.castle === 'K') {
      board[row][5] = board[row][7];
      board[row][7] = null;
    } else {
      board[row][3] = board[row][0];
      board[row][0] = null;
    }
  }

  // Pawn promotion (auto-queen)
  if (getPieceType(piece) === 'P') {
    if ((getPieceColor(piece) === 'w' && move.r === 0) || (getPieceColor(piece) === 'b' && move.r === 7)) {
      board[move.r][move.c] = getPieceColor(piece) + (move.promotion || 'Q');
    }
  }
}

function makeMove(room, playerId, fromR, fromC, toR, toC, promotion) {
  const gs = room.gameState;
  if (!gs || gs.phase === 'checkmate' || gs.phase === 'stalemate' || gs.phase === 'draw') return null;

  const color = gs.turn;
  if ((color === 'w' && playerId !== gs.whiteId) || (color === 'b' && playerId !== gs.blackId)) return null;

  const piece = gs.board[fromR][fromC];
  if (!piece || getPieceColor(piece) !== color) return null;

  // Get legal moves for this piece
  const rawMoves = getRawMoves(gs.board, fromR, fromC, gs.castling, gs.enPassant);
  const legalMoves = rawMoves.filter(m => {
    const testBoard = deepCopy(gs.board);
    applyMoveToBoard(testBoard, fromR, fromC, m);
    return !isInCheck(testBoard, color);
  });

  const targetMove = legalMoves.find(m => m.r === toR && m.c === toC);
  if (!targetMove) return null;

  // Add promotion choice
  if (promotion) targetMove.promotion = promotion;

  // Record captured piece
  const captured = gs.board[toR][toC];
  if (captured) {
    if (color === 'w') gs.capturedByWhite.push(captured);
    else gs.capturedByBlack.push(captured);
  }
  // En passant capture
  if (targetMove.enPassant) {
    const dir = color === 'w' ? 1 : -1;
    const epCaptured = gs.board[toR + dir][toC];
    if (epCaptured) {
      if (color === 'w') gs.capturedByWhite.push(epCaptured);
      else gs.capturedByBlack.push(epCaptured);
    }
  }

  // Apply move
  applyMoveToBoard(gs.board, fromR, fromC, targetMove);

  // Update castling rights
  if (getPieceType(piece) === 'K') {
    if (color === 'w') { gs.castling.wK = false; gs.castling.wQ = false; }
    else { gs.castling.bK = false; gs.castling.bQ = false; }
  }
  if (getPieceType(piece) === 'R') {
    if (fromR === 7 && fromC === 0) gs.castling.wQ = false;
    if (fromR === 7 && fromC === 7) gs.castling.wK = false;
    if (fromR === 0 && fromC === 0) gs.castling.bQ = false;
    if (fromR === 0 && fromC === 7) gs.castling.bK = false;
  }
  // If rook captured
  if (toR === 0 && toC === 0) gs.castling.bQ = false;
  if (toR === 0 && toC === 7) gs.castling.bK = false;
  if (toR === 7 && toC === 0) gs.castling.wQ = false;
  if (toR === 7 && toC === 7) gs.castling.wK = false;

  // Update en passant
  if (getPieceType(piece) === 'P' && Math.abs(fromR - toR) === 2) {
    gs.enPassant = { row: (fromR + toR) / 2, col: fromC };
  } else {
    gs.enPassant = null;
  }

  // Half-move clock
  if (getPieceType(piece) === 'P' || captured) {
    gs.halfMoveClock = 0;
  } else {
    gs.halfMoveClock++;
  }

  // Move notation
  const notation = getMoveNotation(piece, fromR, fromC, toR, toC, captured, targetMove);
  gs.lastMove = { fromR, fromC, toR, toC, piece, captured, notation, castle: targetMove.castle };
  gs.moveHistory.push(gs.lastMove);

  // Clear draw offer
  gs.drawOffer = null;

  // Switch turn
  gs.turn = color === 'w' ? 'b' : 'w';
  if (color === 'b') gs.fullMoveNumber++;

  // Check game status
  const enemy = gs.turn;
  const enemyMoves = getAllLegalMoves(gs, enemy);
  const inCheck = isInCheck(gs.board, enemy);

  if (enemyMoves.length === 0) {
    if (inCheck) {
      gs.phase = 'checkmate';
      gs.winner = color === 'w' ? gs.whiteId : gs.blackId;
      // Award scores
      const winPlayer = room.players.find(p => p.id === gs.winner);
      if (winPlayer) winPlayer.score = (winPlayer.score || 0) + 1;
    } else {
      gs.phase = 'stalemate';
    }
  } else {
    gs.inCheck = inCheck;
    gs.phase = inCheck ? 'check' : 'playing';
  }

  // Store position for repetition
  const fen = boardToFEN(gs);
  gs.positionHistory.push(fen);

  // 50-move rule
  if (gs.halfMoveClock >= 100) {
    gs.phase = 'draw';
    gs.winner = null;
  }

  // Threefold repetition
  const posCount = gs.positionHistory.filter(p => p === fen).length;
  if (posCount >= 3) {
    gs.phase = 'draw';
    gs.winner = null;
  }

  // Insufficient material
  if (isInsufficientMaterial(gs.board)) {
    gs.phase = 'draw';
    gs.winner = null;
  }

  return { success: true };
}

function isInsufficientMaterial(board) {
  const pieces = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]) pieces.push(board[r][c]);
    }
  }
  // King vs King
  if (pieces.length === 2) return true;
  // King + minor vs King
  if (pieces.length === 3) {
    const nonKing = pieces.find(p => getPieceType(p) !== 'K');
    if (nonKing && (getPieceType(nonKing) === 'B' || getPieceType(nonKing) === 'N')) return true;
  }
  // King + Bishop vs King + Bishop (same color)
  if (pieces.length === 4) {
    const bishops = pieces.filter(p => getPieceType(p) === 'B');
    if (bishops.length === 2) {
      // Check if bishops are on same color square
      let pos1, pos2;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (board[r][c] && getPieceType(board[r][c]) === 'B') {
            if (!pos1) pos1 = { r, c };
            else pos2 = { r, c };
          }
        }
      }
      if (pos1 && pos2 && (pos1.r + pos1.c) % 2 === (pos2.r + pos2.c) % 2) return true;
    }
  }
  return false;
}

function getMoveNotation(piece, fromR, fromC, toR, toC, captured, move) {
  if (move.castle === 'K') return 'O-O';
  if (move.castle === 'Q') return 'O-O-O';
  const files = 'abcdefgh';
  const type = getPieceType(piece);
  let notation = '';
  if (type !== 'P') notation += type;
  else if (captured || move.enPassant) notation += files[fromC];
  if (captured || move.enPassant) notation += 'x';
  notation += files[toC] + (8 - toR);
  if (type === 'P' && (toR === 0 || toR === 7)) notation += '=' + (move.promotion || 'Q');
  return notation;
}

function resign(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase === 'checkmate' || gs.phase === 'stalemate' || gs.phase === 'draw') return null;
  if (playerId !== gs.whiteId && playerId !== gs.blackId) return null;

  gs.resigned = playerId;
  gs.phase = 'checkmate'; // treat as game over
  gs.winner = playerId === gs.whiteId ? gs.blackId : gs.whiteId;
  const winPlayer = room.players.find(p => p.id === gs.winner);
  if (winPlayer) winPlayer.score = (winPlayer.score || 0) + 1;
  return { success: true };
}

function offerDraw(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase === 'checkmate' || gs.phase === 'stalemate' || gs.phase === 'draw') return null;
  if (playerId !== gs.whiteId && playerId !== gs.blackId) return null;
  gs.drawOffer = { from: playerId };
  return { success: true };
}

function respondDraw(room, playerId, accept) {
  const gs = room.gameState;
  if (!gs || !gs.drawOffer) return null;
  if (playerId === gs.drawOffer.from) return null; // can't respond to own offer
  if (playerId !== gs.whiteId && playerId !== gs.blackId) return null;

  if (accept) {
    gs.phase = 'draw';
    gs.winner = null;
  }
  gs.drawOffer = null;
  return { success: true, accepted: accept };
}

function getLegalMoves(room, playerId) {
  const gs = room.gameState;
  if (!gs) return [];
  const color = playerId === gs.whiteId ? 'w' : (playerId === gs.blackId ? 'b' : null);
  if (!color || color !== gs.turn) return [];
  return getAllLegalMoves(gs, color);
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const isWhite = playerId === gs.whiteId;
  const isBlack = playerId === gs.blackId;
  const myColor = isWhite ? 'w' : (isBlack ? 'b' : null);
  const isMyTurn = myColor === gs.turn;

  return {
    board: gs.board,
    turn: gs.turn,
    myColor,
    isMyTurn,
    phase: gs.phase,
    inCheck: gs.inCheck,
    whitePlayer: { name: gs.whiteName, avatar: gs.whiteAvatar },
    blackPlayer: { name: gs.blackName, avatar: gs.blackAvatar },
    moveHistory: gs.moveHistory.map(m => m.notation),
    capturedByWhite: gs.capturedByWhite,
    capturedByBlack: gs.capturedByBlack,
    lastMove: gs.lastMove ? { fromR: gs.lastMove.fromR, fromC: gs.lastMove.fromC, toR: gs.lastMove.toR, toC: gs.lastMove.toC } : null,
    winner: gs.winner,
    drawOffer: gs.drawOffer,
    resigned: gs.resigned,
    legalMoves: isMyTurn ? getAllLegalMoves(gs, myColor).map(m => ({ fromR: m.fromR, fromC: m.fromC, toR: m.toR, toC: m.toC })) : [],
    fullMoveNumber: gs.fullMoveNumber,
    aiMode: gs.aiMode || false
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [], gameType: 'chess' };

  const results = [];
  const wp = room.players.find(p => p.id === gs.whiteId);
  const bp = room.players.find(p => p.id === gs.blackId);

  if (gs.winner === gs.whiteId) {
    if (wp) results.push({ rank: '1st', name: wp.name, score: 1, isHost: wp.isHost });
    if (bp) results.push({ rank: '2nd', name: bp.name, score: 0, isHost: bp.isHost });
  } else if (gs.winner === gs.blackId) {
    if (bp) results.push({ rank: '1st', name: bp.name, score: 1, isHost: bp.isHost });
    if (wp) results.push({ rank: '2nd', name: wp.name, score: 0, isHost: wp.isHost });
  } else {
    // Draw
    if (wp) results.push({ rank: '1st', name: wp.name, score: 0.5, isHost: wp.isHost });
    if (bp) results.push({ rank: '1st', name: bp.name, score: 0.5, isHost: bp.isHost });
  }

  return { players: results, gameType: 'chess' };
}

module.exports = { init, makeMove, resign, offerDraw, respondDraw, getLegalMoves, getPlayerView, getResults };
