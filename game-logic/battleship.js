// ─── BATTLESHIP SERVER LOGIC ───
// Classic 2-player game: place ships, then take turns firing at opponent's grid.

const GRID_SIZE = 10;
const SHIPS = [
  { name: 'Carrier', size: 5, symbol: 'A' },
  { name: 'Battleship', size: 4, symbol: 'B' },
  { name: 'Cruiser', size: 3, symbol: 'C' },
  { name: 'Submarine', size: 3, symbol: 'S' },
  { name: 'Destroyer', size: 2, symbol: 'D' }
];

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
    player1Avatar: p1.avatar || '🚢',
    player2Avatar: p2.avatar || '🚢',
    // Boards: null = water, ship symbol = ship, 'X' = hit, 'O' = miss
    boards: {
      [p1.id]: createEmptyGrid(),
      [p2.id]: createEmptyGrid()
    },
    // Track shots fired at opponent
    shots: {
      [p1.id]: createEmptyGrid(), // p1's shots at p2's board
      [p2.id]: createEmptyGrid()  // p2's shots at p1's board
    },
    ships: {
      [p1.id]: [],
      [p2.id]: []
    },
    shipsPlaced: {
      [p1.id]: false,
      [p2.id]: false
    },
    turn: p1.id,
    phase: 'placing', // placing, playing, finished
    winner: null,
    lastShot: null,
    shotHistory: []
  };
}

function placeShips(room, playerId, placements) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'placing') return null;
  if (playerId !== gs.player1 && playerId !== gs.player2) return null;
  if (gs.shipsPlaced[playerId]) return null;

  // Validate placements
  if (!Array.isArray(placements) || placements.length !== SHIPS.length) return null;

  const board = createEmptyGrid();
  const ships = [];

  for (let i = 0; i < SHIPS.length; i++) {
    const ship = SHIPS[i];
    const placement = placements[i];
    if (!placement || typeof placement.row !== 'number' || typeof placement.col !== 'number') return null;
    if (placement.direction !== 'h' && placement.direction !== 'v') return null;

    const cells = [];
    for (let j = 0; j < ship.size; j++) {
      const r = placement.direction === 'v' ? placement.row + j : placement.row;
      const c = placement.direction === 'h' ? placement.col + j : placement.col;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
      if (board[r][c] !== null) return null; // overlap
      cells.push({ r, c });
    }

    // Place ship
    for (const cell of cells) {
      board[cell.r][cell.c] = ship.symbol;
    }
    ships.push({ name: ship.name, size: ship.size, symbol: ship.symbol, cells, hits: 0, sunk: false });
  }

  gs.boards[playerId] = board;
  gs.ships[playerId] = ships;
  gs.shipsPlaced[playerId] = true;

  // Both placed? Start game
  if (gs.shipsPlaced[gs.player1] && gs.shipsPlaced[gs.player2]) {
    gs.phase = 'playing';
  }

  return { success: true, bothReady: gs.phase === 'playing' };
}

function autoPlaceShips(room, playerId) {
  const placements = [];
  const board = createEmptyGrid();

  for (const ship of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 200) {
      attempts++;
      const dir = Math.random() < 0.5 ? 'h' : 'v';
      const row = Math.floor(Math.random() * GRID_SIZE);
      const col = Math.floor(Math.random() * GRID_SIZE);
      const cells = [];
      let valid = true;

      for (let j = 0; j < ship.size; j++) {
        const r = dir === 'v' ? row + j : row;
        const c = dir === 'h' ? col + j : col;
        if (r >= GRID_SIZE || c >= GRID_SIZE || board[r][c] !== null) { valid = false; break; }
        cells.push({ r, c });
      }

      if (valid) {
        for (const cell of cells) board[cell.r][cell.c] = ship.symbol;
        placements.push({ row, col, direction: dir });
        placed = true;
      }
    }
    if (!placed) return null; // couldn't place
  }

  return placeShips(room, playerId, placements);
}

function fireShot(room, playerId, row, col) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;
  if (gs.turn !== playerId) return null;
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;

  const opponentId = playerId === gs.player1 ? gs.player2 : gs.player1;

  // Already shot here?
  if (gs.shots[playerId][row][col] !== null) return null;

  const targetCell = gs.boards[opponentId][row][col];
  let result;

  if (targetCell && targetCell !== 'X' && targetCell !== 'O') {
    // Hit!
    gs.shots[playerId][row][col] = 'X';
    gs.boards[opponentId][row][col] = 'X';

    // Find the ship and record hit
    const ship = gs.ships[opponentId].find(s => s.symbol === targetCell);
    if (ship) {
      ship.hits++;
      if (ship.hits >= ship.size) {
        ship.sunk = true;
      }
    }

    result = { hit: true, row, col, sunk: ship && ship.sunk ? ship.name : null };

    // Check win
    const allSunk = gs.ships[opponentId].every(s => s.sunk);
    if (allSunk) {
      gs.phase = 'finished';
      gs.winner = playerId;
      const winPlayer = room.players.find(p => p.id === playerId);
      if (winPlayer) winPlayer.score = (winPlayer.score || 0) + 1;
    }
  } else {
    // Miss
    gs.shots[playerId][row][col] = 'O';
    result = { hit: false, row, col };
  }

  gs.lastShot = { playerId, ...result };
  gs.shotHistory.push(gs.lastShot);

  // Switch turn (even on hit for standard rules variant)
  if (gs.phase !== 'finished') {
    gs.turn = opponentId;
  }

  return result;
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const isP1 = playerId === gs.player1;
  const isP2 = playerId === gs.player2;
  const opponentId = isP1 ? gs.player2 : (isP2 ? gs.player1 : null);

  if (gs.phase === 'placing') {
    return {
      phase: 'placing',
      myBoard: gs.boards[playerId] || createEmptyGrid(),
      shipsPlaced: gs.shipsPlaced[playerId] || false,
      opponentReady: opponentId ? (gs.shipsPlaced[opponentId] || false) : false,
      ships: SHIPS,
      opponentName: isP1 ? gs.player2Name : gs.player1Name,
      myName: isP1 ? gs.player1Name : gs.player2Name,
      gridSize: GRID_SIZE
    };
  }

  // Playing or finished
  return {
    phase: gs.phase,
    myBoard: gs.boards[playerId],
    opponentBoard: gs.shots[playerId], // My shots at opponent (only hits/misses visible)
    isMyTurn: gs.turn === playerId,
    myShips: gs.ships[playerId],
    opponentShips: gs.phase === 'finished' ? gs.ships[opponentId] : gs.ships[opponentId].map(s => ({
      name: s.name, size: s.size, sunk: s.sunk
    })),
    opponentName: isP1 ? gs.player2Name : gs.player1Name,
    myName: isP1 ? gs.player1Name : gs.player2Name,
    lastShot: gs.lastShot,
    winner: gs.winner,
    gridSize: GRID_SIZE,
    // Reveal opponent board on game over
    opponentFullBoard: gs.phase === 'finished' ? gs.boards[opponentId] : null
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [], gameType: 'battleship' };

  const p1 = room.players.find(p => p.id === gs.player1);
  const p2 = room.players.find(p => p.id === gs.player2);
  const results = [];

  if (gs.winner === gs.player1) {
    if (p1) results.push({ rank: '1st', name: p1.name, score: 1, isHost: p1.isHost });
    if (p2) results.push({ rank: '2nd', name: p2.name, score: 0, isHost: p2.isHost });
  } else if (gs.winner === gs.player2) {
    if (p2) results.push({ rank: '1st', name: p2.name, score: 1, isHost: p2.isHost });
    if (p1) results.push({ rank: '2nd', name: p1.name, score: 0, isHost: p1.isHost });
  } else {
    if (p1) results.push({ rank: '1st', name: p1.name, score: 0, isHost: p1.isHost });
    if (p2) results.push({ rank: '1st', name: p2.name, score: 0, isHost: p2.isHost });
  }

  return { players: results, gameType: 'battleship' };
}

module.exports = { init, placeShips, autoPlaceShips, fireShot, getPlayerView, getResults };
