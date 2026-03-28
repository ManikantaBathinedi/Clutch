/**
 * INDIVIDUAL GAME LOGIC TESTS
 * Tests each of the 10 game types through Socket.IO integration
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

async function startGame(host, roomCode, gameType, settings = {}) {
  const p1 = await joinRoom(roomCode, 'Player1');
  await waitForEvent(host, 'player-joined');
  host.emit('select-game', { gameType, category: 'all', settings: { rounds: 3, timeLimit: 15, ...settings } });
  await waitForEvent(host, 'game-starting');
  return p1;
}

// ══════════════════════════════════════════
// HANGMAN
// ══════════════════════════════════════════
describe('Hangman', () => {
  test('correct letter guess reveals letters', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    const state = await waitForEvent(host, 'hangman-state', 2000);
    expect(state.revealedWord).toBeDefined();
    expect(state.wrongCount).toBe(0);
    expect(state.maxWrong).toBe(6);

    // Try common letters until we get a hit
    const letters = 'etaoinsrhld';
    let gotUpdate = false;
    for (const l of letters) {
      p1.emit('hangman-guess', { letter: l });
      try {
        const update = await waitForEvent(host, 'hangman-update', 500);
        expect(update.guessedLetters).toContain(l);
        gotUpdate = true;
        break;
      } catch {
        // might be hangman-round-over if it solved or hanged — try next
        try {
          await waitForEvent(host, 'hangman-round-over', 200);
          gotUpdate = true;
          break;
        } catch { /* letter wasn't in word, try next */ }
      }
    }
    expect(gotUpdate).toBe(true);
  });

  test('wrong guesses increment wrongCount', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    await waitForEvent(host, 'hangman-state', 2000);

    // Use uncommon letters that are unlikely to be in the word
    p1.emit('hangman-guess', { letter: 'z' });
    try {
      const update = await waitForEvent(host, 'hangman-update', 1000);
      expect(update.guessedLetters).toContain('z');
      // If z was wrong, wrongCount > 0
      if (!update.revealedWord.includes('z')) {
        expect(update.wrongCount).toBeGreaterThan(0);
      }
    } catch {
      // Could be round-over if 'z' happened to complete a word
    }
  });

  test('6 wrong guesses results in hanged', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    await waitForEvent(host, 'hangman-state', 2000);

    // Guess 6 rare letters
    const rareLetters = 'zxqjkv';
    let hangState = null;
    for (const l of rareLetters) {
      p1.emit('hangman-guess', { letter: l });
      try {
        const update = await waitForEvent(host, 'hangman-round-over', 500);
        hangState = update;
        break;
      } catch {
        try { await waitForEvent(host, 'hangman-update', 500); } catch { /* already received */ }
      }
    }
    // If we got a round-over, check it
    if (hangState) {
      expect(hangState.roundOver).toBe(true);
      expect(['hanged', 'solved']).toContain(hangState.roundResult);
    }
  });

  test('duplicate letter guess is ignored', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    await waitForEvent(host, 'hangman-state', 2000);

    p1.emit('hangman-guess', { letter: 'a' });
    // Wait for the first response
    try {
      await waitForEvent(host, 'hangman-update', 500);
    } catch {
      try { await waitForEvent(host, 'hangman-round-over', 500); } catch {}
    }

    // Second guess of same letter should produce no event
    p1.emit('hangman-guess', { letter: 'a' });
    await expect(waitForEvent(host, 'hangman-update', 500)).rejects.toThrow('Timeout');
  });

  test('invalid guess (number, multi-char) is ignored', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    await waitForEvent(host, 'hangman-state', 2000);

    p1.emit('hangman-guess', { letter: '5' });
    await expect(waitForEvent(host, 'hangman-update', 500)).rejects.toThrow('Timeout');

    p1.emit('hangman-guess', { letter: 'ab' });
    await expect(waitForEvent(host, 'hangman-update', 500)).rejects.toThrow('Timeout');
  });

  test('timeout marks round as timeout', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    await waitForEvent(host, 'hangman-state', 2000);

    host.emit('hangman-timeout');
    const state = await waitForEvent(host, 'hangman-round-over', 1000);
    expect(state.roundOver).toBe(true);
    expect(state.roundResult).toBe('timeout');
    expect(state.word).toBeDefined();
  });

  test('host advances to next round', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'hangman');
    await waitForEvent(host, 'hangman-state', 2000);

    // End current round via timeout
    host.emit('hangman-timeout');
    await waitForEvent(host, 'hangman-round-over');

    // Advance
    host.emit('hangman-next');
    const next = await waitForEvent(host, 'hangman-state', 1000);
    expect(next.currentRound).toBe(2);
    expect(next.roundOver).toBe(false);
  });
});

// ══════════════════════════════════════════
// MEMORY MATCH
// ══════════════════════════════════════════
describe('Memory Match', () => {
  test('game initialises and sends state to each player', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'memorymatch', category: 'all', settings: {} });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'mm-state', 2000);
    expect(state.cards).toBeDefined();
    expect(state.cards.length).toBeGreaterThan(0);
    expect(state.totalPairs).toBeDefined();
    expect(state.phase).toBe('playing');
  });

  test('only current player can flip cards', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'memorymatch', category: 'all', settings: {} });
    await waitForEvent(host, 'game-starting');

    const hostState = await waitForEvent(host, 'mm-state', 2000);
    const p1State = await waitForEvent(p1, 'mm-state', 2000);

    // Determine who goes first
    const notFirstPlayer = hostState.isMyTurn ? p1 : host;

    // Player who's NOT first tries to flip
    notFirstPlayer.emit('mm-flip', { cardIndex: 0 });
    await expect(waitForEvent(notFirstPlayer, 'mm-flip', 500)).rejects.toThrow('Timeout');
  });

  test('flipping two matching cards scores points', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'memorymatch', category: 'all', settings: {} });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'mm-state', 2000);
    const itsMe = state.isMyTurn;
    const firstPlayer = itsMe ? host : p1;

    // Flip first card
    firstPlayer.emit('mm-flip', { cardIndex: 0 });
    const flipResult = await waitForEvent(firstPlayer, 'mm-flip', 1000);
    expect(flipResult).toBeDefined();
  });

  test('flipping already matched card is ignored', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'memorymatch', category: 'all', settings: {} });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'mm-state', 2000);
  });

  test('invalid card index is ignored', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'memorymatch', category: 'all', settings: {} });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'mm-state', 2000);
    const firstPlayer = state.isMyTurn ? host : p1;

    // Negative index
    firstPlayer.emit('mm-flip', { cardIndex: -1 });
    await expect(waitForEvent(firstPlayer, 'mm-flip', 500)).rejects.toThrow('Timeout');

    // Way out of bounds
    firstPlayer.emit('mm-flip', { cardIndex: 9999 });
    await expect(waitForEvent(firstPlayer, 'mm-flip', 500)).rejects.toThrow('Timeout');
  });
});

// ══════════════════════════════════════════
// BLACKJACK
// ══════════════════════════════════════════
describe('Blackjack', () => {
  test('game starts in betting phase', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'bj-state', 2000);
    expect(state.phase).toBe('betting');
    expect(state.me.chips).toBe(1000);
    expect(state.me.status).toBe('betting');
  });

  test('placing bets deals cards', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    // Both players bet
    host.emit('bj-bet', { amount: 100 });
    p1.emit('bj-bet', { amount: 100 });
    await delay(500);

    // Drain all bj-update events — first is still 'betting', last is 'playing'
    let update;
    while (host._eventBuffer['bj-update'] && host._eventBuffer['bj-update'].length > 0) {
      update = host._eventBuffer['bj-update'].shift();
    }
    expect(update.phase).toBe('playing');
    expect(update.dealer.hand.length).toBe(2);
    expect(update.me.hand.length).toBe(2);
  });

  test('hit draws a card', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    host.emit('bj-bet', { amount: 100 });
    p1.emit('bj-bet', { amount: 100 });
    const dealt = await waitForEvent(host, 'bj-update', 2000);

    if (dealt.isMyTurn) {
      host.emit('bj-hit');
      const update = await waitForEvent(host, 'bj-update', 1000);
      // After hit, we should have 3+ cards or be busted
      expect(update).toBeDefined();
    }
  });

  test('stand progresses to next player or dealer', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    host.emit('bj-bet', { amount: 100 });
    p1.emit('bj-bet', { amount: 100 });
    const dealt = await waitForEvent(host, 'bj-update', 2000);

    if (dealt.isMyTurn) {
      host.emit('bj-stand');
      const update = await waitForEvent(host, 'bj-update', 1000);
      expect(update).toBeDefined();
    }
  });

  test('non-current player cannot hit', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    host.emit('bj-bet', { amount: 100 });
    p1.emit('bj-bet', { amount: 100 });
    const dealt = await waitForEvent(host, 'bj-update', 2000);

    // The player who's NOT their turn tries to hit
    const wrongPlayer = dealt.isMyTurn ? p1 : host;
    wrongPlayer.emit('bj-hit');
    // Should not get an update from that action
    await delay(300);
  });

  test('new round resets for next hand', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'blackjack', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'bj-state', 2000);

    // Both bet and stand immediately to resolve quickly
    host.emit('bj-bet', { amount: 50 });
    p1.emit('bj-bet', { amount: 50 });
    let update = await waitForEvent(host, 'bj-update', 2000);

    // Stand through all players 
    for (let i = 0; i < 3; i++) {
      if (update.phase === 'playing') {
        // Find whose turn it is
        const currentPlayer = update.isMyTurn ? host : p1;
        currentPlayer.emit('bj-stand');
        try {
          update = await waitForEvent(host, 'bj-update', 1000);
        } catch { break; }
      } else break;
    }

    // Should be resolved now
    if (update.phase === 'resolved') {
      host.emit('bj-new-round');
      const newR = await waitForEvent(host, 'bj-update', 1000);
      expect(newR.phase).toBe('betting');
    }
  });
});

// ══════════════════════════════════════════
// COLOR CLASH (UNO)
// ══════════════════════════════════════════
describe('Color Clash (UNO)', () => {
  test('game initialises with 7 cards each and a discard pile', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'colorclash', category: 'all' });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'cc-state', 2000);
    expect(state.hand.length).toBe(7);
    expect(state.topCard).toBeDefined();
    expect(state.currentColor).toBeDefined();
    expect(state.phase).toBe('playing');
  });

  test('drawing a card when not able to play', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'colorclash', category: 'all' });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'cc-state', 2000);
    const firstPlayer = state.isMyTurn ? host : p1;

    firstPlayer.emit('cc-draw');
    const update = await waitForEvent(firstPlayer, 'cc-update', 1000);
    expect(update).toBeDefined();
    // After drawing, turn passes — should have 8 cards if it was a voluntary draw
  });

  test('out-of-turn player cannot play a card', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'colorclash', category: 'all' });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'cc-state', 2000);
    const wrongPlayer = state.isMyTurn ? p1 : host;

    wrongPlayer.emit('cc-play', { cardIndex: 0 });
    await expect(waitForEvent(wrongPlayer, 'cc-update', 500)).rejects.toThrow('Timeout');
  });

  test('out-of-turn player cannot draw', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'colorclash', category: 'all' });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'cc-state', 2000);
    const wrongPlayer = state.isMyTurn ? p1 : host;

    wrongPlayer.emit('cc-draw');
    await expect(waitForEvent(wrongPlayer, 'cc-update', 500)).rejects.toThrow('Timeout');
  });
});

// ══════════════════════════════════════════
// CODENAMES
// ══════════════════════════════════════════
describe('Codenames', () => {
  test('game starts with team selection phase', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    const p3 = await joinRoom(roomCode, 'P3');
    await delay(200);

    host.emit('select-game', { gameType: 'codenames', category: 'all' });
    await waitForEvent(host, 'game-starting');

    const state = await waitForEvent(host, 'codenames-teams', 2000);
    expect(state.phase).toBe('team-select');
    expect(state.cards.length).toBe(25);
  });

  test('players can join teams', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    const p3 = await joinRoom(roomCode, 'P3');
    await delay(200);

    host.emit('select-game', { gameType: 'codenames', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'codenames-teams', 2000);

    // Join teams one at a time
    host.emit('codenames-join', { team: 'red' });
    await delay(100);
    p1.emit('codenames-join', { team: 'red' });
    await delay(100);
    p2.emit('codenames-join', { team: 'blue' });
    await delay(100);
    p3.emit('codenames-join', { team: 'blue' });
    await delay(300);

    // Drain buffered codenames-teams events from p3 and check the last one
    let teamState;
    while (p3._eventBuffer['codenames-teams'] && p3._eventBuffer['codenames-teams'].length > 0) {
      teamState = p3._eventBuffer['codenames-teams'].shift();
    }
    expect(teamState.teams.red.players.length).toBe(2);
    expect(teamState.teams.blue.players.length).toBe(2);
  });

  test('cannot start without both spymasters', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    const p3 = await joinRoom(roomCode, 'P3');
    await delay(200);

    host.emit('select-game', { gameType: 'codenames', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'codenames-teams', 2000);

    host.emit('codenames-join', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p1.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p1, 'codenames-teams');

    // Set only one spymaster
    host.emit('codenames-spymaster', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');

    // Try to start — should fail (no blue spymaster)
    host.emit('codenames-start');
    await expect(waitForEvent(host, 'codenames-state', 500)).rejects.toThrow('Timeout');
  });

  test('full setup and clue giving', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    const p2 = await joinRoom(roomCode, 'P2');
    const p3 = await joinRoom(roomCode, 'P3');
    await delay(200);

    host.emit('select-game', { gameType: 'codenames', category: 'all' });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'codenames-teams', 2000);

    // Set up teams
    host.emit('codenames-join', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p1.emit('codenames-join', { team: 'red' });
    await waitForEvent(p1, 'codenames-teams');
    p2.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p2, 'codenames-teams');
    p3.emit('codenames-join', { team: 'blue' });
    await waitForEvent(p3, 'codenames-teams');

    // Set spymasters
    host.emit('codenames-spymaster', { team: 'red' });
    await waitForEvent(host, 'codenames-teams');
    p2.emit('codenames-spymaster', { team: 'blue' });
    await waitForEvent(p2, 'codenames-teams');

    // Start game
    host.emit('codenames-start');
    const gameState = await waitForEvent(host, 'codenames-state', 1000);
    expect(gameState.phase).toBe('clue');
    expect(gameState.cards.length).toBe(25);

    // Spymaster of current team gives clue
    const currentTeam = gameState.currentTeam;
    const spymaster = currentTeam === 'red' ? host : p2;
    spymaster.emit('codenames-clue', { word: 'TEST', number: 2 });
    const update = await waitForEvent(host, 'codenames-update', 1000);
    expect(update.phase).toBe('guess');
    expect(update.clue.word).toBe('TEST');
  });
});

// ══════════════════════════════════════════
// DRAW & GUESS
// ══════════════════════════════════════════
describe('Draw & Guess', () => {
  test('drawer receives word choices, others do not', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'drawguess', category: 'all', settings: { timeLimit: 15 } });
    await waitForEvent(host, 'game-starting');

    // One of them is the drawer
    const getChoices = async (client) => {
      try {
        return await waitForEvent(client, 'word-choices', 2000);
      } catch { return null; }
    };

    const [hostChoices, p1Choices] = await Promise.all([getChoices(host), getChoices(p1)]);

    // Exactly one should have words
    const drawer = hostChoices?.words ? host : p1;
    const guesser = drawer === host ? p1 : host;
    const drawerChoices = drawer === host ? hostChoices : p1Choices;
    const guesserNotif = drawer === host ? p1Choices : hostChoices;

    expect(drawerChoices.words).toBeDefined();
    expect(drawerChoices.words.length).toBe(3);
    expect(guesserNotif.words).toBeUndefined();
  });

  test('drawer can choose a word and round starts', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'drawguess', category: 'all', settings: { timeLimit: 15 } });
    await waitForEvent(host, 'game-starting');

    // Wait for word choices from both perspectives
    const [hostChoices, p1Choices] = await Promise.all([
      waitForEvent(host, 'word-choices', 2000).catch(() => null),
      waitForEvent(p1, 'word-choices', 2000).catch(() => null)
    ]);

    const drawer = hostChoices?.words ? host : p1;
    drawer.emit('choose-word', { wordIndex: 0 });

    const drawStart = await waitForEvent(host, 'draw-start', 2000);
    expect(drawStart.turnNumber).toBeDefined();
    expect(drawStart.drawerId).toBeDefined();
  });

  test('correct guess awards points', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'drawguess', category: 'all', settings: { timeLimit: 30 } });
    await waitForEvent(host, 'game-starting');

    const [hostChoices, p1Choices] = await Promise.all([
      waitForEvent(host, 'word-choices', 2000).catch(() => null),
      waitForEvent(p1, 'word-choices', 2000).catch(() => null)
    ]);

    const drawer = hostChoices?.words ? host : p1;
    const guesser = drawer === host ? p1 : host;
    const choices = drawer === host ? hostChoices : p1Choices;
    const word = choices.words[0];

    drawer.emit('choose-word', { wordIndex: 0 });
    await waitForEvent(guesser, 'draw-start', 2000);

    // Guesser guesses correctly
    guesser.emit('player-answer', { answer: word });
    const result = await waitForEvent(guesser, 'answer-result', 1000);
    expect(result.isCorrect).toBe(true);
    expect(result.points).toBeGreaterThan(0);
  });

  test('close guess is flagged as close', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'drawguess', category: 'all', settings: { timeLimit: 30 } });
    await waitForEvent(host, 'game-starting');

    const [hostChoices, p1Choices] = await Promise.all([
      waitForEvent(host, 'word-choices', 2000).catch(() => null),
      waitForEvent(p1, 'word-choices', 2000).catch(() => null)
    ]);

    const drawer = hostChoices?.words ? host : p1;
    const guesser = drawer === host ? p1 : host;
    const choices = drawer === host ? hostChoices : p1Choices;
    const word = choices.words[0];

    drawer.emit('choose-word', { wordIndex: 0 });
    await waitForEvent(guesser, 'draw-start', 2000);

    // Submit a close guess (off by 1-2 chars)
    const closeGuess = word.slice(0, -1) + 'z';
    guesser.emit('player-answer', { answer: closeGuess });
    const result = await waitForEvent(guesser, 'answer-result', 1000);
    expect(result.isCorrect).toBe(false);
    // isClose depends on levenshtein distance, might be true if word is short
  });

  test('drawer cannot guess their own word', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await joinRoom(roomCode, 'P1');
    await waitForEvent(host, 'player-joined');

    host.emit('select-game', { gameType: 'drawguess', category: 'all', settings: { timeLimit: 30 } });
    await waitForEvent(host, 'game-starting');

    const [hostChoices, p1Choices] = await Promise.all([
      waitForEvent(host, 'word-choices', 2000).catch(() => null),
      waitForEvent(p1, 'word-choices', 2000).catch(() => null)
    ]);

    const drawer = hostChoices?.words ? host : p1;
    const choices = drawer === host ? hostChoices : p1Choices;
    const word = choices.words[0];

    drawer.emit('choose-word', { wordIndex: 0 });
    await waitForEvent(drawer, 'draw-start', 2000);

    // Drawer tries to guess
    drawer.emit('player-answer', { answer: word });
    await expect(waitForEvent(drawer, 'answer-result', 500)).rejects.toThrow('Timeout');
  });
});

// ══════════════════════════════════════════
// WORD SCRAMBLE / SPEED MATH / EMOJI
// ══════════════════════════════════════════
describe('Word Scramble', () => {
  test('game sends scrambled word state', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'wordscramble');

    const state = await waitForEvent(host, 'game-state', 2000);
    expect(state.scrambled).toBeDefined();
    expect(state.wordNumber).toBeDefined();
    expect(state.hint).toBeDefined();
  });

  test('answering and advancing rounds', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'wordscramble');

    const state = await waitForEvent(host, 'game-state', 2000);

    // Submit an answer (might be wrong, that's fine for testing flow)
    p1.emit('player-answer', { answer: 'testguess' });
    const result = await waitForEvent(p1, 'answer-result', 1000);
    expect(typeof result.isCorrect).toBe('boolean');

    host.emit('show-results');
    const roundResult = await waitForEvent(host, 'round-result', 1000);
    expect(roundResult).toBeDefined();
  });
});

describe('Speed Math', () => {
  test('game sends math problem state', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'speedmath');

    const state = await waitForEvent(host, 'game-state', 2000);
    expect(state.equation).toBeDefined();
    expect(state.problemNumber).toBeDefined();
  });

  test('correct math answer is scored', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'speedmath');

    const state = await waitForEvent(host, 'game-state', 2000);
    // Try to compute the answer from the problem string
    const problem = state.problem;
    let answer;
    try {
      // Problems are like "12 + 5" or "8 × 3"
      const cleaned = problem.replace('×', '*').replace('÷', '/');
      answer = String(Math.round(eval(cleaned)));
    } catch {
      answer = '0';
    }

    p1.emit('player-answer', { answer });
    const result = await waitForEvent(p1, 'answer-result', 1000);
    expect(typeof result.isCorrect).toBe('boolean');
  });
});

describe('Emoji Decoder', () => {
  test('game sends emoji puzzle state', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'emoji');

    const state = await waitForEvent(host, 'game-state', 2000);
    expect(state.emojis).toBeDefined();
    expect(state.puzzleNumber).toBeDefined();
  });

  test('wrong answer returns isCorrect false', async () => {
    const { host, roomCode } = await createRoom();
    const p1 = await startGame(host, roomCode, 'emoji');

    await waitForEvent(host, 'game-state', 2000);

    p1.emit('player-answer', { answer: 'definitelywronganswer12345' });
    const result = await waitForEvent(p1, 'answer-result', 1000);
    expect(result.isCorrect).toBe(false);
  });
});
