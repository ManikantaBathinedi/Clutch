// ─── CONNECT FOUR — SERVER LOGIC ───
// Classic 2-player drop-disc game. Win by getting 4 in a row.

const ROWS = 6;
const COLS = 7;

function createEmptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
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
    player1Avatar: p1.avatar || '🔴',
    player2Avatar: p2.avatar || '🟡',
    board: createEmptyGrid(),
    turn: p1.id,      // p1 = 'R' (red), p2 = 'Y' (yellow)
    phase: 'playing',  // playing | finished
    winner: null,
    winCells: null,
    lastMove: null,
    moveCount: 0
  };
}

function dropDisc(room, playerId, col) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;
  if (gs.turn !== playerId) return null;
  if (col < 0 || col >= COLS) return null;

  // Find lowest empty row in column
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (gs.board[r][col] === null) { row = r; break; }
  }
  if (row === -1) return null; // column full

  const disc = playerId === gs.player1 ? 'R' : 'Y';
  gs.board[row][col] = disc;
  gs.lastMove = { row, col, disc };
  gs.moveCount++;

  // Check win
  const winCells = checkWin(gs.board, row, col, disc);
  if (winCells) {
    gs.phase = 'finished';
    gs.winner = playerId;
    gs.winCells = winCells;
    const winPlayer = room.players.find(p => p.id === playerId);
    if (winPlayer) winPlayer.score = (winPlayer.score || 0) + 1;
    return { action: 'win', row, col };
  }

  // Check draw (board full)
  if (gs.moveCount >= ROWS * COLS) {
    gs.phase = 'finished';
    gs.winner = 'draw';
    return { action: 'draw', row, col };
  }

  // Switch turn
  gs.turn = playerId === gs.player1 ? gs.player2 : gs.player1;
  return { action: 'move', row, col };
}

function checkWin(board, row, col, disc) {
  const directions = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diagonal ↘
    [1, -1]  // diagonal ↙
  ];

  for (const [dr, dc] of directions) {
    const cells = [{ r: row, c: col }];

    // Check forward
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== disc) break;
      cells.push({ r, c });
    }
    // Check backward
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== disc) break;
      cells.push({ r, c });
    }

    if (cells.length >= 4) return cells;
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
    myColor: playerId === gs.player1 ? 'R' : (playerId === gs.player2 ? 'Y' : null),
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

module.exports = { init, dropDisc, getPlayerView, getResults };
