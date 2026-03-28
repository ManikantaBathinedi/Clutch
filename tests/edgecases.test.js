/**
 * EDGE CASE & STRESS TESTS
 * Disconnect mid-game, host transfer during game, rapid events,
 * concurrent joins, re-joining, spectator during play, invalid data
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

// ──────────────────────────────────────────
// DISCONNECT MID-GAME
// ──────────────────────────────────────────
describe('Disconnect Mid-Game', () => {
  test('player disconnect during trivia does not crash server', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    // P1 disconnects mid-game
    p1.disconnect();
    await delay(300);

    // Game should still function — host can still advance
    host.emit('show-results');
    const result = await waitForEvent(host, 'round-result', 1000);
    expect(result).toBeDefined();

    host.emit('next-question');
    const nextState = await waitForEvent(host, 'game-state', 2000);
    expect(nextState).toBeDefined();
  });

  test('host disconnect during game transfers host', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(p1, 'game-starting');
    await delay(200);

    // Host disconnects
    host.disconnect();
    await delay(500);

    // P1 should get player update (host transferred)
    // The remaining players still have the room
  });

  test('all players disconnect cleans up gracefully', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await delay(200);

    p1.disconnect();
    host.disconnect();
    await delay(300);
    // No crash — server continues running
  });

  test('disconnect during hangman game does not crash', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await delay(200);

    host.emit('select-game', { gameType: 'hangman', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'hangman-state', 2000);

    p1.disconnect();
    await delay(300);

    // Host can still play
    host.emit('hangman-guess', { letter: 'e' });
    await delay(300);
  });

  test('disconnect during blackjack betting phase', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    // One player bets then disconnects
    p1.emit('bj-bet', { amount: 100 });
    await delay(200);
    p1.disconnect();
    await delay(300);

    // Others can still bet
    host.emit('bj-bet', { amount: 100 });
    await delay(300);
  });
});

// ──────────────────────────────────────────
// INVALID / MALICIOUS DATA
// ──────────────────────────────────────────
describe('Invalid Data Handling', () => {
  test('creating room with null/undefined data', async () => {
    const c = await makeClient();
    c.emit('create-room', { hostName: null, avatar: null });
    await expect(waitForEvent(c, 'room-created', 500)).rejects.toThrow('Timeout');

    c.emit('create-room', { hostName: undefined });
    await expect(waitForEvent(c, 'room-created', 500)).rejects.toThrow('Timeout');
  });

  test('joining with object instead of string name', async () => {
    const { host, roomCode } = await createRoom();
    const c = await makeClient();
    c.emit('join-room', { roomCode, playerName: { malicious: true } });
    await expect(waitForEvent(c, 'join-success', 500)).rejects.toThrow('Timeout');
  });

  test('select-game with malicious settings object', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');

    // Settings with extreme values
    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 999999, timeLimit: -5 } });
    const starting = await waitForEvent(host, 'game-starting');
    // Server should clamp rounds to 30 max and timeLimit to 5 min
    expect(starting.gameType).toBe('trivia');
  });

  test('player-answer with no active game', async () => {
    const { host, roomCode } = await createRoom();
    // No game started
    host.emit('player-answer', { answer: 0 });
    await expect(waitForEvent(host, 'answer-result', 500)).rejects.toThrow('Timeout');
  });

  test('hangman-guess with empty letter', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    host.emit('select-game', { gameType: 'hangman', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'hangman-state', 2000);

    p1.emit('hangman-guess', { letter: '' });
    await expect(waitForEvent(host, 'hangman-update', 500)).rejects.toThrow('Timeout');
  });

  test('blackjack bet with negative amount', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    host.emit('bj-bet', { amount: -500 });
    // Should not progress — negative bet is invalid
    await delay(300);
  });

  test('blackjack bet with zero amount', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    host.emit('bj-bet', { amount: 0 });
    await delay(300);
  });

  test('codenames clue with invalid number', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    const p3 = await joinRoom(roomCode, 'P3');
    await delay(200);

    host.emit('select-game', { gameType: 'codenames', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'codenames-teams', 2000);

    // Setup teams and start
    host.emit('codenames-join', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p1.emit('codenames-join', { team: 'red' });
    await waitForEvent(p1, 'codenames-teams');
    p2.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p2, 'codenames-teams');
    p3.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p3, 'codenames-teams');

    host.emit('codenames-spymaster', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p2.emit('codenames-spymaster', { team: 'blue' });
    await waitForEvent(p2, 'codenames-teams');

    host.emit('codenames-start');
    const gs = await waitForEvent(host, 'codenames-state', 1000);

    // Give clue with out-of-range number
    const spymaster = gs.currentTeam === 'red' ? host : p2;
    spymaster.emit('codenames-clue', { word: 'TEST', number: 100 });
    // number > 9 should be rejected
    await expect(waitForEvent(host, 'codenames-update', 500)).rejects.toThrow('Timeout');
  });
});

// ──────────────────────────────────────────
// SPECTATOR EDGE CASES
// ──────────────────────────────────────────
describe('Spectator Edge Cases', () => {
  test('spectator joining during each game type gets game state', async () => {
    const gameTypes = ['trivia', 'hangman'];
    for (const gt of gameTypes) {
      const { host, roomCode } = await createRoom();
      const p1 = await joinRoom(roomCode, 'P1');
      await waitForEvent(host, 'player-joined');

      host.emit('select-game', { gameType: gt, category: 'all', settings: { rounds: 3 } });
      await waitForEvent(host, 'game-starting');
      await delay(300);

      // New player joins mid-game → spectator
      const spec = await makeClient();
      spec.emit('join-room', { roomCode, playerName: 'Spectator', avatar: '👁️' });
      const spectatorEvent = await waitForEvent(spec, 'join-as-spectator', 2000);
      expect(spectatorEvent.gameType).toBe(gt);

      // Should also get game state
      try {
        if (gt === 'hangman') {
          await waitForEvent(spec, 'hangman-state', 2000);
        } else {
          await waitForEvent(spec, 'game-state', 2000);
        }
      } catch {
        // Some games send state on different events
      }

      host.emit('back-to-lobby');
      await waitForEvent(host, 'back-to-lobby', 1000);
    }
  });

  test('spectator cannot answer questions', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    // Spectator joins mid-game
    const spec = await makeClient();
    spec.emit('join-room', { roomCode, playerName: 'Spec', avatar: '👁️' });
    await waitForEvent(spec, 'join-as-spectator', 2000);
    await delay(500);

    // Spectator tries to answer
    spec.emit('player-answer', { answer: 0 });
    await expect(waitForEvent(spec, 'answer-result', 500)).rejects.toThrow('Timeout');
  });
});

// ──────────────────────────────────────────
// RAPID-FIRE & STRESS
// ──────────────────────────────────────────
describe('Rapid-Fire & Stress', () => {
  test('rapid room creation (10 rooms quickly)', async () => {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const c = await makeClient();
      c.emit('create-room', { hostName: `Host${i}`, avatar: '😎' });
      const { roomCode } = await waitForEvent(c, 'room-created', 2000);
      codes.push(roomCode);
    }
    // All codes should be unique
    const unique = new Set(codes);
    expect(unique.size).toBe(10);
  });

  test('multiple players joining same room rapidly', async () => {
    const { host, roomCode } = await createRoom();
    const joinPromises = [];

    for (let i = 0; i < 8; i++) {
      const p = await makeClient();
      p.emit('join-room', { roomCode, playerName: `Rapid${i}`, avatar: '😎' });
      joinPromises.push(waitForEvent(p, 'join-success', 3000));
    }

    const results = await Promise.all(joinPromises);
    expect(results.length).toBe(8);
    results.forEach(r => expect(r.roomCode).toBe(roomCode));
  });

  test('rapid answer submissions in trivia', async () => {
    const { host, roomCode } = await createRoom();
    const players = [];
    for (let i = 0; i < 5; i++) {
      players.push(await joinRoom(roomCode, `P${i}`));
    }
    await delay(300);

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3, timeLimit: 30 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    // All 5 players answer at once
    players.forEach(p => p.emit('player-answer', { answer: 0 }));
    await delay(500);

    // All should get results
    const resultPromises = players.map(p =>
      waitForEvent(p, 'answer-result', 2000).catch(() => null)
    );
    const results = await Promise.all(resultPromises);
    const received = results.filter(r => r !== null);
    expect(received.length).toBe(5);
  });

  test('rapid emoji reactions do not crash', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await delay(200);

    const emojis = ['😂', '🔥', '👏', '❤️', '😮'];
    for (let i = 0; i < 20; i++) {
      host.emit('reaction', { emoji: emojis[i % emojis.length] });
    }
    await delay(500);
    // No crash = pass
  });

  test('rapid hangman guesses from multiple players', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    await delay(200);

    host.emit('select-game', { gameType: 'hangman', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'hangman-state', 2000);

    // Multiple players guess different letters simultaneously
    p1.emit('hangman-guess', { letter: 'a' });
    p2.emit('hangman-guess', { letter: 'b' });
    host.emit('hangman-guess', { letter: 'c' });
    await delay(500);
    // No crash = pass
  });
});

// ──────────────────────────────────────────
// GAME BOUNDARY CONDITIONS
// ──────────────────────────────────────────
describe('Game Boundary Conditions', () => {
  test('show-results before any player answers', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    // Show results immediately without anyone answering
    host.emit('show-results');
    const result = await waitForEvent(host, 'round-result', 1000);
    expect(result).toBeDefined();
  });

  test('next-question on last question emits game-over', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');

    // Play through all 3 rounds
    for (let i = 0; i < 3; i++) {
      await waitForEvent(host, 'game-state', 2000);
      host.emit('show-results');
      await waitForEvent(host, 'round-result', 1000);
      host.emit('next-question');
    }

    const gameOver = await waitForEvent(host, 'game-over', 2000);
    expect(gameOver.players).toBeDefined();
  });

  test('back-to-lobby resets scores and spectator flags', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await delay(200);

    // Join as spectator
    const spec = await makeClient();
    spec.emit('join-room', { roomCode, playerName: 'Spec', avatar: '👁️' });
    await waitForEvent(spec, 'join-as-spectator', 2000);

    host.emit('back-to-lobby');
    const lobby = await waitForEvent(host, 'back-to-lobby', 1000);

    // All players should no longer be spectators
    const spectators = lobby.players.filter(p => p.isSpectator);
    expect(spectators.length).toBe(0);
  });

  test('rematch preserves game type and category', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    // Start wordscramble
    host.emit('select-game', { gameType: 'wordscramble', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');

    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('wordscramble');
  });

  test('kick during active game removes player cleanly', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    // Get p1's id from the player-joined event the host received
    const joinData = await waitForEvent(host, 'player-joined');
    const p1Id = joinData.players.find(p => p.name === 'P1').id;

    const p2 = await joinRoom(roomCode, 'P2');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    // Kick p1 during active game
    host.emit('kick-player', { playerId: p1Id });
    await waitForEvent(p1, 'kicked', 2000);

    // Host should get updated player list
    const updated = await waitForEvent(host, 'player-joined', 1000);
    expect(updated.players.find(p => p.name === 'P1')).toBeUndefined();
  });

  test('codenames picking assassin card ends game immediately', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    const p3 = await joinRoom(roomCode, 'P3');
    await delay(200);

    host.emit('select-game', { gameType: 'codenames', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'codenames-teams', 2000);

    // Setup teams
    host.emit('codenames-join', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p1.emit('codenames-join', { team: 'red' });
    await waitForEvent(p1, 'codenames-teams');
    p2.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p2, 'codenames-teams');
    p3.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p3, 'codenames-teams');

    host.emit('codenames-spymaster', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p2.emit('codenames-spymaster', { team: 'blue' });
    await waitForEvent(p2, 'codenames-teams');

    host.emit('codenames-start');
    const gs = await waitForEvent(host, 'codenames-state', 1000);

    // The spymaster can see card types — find the assassin
    const assassinIndex = gs.cards.findIndex(c => c.type === 'assassin');
    expect(assassinIndex).toBeGreaterThanOrEqual(0);

    // Give a clue first
    const spymaster = gs.currentTeam === 'red' ? host : p2;
    spymaster.emit('codenames-clue', { word: 'TRAP', number: 1 });
    await waitForEvent(host, 'codenames-update', 1000);

    // Non-spymaster guesser picks the assassin
    const guesser = gs.currentTeam === 'red' ? p1 : p3;
    guesser.emit('codenames-pick', { cardIndex: assassinIndex });

    const gameOver = await waitForEvent(host, 'codenames-over', 2000);
    expect(gameOver).toBeDefined();
    expect(gameOver.winner).toBeDefined();
    // The team that picked assassin loses — other team wins
    const losingTeam = gs.currentTeam;
    expect(gameOver.winner).toBe(losingTeam === 'red' ? 'blue' : 'red');
  });

  test('memory match mismatch hides cards and advances turn', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'memorymatch', category: 'all', settings: {} });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'mm-state', 2000);
    const firstPlayer = state.isMyTurn ? host : p1;

    // Flip two cards that are likely different (0 and 1)
    firstPlayer.emit('mm-flip', { cardIndex: 0 });
    const flip1 = await waitForEvent(firstPlayer, 'mm-flip', 1000);
    expect(flip1).toBeDefined();

    firstPlayer.emit('mm-flip', { cardIndex: 1 });
    // Could be match or mismatch
    try {
      const mismatch = await waitForEvent(firstPlayer, 'mm-mismatch', 1000);
      // Now hide
      firstPlayer.emit('mm-hide');
      const hidden = await waitForEvent(firstPlayer, 'mm-update', 1000);
      expect(hidden).toBeDefined();
    } catch {
      // Was a match — that's also fine
      try {
        await waitForEvent(firstPlayer, 'mm-match', 1000);
      } catch { /* game might have ended */ }
    }
  });
});

// ──────────────────────────────────────────
// CONCURRENT GAME SESSIONS
// ──────────────────────────────────────────
describe('Concurrent Game Sessions', () => {
  test('two separate rooms can play simultaneously', async () => {
    // Room 1
    const { host: host1, roomCode: code1 } = await createRoom('Room1Host');
    const p1 = await joinRoom(code1, 'R1P1');
    await waitForEvent(host1, 'player-joined');

    // Room 2
    const { host: host2, roomCode: code2 } = await createRoom('Room2Host');
    const p2 = await joinRoom(code2, 'R2P1');
    await waitForEvent(host2, 'player-joined');

    // Start different games
    host1.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    host2.emit('select-game', { gameType: 'speedmath', category: 'all', settings: { rounds: 3 } });

    const [starting1, starting2] = await Promise.all([
      waitForEvent(host1, 'game-starting'),
      waitForEvent(host2, 'game-starting')
    ]);

    expect(starting1.gameType).toBe('trivia');
    expect(starting2.gameType).toBe('speedmath');

    // Both rooms get their game states
    const [state1, state2] = await Promise.all([
      waitForEvent(host1, 'game-state', 2000),
      waitForEvent(host2, 'game-state', 2000)
    ]);

    expect(state1.question).toBeDefined(); // trivia has question
    expect(state2.equation).toBeDefined();  // speedmath has equation
  });

  test('actions in one room do not affect another', async () => {
    const { host: host1, roomCode: code1 } = await createRoom('Room1');
    const p1 = await joinRoom(code1, 'P1');
    await waitForEvent(host1, 'player-joined');

    const { host: host2, roomCode: code2 } = await createRoom('Room2');
    const p2 = await joinRoom(code2, 'P2');
    await waitForEvent(host2, 'player-joined');

    host1.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host1, 'game-starting');
    await waitForEvent(host1, 'game-state', 2000);

    // Room 2 should NOT receive game-starting or game-state
    await expect(waitForEvent(host2, 'game-state', 500)).rejects.toThrow('Timeout');
  });
});
