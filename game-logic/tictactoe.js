// ─── TIC TAC TOE — SERVER LOGIC ───
// Classic 2-player game. Get 3 in a row to win.

const GRID_SIZE = 3;

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function init(room) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  if (activePlayers.length < 2) return;

  const p1 = activePlayers[0];
  const p2 = activePlayers[1];

  room.gameState = {
    player1: p1.id,
    player2: p2.id,
    player1Name: p1.name,
    player2Name: p2.name,
    player1Avatar: p1.avatar || '❌',
    player2Avatar: p2.avatar || '⭕',
    board: createEmptyGrid(),
    turn: p1.id,       // p1 = 'X', p2 = 'O'
    phase: 'playing',  // playing | finished
    winner: null,
    winCells: null,
    lastMove: null,
    moveCount: 0
  };
}

function makeMove(room, playerId, row, col) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;
  if (gs.turn !== playerId) return null;
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
  if (gs.board[row][col] !== null) return null;

  const mark = playerId === gs.player1 ? 'X' : 'O';
  gs.board[row][col] = mark;
  gs.lastMove = { row, col, mark };
  gs.moveCount++;

  // Check win
  const winCells = checkWin(gs.board, row, col, mark);
  if (winCells) {
    gs.phase = 'finished';
    gs.winner = playerId;
    gs.winCells = winCells;
    const winPlayer = room.players.find(p => p.id === playerId);
    if (winPlayer) winPlayer.score = (winPlayer.score || 0) + 1;
    return { action: 'win', row, col };
  }

  // Check draw
  if (gs.moveCount >= GRID_SIZE * GRID_SIZE) {
    gs.phase = 'finished';
    gs.winner = 'draw';
    return { action: 'draw', row, col };
  }

  // Switch turn
  gs.turn = playerId === gs.player1 ? gs.player2 : gs.player1;
  return { action: 'move', row, col };
}

function checkWin(board, row, col, mark) {
  const size = GRID_SIZE;

  // Check row
  if (board[row].every(cell => cell === mark)) {
    return board[row].map((_, c) => ({ r: row, c }));
  }

  // Check column
  if (board.every(r => r[col] === mark)) {
    return board.map((_, r) => ({ r, c: col }));
  }

  // Check main diagonal (top-left to bottom-right)
  if (row === col) {
    if (board.every((r, i) => r[i] === mark)) {
      return board.map((_, i) => ({ r: i, c: i }));
    }
  }

  // Check anti-diagonal (top-right to bottom-left)
  if (row + col === size - 1) {
    if (board.every((r, i) => r[size - 1 - i] === mark)) {
      return board.map((_, i) => ({ r: i, c: size - 1 - i }));
    }
  }

  return null;
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  return {
    board: gs.board,
    turn: gs.turn,
    phase: gs.phase,
    winner: gs.winner,
    winCells: gs.winCells,
    lastMove: gs.lastMove,
    player1: gs.player1,
    player2: gs.player2,
    player1Name: gs.player1Name,
    player2Name: gs.player2Name,
    player1Avatar: gs.player1Avatar,
    player2Avatar: gs.player2Avatar,
    myMark: playerId === gs.player1 ? 'X' : (playerId === gs.player2 ? 'O' : null),
    isMyTurn: gs.turn === playerId && gs.phase === 'playing'
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [] };

  const players = room.players.filter(p => !p.isSpectator).map(p => ({
    name: p.name,
    score: p.score || 0,
    rank: gs.winner === p.id ? 1 : (gs.winner === 'draw' ? 1 : 2),
    isWinner: gs.winner === p.id
  }));

  players.sort((a, b) => a.rank - b.rank);

  return {
    players,
    isDraw: gs.winner === 'draw',
    winnerName: gs.winner === 'draw' ? null : players.find(p => p.isWinner)?.name
  };
}

module.exports = { init, makeMove, getPlayerView, getResults };
