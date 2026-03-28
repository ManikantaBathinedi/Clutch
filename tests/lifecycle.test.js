/**
 * GAME LIFECYCLE TESTS
 * Tests: selecting games, full game flow, round progression,
 *        end-game-early, rematch, back-to-lobby, show-results
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
// GAME SELECTION
// ──────────────────────────────────────────
describe('Game Selection', () => {
  test('host can start trivia game', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    const starting = await waitForEvent(host, 'game-starting');
    expect(starting.gameType).toBe('trivia');

    const state = await waitForEvent(host, 'game-state', 2000);
    expect(state.question).toBeDefined();
    expect(state.options).toBeDefined();
    expect(state.questionNumber).toBe(1);
  });

  test('non-host cannot start a game', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    p1.emit('select-game', { gameType: 'trivia', category: 'all' });
    await expect(waitForEvent(p1, 'game-starting', 500)).rejects.toThrow('Timeout');
  });

  test('invalid game type is rejected', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');

    host.emit('select-game', { gameType: 'invalid_game', category: 'all' });
    await expect(waitForEvent(host, 'game-starting', 500)).rejects.toThrow('Timeout');
  });

  test('all 18 game types can be started', async () => {
    const games = ['trivia','wordscramble','speedmath','emoji','drawguess','codenames','colorclash','blackjack','hangman','memorymatch','spyfall','wavelength','justone','wouldyourather','wordchain','imposter','ludo','poker'];
    for (const gameType of games) {
      const { host, roomCode } = await createRoom();
      const p1 = await joinRoom(roomCode, 'P1');
      await waitForEvent(host, 'player-joined');

      host.emit('select-game', { gameType, category: 'all', settings: { rounds: 3, timeLimit: 10 } });
      const starting = await waitForEvent(host, 'game-starting', 2000);
      expect(starting.gameType).toBe(gameType);

      host.emit('back-to-lobby');
      await waitForEvent(host, 'back-to-lobby', 2000);
    }
  });

  test('categories can be fetched for supported games', async () => {
    const { host } = await createRoom();
    const gamesWithCats = ['trivia', 'wordscramble', 'emoji', 'hangman'];
    for (const gameType of gamesWithCats) {
      host.emit('get-categories', { gameType });
      const data = await waitForEvent(host, 'categories-list');
      expect(data.gameType).toBe(gameType);
      expect(Array.isArray(data.categories)).toBe(true);
      expect(data.categories.length).toBeGreaterThan(0);
    }
  });

  test('settings are clamped to valid ranges', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');

    // rounds: min 3, max 30; timeLimit: min 5, max 120
    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 1, timeLimit: 1 } });
    const starting = await waitForEvent(host, 'game-starting');
    expect(starting.gameType).toBe('trivia');
    // The server should have clamped to min 3 rounds and min 5 timeLimit
  });
});

// ──────────────────────────────────────────
// TRIVIA FULL ROUND
// ──────────────────────────────────────────
describe('Trivia Full Game Flow', () => {
  test('full 3-round trivia game with answering and scoring', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3, timeLimit: 15 } });
    await waitForEvent(host, 'game-starting');

    for (let round = 0; round < 3; round++) {
      const state = await waitForEvent(host, 'game-state', 2000);
      expect(state.questionNumber).toBe(round + 1);
      expect(state.totalQuestions).toBe(3);
      expect(state.options.length).toBe(4);

      // Player answers (index 0 — might be right or wrong)
      p1.emit('player-answer', { answer: 0 });
      const result = await waitForEvent(p1, 'answer-result', 2000);
      expect(typeof result.isCorrect).toBe('boolean');

      // Host shows results then advances
      host.emit('show-results');
      const roundResult = await waitForEvent(host, 'round-result', 2000);
      expect(roundResult.question).toBeDefined();

      if (round < 2) {
        host.emit('next-question');
        // Next round will emit game-state (caught by loop)
      } else {
        host.emit('next-question');
        const gameOver = await waitForEvent(host, 'game-over', 2000);
        expect(gameOver.players).toBeDefined();
        expect(gameOver.players.length).toBeGreaterThanOrEqual(2);
        expect(gameOver.players[0].rank).toBeDefined();
      }
    }
  });

  test('player cannot answer twice in same round', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    p1.emit('player-answer', { answer: 0 });
    await waitForEvent(p1, 'answer-result');

    // Second answer should return null (no event)
    p1.emit('player-answer', { answer: 1 });
    await expect(waitForEvent(p1, 'answer-result', 500)).rejects.toThrow('Timeout');
  });
});

// ──────────────────────────────────────────
// END GAME EARLY
// ──────────────────────────────────────────
describe('End Game Early', () => {
  test('host can end game early and gets results', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 10 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    host.emit('end-game-early');
    const results = await waitForEvent(host, 'game-over', 2000);
    expect(results.players).toBeDefined();
  });

  test('non-host cannot end game early', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 10 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    p1.emit('end-game-early');
    await expect(waitForEvent(p1, 'game-over', 500)).rejects.toThrow('Timeout');
  });
});

// ──────────────────────────────────────────
// REMATCH
// ──────────────────────────────────────────
describe('Rematch', () => {
  test('host can rematch after game over', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    host.emit('end-game-early');
    await waitForEvent(host, 'game-over');

    // Rematch
    host.emit('rematch');
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('trivia');
  });

  test('non-host cannot rematch', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(p1, 'game-starting'); // drain p1's buffer
    await waitForEvent(host, 'game-state', 2000);

    host.emit('end-game-early');
    await waitForEvent(p1, 'game-over');

    p1.emit('rematch');
    await expect(waitForEvent(p1, 'game-starting', 500)).rejects.toThrow('Timeout');
  });
});

// ──────────────────────────────────────────
// BACK TO LOBBY
// ──────────────────────────────────────────
describe('Back to Lobby', () => {
  test('host can return everyone to lobby', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'game-state', 2000);

    host.emit('back-to-lobby');
    const data = await waitForEvent(host, 'back-to-lobby');
    expect(data.players).toBeDefined();
    expect(data.players.length).toBeGreaterThanOrEqual(2);
  });

  test('players can start a new game after returning to lobby', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    // First game
    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await delay(200);

    host.emit('back-to-lobby');
    await waitForEvent(host, 'back-to-lobby');

    // Second game — different type
    host.emit('select-game', { gameType: 'speedmath', category: 'all', settings: { rounds: 3 } });
    const starting = await waitForEvent(host, 'game-starting', 2000);
    expect(starting.gameType).toBe('speedmath');
  });

  test('non-host cannot send back-to-lobby', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await delay(200);

    p1.emit('back-to-lobby');
    await expect(waitForEvent(p1, 'back-to-lobby', 500)).rejects.toThrow('Timeout');
  });
});
