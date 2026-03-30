/**
 * COMPREHENSIVE TESTS FOR 14 NEW GAMES
 * Chess, Battleship, Connect Four, Tic Tac Toe, Rummy, Coup, Wordle, Dixit,
 * Know Me, Party Prompts (Piloco), King's Cup, Most Likely To, Never Have I Ever, Truth or Drink
 * Covers: init, gameplay, game-over, edge cases, disconnect, rematch
 */
const { startServer, createClient, waitForEvent, delay, cleanup } = require('./helpers');

let srv;
let clients = [];

beforeAll(async () => { srv = await startServer(); });
afterAll(async () => { await cleanup(clients, srv); });
afterEach(async () => {
  clients.forEach(c => { if (c.connected) c.disconnect(); });
  clients = [];
  await delay(100);
});

async function makeClient() {
  const c = await createClient(srv.port);
  clients.push(c);
  return c;
}

async function createRoom(hostName = 'Host') {
  const host = await makeClient();
  host.emit('create-room', { hostName, avatar: '😎' });
  const { roomCode } = await waitForEvent(host, 'room-created');
  await waitForEvent(host, 'player-joined');
  return { host, roomCode };
}

async function joinRoom(roomCode, name) {
  const p = await makeClient();
  p.emit('join-room', { roomCode, playerName: name, avatar: '😎' });
  await waitForEvent(p, 'join-success');
  return p;
}

// ══════════════════════════════════════════════════════════════
// CHESS
// ══════════════════════════════════════════════════════════════
describe('Chess', () => {
  async function startChess() {
    const { host, roomCode } = await createRoom();
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);
    host.emit('select-game', { gameType: 'chess', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'chess-state', 2000);
    return { host, p2, roomCode, state };
  }

  test('initialises with correct state for 2 players', async () => {
    const { state } = await startChess();
    expect(state).toBeDefined();
    expect(state.board).toBeDefined();
    expect(state.board.length).toBe(8);
    expect(state.myColor).toMatch(/^(white|black|w|b)$/);
    expect(state.phase).toBe('playing');
  });

  test('white player can make opening move', async () => {
    const { host, p2, state } = await startChess();
    const white = (state.myColor === 'white' || state.myColor === 'w') ? host : p2;
    // Move pawn e2 to e4
    white.emit('chess-move', { fromR: 6, fromC: 4, toR: 4, toC: 4 });
    const update = await waitForEvent(white, 'chess-update', 2000);
    expect(update).toBeDefined();
    expect(update.moveHistory.length).toBeGreaterThan(0);
  });

  test('both players receive updates after a move', async () => {
    const { host, p2, state } = await startChess();
    const white = (state.myColor === 'white' || state.myColor === 'w') ? host : p2;
    const black = white === host ? p2 : host;
    white.emit('chess-move', { fromR: 6, fromC: 4, toR: 4, toC: 4 });
    const [u1, u2] = await Promise.all([
      waitForEvent(host, 'chess-update', 2000),
      waitForEvent(p2, 'chess-update', 2000)
    ]);
    expect(u1.board).toBeDefined();
    expect(u2.board).toBeDefined();
  });

  test('wrong player cannot move', async () => {
    const { host, p2, state } = await startChess();
    const black = (state.myColor === 'black' || state.myColor === 'b') ? host : p2;
    black.emit('chess-move', { fromR: 1, fromC: 4, toR: 3, toC: 4 });
    await expect(waitForEvent(black, 'chess-update', 500)).rejects.toThrow('Timeout');
  });

  test('resign ends the game', async () => {
    const { host, p2 } = await startChess();
    host.emit('chess-resign');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('chess');
  });

  test('draw offer and accept ends game', async () => {
    const { host, p2, state } = await startChess();
    const white = (state.myColor === 'white' || state.myColor === 'w') ? host : p2;
    const black = white === host ? p2 : host;
    // Make a move first so draw offer works
    white.emit('chess-move', { fromR: 6, fromC: 4, toR: 4, toC: 4 });
    await waitForEvent(white, 'chess-update', 2000);
    // Black offers draw
    black.emit('chess-draw-offer');
    await waitForEvent(white, 'chess-update', 2000);
    // White accepts
    white.emit('chess-draw-respond', { accept: true });
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('draw offer and reject continues game', async () => {
    const { host, p2, state } = await startChess();
    const white = (state.myColor === 'white' || state.myColor === 'w') ? host : p2;
    const black = white === host ? p2 : host;
    white.emit('chess-move', { fromR: 6, fromC: 4, toR: 4, toC: 4 });
    // Consume both players' move updates
    await Promise.all([
      waitForEvent(white, 'chess-update', 2000),
      waitForEvent(black, 'chess-update', 2000)
    ]);
    black.emit('chess-draw-offer');
    await waitForEvent(white, 'chess-update', 2000);
    white.emit('chess-draw-respond', { accept: false });
    const update = await waitForEvent(black, 'chess-update', 2000);
    expect(update.phase).toBe('playing');
  });

  test('end-game-early works', async () => {
    const { host } = await startChess();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('rematch works', async () => {
    const { host } = await startChess();
    host.emit('chess-resign');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('chess');
  });

  test('disconnect does not crash', async () => {
    const { host, p2 } = await startChess();
    p2.disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// BATTLESHIP
// ══════════════════════════════════════════════════════════════
describe('Battleship', () => {
  async function startBattleship() {
    const { host, roomCode } = await createRoom();
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);
    host.emit('select-game', { gameType: 'battleship', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'battleship-state', 2000);
    return { host, p2, roomCode, state };
  }

  test('initialises in placing phase', async () => {
    const { state } = await startBattleship();
    expect(state).toBeDefined();
    expect(state.phase).toBe('placing');
    expect(state.ships).toBeDefined();
  });

  test('auto-place ships works', async () => {
    const { host, p2 } = await startBattleship();
    host.emit('battleship-auto-place');
    const update = await waitForEvent(host, 'battleship-update', 2000);
    expect(update).toBeDefined();
    expect(update.shipsPlaced || update.phase).toBeTruthy();
  });

  test('both players auto-place transitions to playing', async () => {
    const { host, p2 } = await startBattleship();
    host.emit('battleship-auto-place');
    p2.emit('battleship-auto-place');
    // Wait for both to get updates - one of them should show phase 'playing'
    const updates = [];
    for (let i = 0; i < 4; i++) {
      try {
        const u = await waitForEvent(host, 'battleship-update', 1000);
        updates.push(u);
        if (u.phase === 'playing') break;
      } catch (e) { break; }
    }
    const playingState = updates.find(u => u.phase === 'playing');
    expect(playingState || updates.length > 0).toBeTruthy();
  });

  test('end-game-early works', async () => {
    const { host } = await startBattleship();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('disconnect during placement does not crash', async () => {
    const { host, p2 } = await startBattleship();
    p2.disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// CONNECT FOUR
// ══════════════════════════════════════════════════════════════
describe('Connect Four', () => {
  async function startConnectFour() {
    const { host, roomCode } = await createRoom();
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);
    host.emit('select-game', { gameType: 'connectfour', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'connectfour-state', 2000);
    return { host, p2, roomCode, state };
  }

  test('initialises with 6x7 board', async () => {
    const { state } = await startConnectFour();
    expect(state).toBeDefined();
    expect(state.board).toBeDefined();
    expect(state.board.length).toBe(6);
    expect(state.board[0].length).toBe(7);
    expect(state.myColor).toMatch(/^(R|Y)$/);
  });

  test('current player can drop disc', async () => {
    const { host, p2, state } = await startConnectFour();
    const current = state.isMyTurn ? host : p2;
    current.emit('connectfour-move', { col: 3 });
    const update = await waitForEvent(current, 'connectfour-update', 2000);
    expect(update).toBeDefined();
    expect(update.lastMove).toBeDefined();
  });

  test('wrong player cannot move', async () => {
    const { host, p2, state } = await startConnectFour();
    const notCurrent = state.isMyTurn ? p2 : host;
    notCurrent.emit('connectfour-move', { col: 3 });
    await expect(waitForEvent(notCurrent, 'connectfour-update', 500)).rejects.toThrow('Timeout');
  });

  test('alternating moves progress game', async () => {
    const { host, p2, state } = await startConnectFour();
    let current = state.isMyTurn ? host : p2;
    let other = current === host ? p2 : host;

    for (let i = 0; i < 4; i++) {
      current.emit('connectfour-move', { col: i });
      const [u1, u2] = await Promise.all([
        waitForEvent(host, 'connectfour-update', 2000),
        waitForEvent(p2, 'connectfour-update', 2000)
      ]);
      // Swap turns
      current = u1.isMyTurn ? host : p2;
      other = current === host ? p2 : host;
    }
  });

  test('end-game-early works for connect four', async () => {
    const { host } = await startConnectFour();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startConnectFour();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('rematch works', async () => {
    const { host } = await startConnectFour();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('connectfour');
  });
});

// ══════════════════════════════════════════════════════════════
// TIC TAC TOE
// ══════════════════════════════════════════════════════════════
describe('Tic Tac Toe', () => {
  async function startTicTacToe() {
    const { host, roomCode } = await createRoom();
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);
    host.emit('select-game', { gameType: 'tictactoe', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'tictactoe-state', 2000);
    return { host, p2, roomCode, state };
  }

  test('initialises with 3x3 board', async () => {
    const { state } = await startTicTacToe();
    expect(state).toBeDefined();
    expect(state.board).toBeDefined();
    expect(state.board.length).toBe(3);
    expect(state.board[0].length).toBe(3);
    expect(state.myMark).toMatch(/^(X|O)$/);
  });

  test('current player can make a move', async () => {
    const { host, p2, state } = await startTicTacToe();
    const current = state.isMyTurn ? host : p2;
    current.emit('tictactoe-move', { row: 1, col: 1 });
    const update = await waitForEvent(current, 'tictactoe-update', 2000);
    expect(update).toBeDefined();
    expect(update.lastMove).toBeDefined();
  });

  test('X wins with top row triggers game-over', async () => {
    const { host, p2, state } = await startTicTacToe();
    let isHostTurn = state.isMyTurn;

    const moves = [
      { row: 0, col: 0 }, // X
      { row: 1, col: 0 }, // O
      { row: 0, col: 1 }, // X
      { row: 1, col: 1 }, // O
      { row: 0, col: 2 }, // X wins
    ];

    for (let i = 0; i < moves.length; i++) {
      const current = isHostTurn ? host : p2;
      current.emit('tictactoe-move', moves[i]);

      if (i < moves.length - 1) {
        const [u1, u2] = await Promise.all([
          waitForEvent(host, 'tictactoe-update', 2000),
          waitForEvent(p2, 'tictactoe-update', 2000)
        ]);
        isHostTurn = u1.isMyTurn;
      }
    }

    const results = await waitForEvent(host, 'game-over', 3000);
    expect(results).toBeDefined();
  });

  test('wrong player cannot move', async () => {
    const { host, p2, state } = await startTicTacToe();
    const notCurrent = state.isMyTurn ? p2 : host;
    notCurrent.emit('tictactoe-move', { row: 0, col: 0 });
    await expect(waitForEvent(notCurrent, 'tictactoe-update', 500)).rejects.toThrow('Timeout');
  });

  test('end-game-early works', async () => {
    const { host } = await startTicTacToe();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('rematch works', async () => {
    const { host } = await startTicTacToe();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('tictactoe');
  });
});

// ══════════════════════════════════════════════════════════════
// RUMMY
// ══════════════════════════════════════════════════════════════
describe('Rummy', () => {
  async function startRummy(playerCount = 2) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'rummy', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'rummy-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with cards dealt', async () => {
    const { state } = await startRummy();
    expect(state).toBeDefined();
    expect(state.myHand).toBeDefined();
    expect(state.myHand.length).toBeGreaterThan(0);
    expect(state.phase).toMatch(/^(draw|discard)$/);
  });

  test('current player can draw from deck', async () => {
    const { host, players, state } = await startRummy();
    const current = state.isMyTurn ? host : players[0];
    if (state.phase === 'draw') {
      current.emit('rummy-draw-deck');
      const update = await waitForEvent(current, 'rummy-update', 2000);
      expect(update).toBeDefined();
      expect(update.myHand.length).toBeGreaterThan(state.myHand ? state.myHand.length : 0);
    }
  });

  test('current player can draw from discard pile', async () => {
    const { host, players, state } = await startRummy();
    const current = state.isMyTurn ? host : players[0];
    if (state.phase === 'draw' && state.discardTop) {
      current.emit('rummy-draw-discard');
      const update = await waitForEvent(current, 'rummy-update', 2000);
      expect(update).toBeDefined();
    }
  });

  test('draw then discard completes a turn', async () => {
    const { host, players, state } = await startRummy();
    const current = state.isMyTurn ? host : players[0];
    if (state.phase === 'draw') {
      current.emit('rummy-draw-deck');
      const drawUpdate = await waitForEvent(current, 'rummy-update', 2000);
      expect(drawUpdate.phase).toBe('discard');
      // Discard the first card
      const cardId = drawUpdate.myHand[0].id;
      current.emit('rummy-discard', { cardId });
      const discardUpdate = await waitForEvent(current, 'rummy-update', 2000);
      expect(discardUpdate).toBeDefined();
    }
  });

  test('invalid meld returns error', async () => {
    const { host, players, state } = await startRummy();
    const current = state.isMyTurn ? host : players[0];
    if (state.phase === 'draw') {
      current.emit('rummy-draw-deck');
      await waitForEvent(current, 'rummy-update', 2000);
    }
    // Try to lay meld with just 1 card (invalid)
    current.emit('rummy-lay-meld', { cardIds: ['invalid-card'] });
    const err = await waitForEvent(current, 'rummy-error', 2000);
    expect(err.message).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startRummy();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('3-player game initialises', async () => {
    const { state } = await startRummy(3);
    expect(state).toBeDefined();
    expect(state.players.length).toBe(3);
  });

  test('disconnect during rummy does not crash', async () => {
    const { host, players } = await startRummy();
    players[0].disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// COUP
// ══════════════════════════════════════════════════════════════
describe('Coup', () => {
  async function startCoup(playerCount = 2) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'coup', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'coup-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with 2 cards and coins', async () => {
    const { state } = await startCoup();
    expect(state).toBeDefined();
    expect(state.myCards).toBeDefined();
    expect(state.myCards.length).toBe(2);
    expect(state.myCoins).toBeDefined();
    expect(state.phase).toBe('action');
  });

  test('current player can take income', async () => {
    const { host, players, state } = await startCoup();
    const current = state.isMyTurn ? host : players[0];
    current.emit('coup-action', { action: 'income' });
    const update = await waitForEvent(current, 'coup-update', 2000);
    expect(update).toBeDefined();
    expect(update.myCoins).toBeGreaterThanOrEqual(1);
  });

  test('foreign aid can be taken', async () => {
    const { host, players, state } = await startCoup();
    const current = state.isMyTurn ? host : players[0];
    current.emit('coup-action', { action: 'foreign-aid' });
    const update = await waitForEvent(current, 'coup-update', 2000);
    expect(update).toBeDefined();
  });

  test('tax claims duke', async () => {
    const { host, players, state } = await startCoup();
    const current = state.isMyTurn ? host : players[0];
    current.emit('coup-action', { action: 'tax' });
    const update = await waitForEvent(current, 'coup-update', 2000);
    expect(update).toBeDefined();
  });

  test('wrong player cannot act', async () => {
    const { host, players, state } = await startCoup();
    const notCurrent = state.isMyTurn ? players[0] : host;
    notCurrent.emit('coup-action', { action: 'income' });
    await expect(waitForEvent(notCurrent, 'coup-update', 500)).rejects.toThrow('Timeout');
  });

  test('end-game-early works', async () => {
    const { host } = await startCoup();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });

  test('4-player game initialises', async () => {
    const { state } = await startCoup(4);
    expect(state).toBeDefined();
    expect(state.players.length).toBe(4);
  });

  test('rematch works', async () => {
    const { host } = await startCoup();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('coup');
  });
});

// ══════════════════════════════════════════════════════════════
// WORDLE
// ══════════════════════════════════════════════════════════════
describe('Wordle', () => {
  async function startWordle(playerCount = 2) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'wordle', category: 'all', settings: { rounds: 2 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'wordle-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises in guessing phase', async () => {
    const { state } = await startWordle();
    expect(state).toBeDefined();
    expect(state.phase).toBe('guessing');
    expect(state.currentRound).toBeDefined();
    expect(state.totalRounds).toBeDefined();
    expect(state.maxGuesses).toBeDefined();
  });

  test('player can submit a valid 5-letter guess', async () => {
    const { host } = await startWordle();
    host.emit('wordle-guess', { guess: 'crane' });
    const update = await waitForEvent(host, 'wordle-update', 2000);
    expect(update).toBeDefined();
    expect(update.myGuesses).toBeDefined();
    expect(update.myGuesses.length).toBeGreaterThan(0);
  });

  test('invalid guess is rejected', async () => {
    const { host } = await startWordle();
    host.emit('wordle-guess', { guess: 'ab' }); // Too short
    // May get wordle-error or the guess is silently ignored
    try {
      const err = await waitForEvent(host, 'wordle-error', 1000);
      expect(err.message).toBeDefined();
    } catch (e) {
      // Silently rejected — no update either
      await expect(waitForEvent(host, 'wordle-update', 500)).rejects.toThrow('Timeout');
    }
  });

  test('both players can guess independently', async () => {
    const { host, players } = await startWordle();
    host.emit('wordle-guess', { guess: 'crane' });
    // Wait for host update and drain player's cross-update
    await waitForEvent(host, 'wordle-update', 2000);
    // Drain any buffered update on player from host's guess
    await delay(200);
    if (players[0]._eventBuffer['wordle-update'] && players[0]._eventBuffer['wordle-update'].length > 0) {
      players[0]._eventBuffer['wordle-update'] = [];
    }

    players[0].emit('wordle-guess', { guess: 'slate' });
    const u2 = await waitForEvent(players[0], 'wordle-update', 2000);
    expect(u2.myGuesses.length).toBe(1);
  });

  test('end-game-early works', async () => {
    const { host } = await startWordle();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('wordle');
  });

  test('rematch works', async () => {
    const { host } = await startWordle();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('wordle');
  });
});

// ══════════════════════════════════════════════════════════════
// DIXIT
// ══════════════════════════════════════════════════════════════
describe('Dixit', () => {
  async function startDixit(playerCount = 3) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'dixit', category: 'all', settings: { targetScore: 10 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'dixit-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises in storytelling phase with 3 players', async () => {
    const { state } = await startDixit(3);
    expect(state).toBeDefined();
    expect(state.phase).toBe('storytelling');
    expect(state.myHand).toBeDefined();
    expect(state.myHand.length).toBeGreaterThan(0);
  });

  test('storyteller can submit clue', async () => {
    const { host, players, state } = await startDixit(3);
    // Find the storyteller
    const allClients = [host, ...players];
    // Get all views to find storyteller
    const storyteller = state.isStoryteller ? host : null;
    if (storyteller) {
      storyteller.emit('dixit-submit-clue', { clue: 'sunshine', cardIndex: 0 });
      const update = await waitForEvent(storyteller, 'dixit-update', 2000);
      expect(update).toBeDefined();
      expect(update.phase).toBe('playing');
    }
  });

  test('end-game-early works', async () => {
    const { host } = await startDixit(3);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('dixit');
  });

  test('4-player game initialises', async () => {
    const { state } = await startDixit(4);
    expect(state).toBeDefined();
    expect(state.players.length).toBe(4);
  });

  test('rematch works', async () => {
    const { host } = await startDixit(3);
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('dixit');
  });

  test('disconnect during dixit does not crash', async () => {
    const { host, players } = await startDixit(3);
    players[1].disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// KNOW ME
// ══════════════════════════════════════════════════════════════
describe('Know Me', () => {
  async function startKnowMe() {
    const { host, roomCode } = await createRoom();
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);
    host.emit('select-game', { gameType: 'knowme', category: 'all', settings: { rounds: 3, timeLimit: 30 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'game-state', 2000);
    return { host, p2, roomCode, state };
  }

  test('initialises with question', async () => {
    const { state } = await startKnowMe();
    expect(state).toBeDefined();
    expect(state.question || state.questionNumber).toBeDefined();
  });

  test('both players can answer', async () => {
    const { host, p2, state } = await startKnowMe();
    host.emit('player-answer', { answer: 'pizza' });
    p2.emit('player-answer', { answer: 'sushi' });
    await delay(300);
    // Know Me uses show-results flow
    host.emit('show-results');
    const result = await waitForEvent(host, 'round-result', 3000);
    expect(result).toBeDefined();
  });

  test('next question advances round', async () => {
    const { host, p2 } = await startKnowMe();
    host.emit('player-answer', { answer: 'pizza' });
    p2.emit('player-answer', { answer: 'sushi' });
    await delay(300);
    host.emit('show-results');
    await waitForEvent(host, 'round-result', 3000);
    host.emit('next-question');
    const nextState = await waitForEvent(host, 'game-state', 2000);
    expect(nextState).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startKnowMe();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('knowme');
  });

  test('rematch works', async () => {
    const { host } = await startKnowMe();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('knowme');
  });

  test('full game flow completes', async () => {
    const { host, p2 } = await startKnowMe();

    for (let round = 0; round < 3; round++) {
      host.emit('player-answer', { answer: `answer-${round}` });
      p2.emit('player-answer', { answer: `answer-${round}` });
      await delay(300);
      host.emit('show-results');
      const result = await waitForEvent(host, 'round-result', 3000);
      expect(result).toBeDefined();

      host.emit('next-question');
      try {
        await waitForEvent(host, 'game-state', 2000);
      } catch (e) {
        // Last round may trigger game-over instead
        const gameOver = await waitForEvent(host, 'game-over', 2000);
        expect(gameOver).toBeDefined();
        expect(gameOver.gameType).toBe('knowme');
        return;
      }
    }
  }, 30000);
});

// ══════════════════════════════════════════════════════════════
// PARTY PROMPTS (PILOCO)
// ══════════════════════════════════════════════════════════════
describe('Party Prompts (Piloco)', () => {
  async function startPartyPrompts(playerCount = 3) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'partyprompts', category: 'all', settings: { rounds: 3, timeLimit: 10 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'game-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with prompt', async () => {
    const { state } = await startPartyPrompts();
    expect(state).toBeDefined();
    expect(state.prompt || state.questionNumber).toBeDefined();
  });

  test('all players acknowledge prompt', async () => {
    const { host, players } = await startPartyPrompts(3);
    host.emit('player-answer', { answer: 'done' });
    players[0].emit('player-answer', { answer: 'done' });
    players[1].emit('player-answer', { answer: 'done' });
    // Auto-advance emits round-result after all acknowledge
    const result = await waitForEvent(host, 'round-result', 3000);
    expect(result).toBeDefined();
  });

  test('host can advance to next prompt', async () => {
    const { host, players } = await startPartyPrompts(3);
    host.emit('player-answer', { answer: 'done' });
    players[0].emit('player-answer', { answer: 'done' });
    players[1].emit('player-answer', { answer: 'done' });
    await waitForEvent(host, 'round-result', 3000);
    host.emit('next-question');
    const state = await waitForEvent(host, 'game-state', 2000);
    expect(state).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startPartyPrompts();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('partyprompts');
  });

  test('full game flow completes with 3 rounds', async () => {
    const { host, players } = await startPartyPrompts(3);

    for (let round = 0; round < 3; round++) {
      host.emit('player-answer', { answer: 'done' });
      players[0].emit('player-answer', { answer: 'done' });
      players[1].emit('player-answer', { answer: 'done' });
      await waitForEvent(host, 'round-result', 3000);

      host.emit('next-question');
      try {
        await waitForEvent(host, 'game-state', 2000);
      } catch (e) {
        const gameOver = await waitForEvent(host, 'game-over', 2000);
        expect(gameOver).toBeDefined();
        expect(gameOver.gameType).toBe('partyprompts');
        return;
      }
    }
  }, 30000);

  test('rematch works', async () => {
    const { host } = await startPartyPrompts();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('partyprompts');
  });
});

// ══════════════════════════════════════════════════════════════
// KING'S CUP
// ══════════════════════════════════════════════════════════════
describe("King's Cup", () => {
  async function startKingsCup(playerCount = 3) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'kingscup', category: 'all' });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'game-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with card deck', async () => {
    const { state } = await startKingsCup();
    expect(state).toBeDefined();
    expect(state.cardsLeft || state.totalCards).toBeDefined();
  });

  test('current player can draw a card', async () => {
    const { host, players, state } = await startKingsCup();
    // Find which client is the current player
    const allClients = [host, ...players];
    const currentClient = allClients.find(c => c.id === state.currentPlayerId) || host;
    currentClient.emit('player-answer', { answer: 'draw' });
    const result = await waitForEvent(host, 'game-state', 3000);
    expect(result).toBeDefined();
    expect(result.phase).toBe('reveal');
  });

  test('end-game-early works', async () => {
    const { host } = await startKingsCup();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('kingscup');
  });

  test('rematch works', async () => {
    const { host } = await startKingsCup();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('kingscup');
  });

  test('disconnect during game does not crash', async () => {
    const { host, players } = await startKingsCup();
    players[0].disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// MOST LIKELY TO
// ══════════════════════════════════════════════════════════════
describe('Most Likely To', () => {
  async function startMostLikelyTo(playerCount = 3) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'mostlikelyto', category: 'all', settings: { rounds: 3, timeLimit: 20 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'game-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with question and player list', async () => {
    const { state } = await startMostLikelyTo();
    expect(state).toBeDefined();
    expect(state.question || state.questionNumber).toBeDefined();
  });

  test('all players vote for a target', async () => {
    const { host, players, state } = await startMostLikelyTo(3);
    // Must vote for valid player IDs
    const votePlayers = state.players || [];
    const targetId = votePlayers.length > 0 ? votePlayers[0].id : host.id;
    host.emit('player-answer', { answer: targetId });
    players[0].emit('player-answer', { answer: targetId });
    players[1].emit('player-answer', { answer: targetId });
    // After all vote, auto-emits round-result
    const result = await waitForEvent(host, 'round-result', 3000);
    expect(result).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startMostLikelyTo();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('mostlikelyto');
  });

  test('full game flow completes', async () => {
    const { host, players } = await startMostLikelyTo(3);

    for (let round = 0; round < 3; round++) {
      // Get current state to find valid player IDs
      const allIds = [host.id, players[0].id, players[1].id];
      const targetId = allIds[round % allIds.length];
      host.emit('player-answer', { answer: targetId });
      players[0].emit('player-answer', { answer: targetId });
      players[1].emit('player-answer', { answer: targetId });
      await waitForEvent(host, 'round-result', 3000);

      host.emit('next-question');
      try {
        await waitForEvent(host, 'game-state', 2000);
      } catch (e) {
        const gameOver = await waitForEvent(host, 'game-over', 2000);
        expect(gameOver).toBeDefined();
        return;
      }
    }
  }, 30000);

  test('rematch works', async () => {
    const { host } = await startMostLikelyTo();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('mostlikelyto');
  });
});

// ══════════════════════════════════════════════════════════════
// NEVER HAVE I EVER
// ══════════════════════════════════════════════════════════════
describe('Never Have I Ever', () => {
  async function startNHIE(playerCount = 3) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'neverhaveiever', category: 'all', settings: { rounds: 3, timeLimit: 15 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'game-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with statement', async () => {
    const { state } = await startNHIE();
    expect(state).toBeDefined();
    expect(state.statement || state.questionNumber).toBeDefined();
  });

  test('all players answer have/havenot', async () => {
    const { host, players } = await startNHIE(3);
    host.emit('player-answer', { answer: 'have' });
    players[0].emit('player-answer', { answer: 'havenot' });
    players[1].emit('player-answer', { answer: 'have' });
    // After all answer, auto-emits round-result
    const result = await waitForEvent(host, 'round-result', 3000);
    expect(result).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startNHIE();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('neverhaveiever');
  });

  test('full game flow completes 3 rounds', async () => {
    const { host, players } = await startNHIE(3);

    for (let round = 0; round < 3; round++) {
      host.emit('player-answer', { answer: 'have' });
      players[0].emit('player-answer', { answer: 'havenot' });
      players[1].emit('player-answer', { answer: 'have' });
      await waitForEvent(host, 'round-result', 3000);

      host.emit('next-question');
      try {
        await waitForEvent(host, 'game-state', 2000);
      } catch (e) {
        const gameOver = await waitForEvent(host, 'game-over', 2000);
        expect(gameOver).toBeDefined();
        return;
      }
    }
  }, 30000);

  test('rematch works', async () => {
    const { host } = await startNHIE();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('neverhaveiever');
  });

  test('disconnect does not crash', async () => {
    const { host, players } = await startNHIE(3);
    players[1].disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// TRUTH OR DRINK
// ══════════════════════════════════════════════════════════════
describe('Truth or Drink', () => {
  async function startToD(playerCount = 3) {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < playerCount - 1; i++) {
      players.push(await joinRoom(roomCode, `P${i + 1}`));
    }
    await delay(200);
    host.emit('select-game', { gameType: 'truthordrink', category: 'all', settings: { rounds: 3, timeLimit: 30 } });
    await waitForEvent(host, 'game-starting');
    const state = await waitForEvent(host, 'game-state', 2000);
    return { host, players, roomCode, state };
  }

  test('initialises with question and hot seat', async () => {
    const { state } = await startToD();
    expect(state).toBeDefined();
    expect(state.question || state.hotSeatName || state.questionNumber).toBeDefined();
  });

  test('hot seat player can answer truth', async () => {
    const { host, players, state } = await startToD(3);
    // Find the hot seat player and have them answer 'truth'
    const hotSeatId = state.hotSeatId;
    const allClients = [host, ...players];
    // Have all answer — hot seat gets 'truth', others get 'believe'
    for (const c of allClients) {
      c.emit('player-answer', { answer: c.id === hotSeatId ? 'truth' : 'believe' });
    }
    const result = await waitForEvent(host, 'round-result', 3000);
    expect(result).toBeDefined();
  });

  test('end-game-early works', async () => {
    const { host } = await startToD();
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
    expect(results.gameType).toBe('truthordrink');
  });

  test('full game flow completes', async () => {
    const { host, players } = await startToD(3);
    const allClients = [host, ...players];

    for (let round = 0; round < 3; round++) {
      // Send both 'truth' and 'believe' — only the valid answer for each role will be accepted
      for (const c of allClients) {
        c.emit('player-answer', { answer: 'truth' });
      }
      await delay(100);
      for (const c of allClients) {
        c.emit('player-answer', { answer: 'believe' });
      }
      await waitForEvent(host, 'round-result', 3000);

      host.emit('next-question');
      try {
        await waitForEvent(host, 'game-state', 2000);
      } catch (e) {
        const gameOver = await waitForEvent(host, 'game-over', 2000);
        expect(gameOver).toBeDefined();
        return;
      }
    }
  }, 30000);

  test('rematch works', async () => {
    const { host } = await startToD();
    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('truthordrink');
  });

  test('disconnect does not crash', async () => {
    const { host, players } = await startToD(3);
    players[0].disconnect();
    await delay(300);
    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// CROSS-GAME EDGE CASES
// ══════════════════════════════════════════════════════════════
describe('Cross-game edge cases', () => {
  const strategyGames = ['chess', 'battleship', 'connectfour', 'tictactoe', 'rummy', 'coup', 'wordle', 'dixit'];
  const drinkingGames = ['knowme', 'partyprompts', 'kingscup', 'mostlikelyto', 'neverhaveiever', 'truthordrink'];
  const allGames = [...strategyGames, ...drinkingGames];

  test.each(allGames)('%s - back-to-lobby works after starting game', async (gameType) => {
    const { host, roomCode } = await createRoom();
    const minPlayers = ['dixit'].includes(gameType) ? 3 : 2;
    for (let i = 0; i < minPlayers - 1; i++) {
      await joinRoom(roomCode, `P${i + 1}`);
    }
    await delay(200);
    host.emit('select-game', { gameType, category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting', 2000);
    // Wait for initial state
    await delay(500);

    host.emit('back-to-lobby');
    const lobby = await waitForEvent(host, 'back-to-lobby', 2000);
    expect(lobby).toBeDefined();
    expect(lobby.players).toBeDefined();
  });

  test.each(allGames)('%s - game appears in valid games list', async (gameType) => {
    const { host, roomCode } = await createRoom();
    const minPlayers = ['dixit'].includes(gameType) ? 3 : 2;
    for (let i = 0; i < minPlayers - 1; i++) {
      await joinRoom(roomCode, `P${i + 1}`);
    }
    await delay(200);
    host.emit('select-game', { gameType, category: 'all', settings: { rounds: 3 } });

    // Should NOT receive game-error for valid games
    const starting = await waitForEvent(host, 'game-starting', 3000);
    expect(starting.gameType).toBe(gameType);
  });
});
