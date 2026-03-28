/**
 * ROOM & CONNECTION TESTS
 * Tests: create room, join room, duplicate names, invalid codes,
 *        disconnect, host transfer, kick, max players, spectator join
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

// ──────────────────────────────────────────
// ROOM CREATION
// ──────────────────────────────────────────
describe('Room Creation', () => {
  test('host creates room and gets a 6-char code', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Alice', avatar: '😎' });
    const data = await waitForEvent(host, 'room-created');
    expect(data.roomCode).toBeDefined();
    expect(data.roomCode.length).toBe(6);
    expect(/^[A-Z0-9]+$/.test(data.roomCode)).toBe(true);
  });

  test('host receives player-joined with themselves as host', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Bob', avatar: '🤠' });
    const data = await waitForEvent(host, 'player-joined');
    expect(data.players).toHaveLength(1);
    expect(data.players[0].name).toBe('Bob');
    expect(data.players[0].isHost).toBe(true);
    expect(data.players[0].avatar).toBe('🤠');
  });

  test('empty hostName is rejected silently', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: '', avatar: '😎' });
    // Should NOT get room-created
    await expect(waitForEvent(host, 'room-created', 500)).rejects.toThrow('Timeout');
  });

  test('non-string hostName is rejected', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 12345, avatar: '😎' });
    await expect(waitForEvent(host, 'room-created', 500)).rejects.toThrow('Timeout');
  });

  test('hostName is trimmed to 20 chars', async () => {
    const host = await makeClient();
    const longName = 'A'.repeat(30);
    host.emit('create-room', { hostName: longName, avatar: '😎' });
    const data = await waitForEvent(host, 'player-joined');
    expect(data.players[0].name.length).toBe(20);
  });

  test('invalid avatar defaults to 😎', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Test', avatar: 12345 });
    const data = await waitForEvent(host, 'player-joined');
    expect(data.players[0].avatar).toBe('😎');
  });

  test('long avatar string defaults to 😎', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Test', avatar: 'toolongavatar' });
    const data = await waitForEvent(host, 'player-joined');
    expect(data.players[0].avatar).toBe('😎');
  });
});

// ──────────────────────────────────────────
// JOIN ROOM
// ──────────────────────────────────────────
describe('Join Room', () => {
  test('player joins existing room', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: 'Player1', avatar: '🦊' });
    const data = await waitForEvent(player, 'join-success');
    expect(data.roomCode).toBe(roomCode);
    expect(data.isHost).toBe(false);
  });

  test('host gets notified when player joins', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined'); // initial join

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: 'Player1', avatar: '🦊' });
    const data = await waitForEvent(host, 'player-joined');
    expect(data.players).toHaveLength(2);
  });

  test('joining with invalid room code gives error', async () => {
    const player = await makeClient();
    player.emit('join-room', { roomCode: 'ZZZZZZ', playerName: 'Player', avatar: '😎' });
    const err = await waitForEvent(player, 'join-error');
    expect(err.message).toMatch(/not found/i);
  });

  test('duplicate name is rejected', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Alice', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: 'alice', avatar: '😎' }); // case insensitive
    const err = await waitForEvent(player, 'join-error');
    expect(err.message).toMatch(/taken/i);
  });

  test('joining room with empty name is rejected silently', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: '   ', avatar: '😎' });
    await expect(waitForEvent(player, 'join-success', 500)).rejects.toThrow('Timeout');
  });

  test('room code is case-insensitive', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');

    const player = await makeClient();
    player.emit('join-room', { roomCode: roomCode.toLowerCase(), playerName: 'P1', avatar: '😎' });
    const data = await waitForEvent(player, 'join-success');
    expect(data.roomCode).toBe(roomCode);
  });

  test('multiple players can join the same room', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    for (let i = 1; i <= 5; i++) {
      const p = await makeClient();
      p.emit('join-room', { roomCode, playerName: `P${i}`, avatar: '😎' });
      await waitForEvent(p, 'join-success');
      await waitForEvent(host, 'player-joined');
    }

    // All 5 players joined + host = 6 total
    // The last player-joined event we consumed should have 6 players
  });
});

// ──────────────────────────────────────────
// DISCONNECT & HOST TRANSFER
// ──────────────────────────────────────────
describe('Disconnect & Host Transfer', () => {
  test('player disconnect removes them from player list', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: 'Leaver', avatar: '😎' });
    await waitForEvent(host, 'player-joined');

    player.disconnect();
    const data = await waitForEvent(host, 'player-joined');
    expect(data.players).toHaveLength(1);
    expect(data.players[0].name).toBe('Host');
  });

  test('host disconnect promotes next player to host', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: 'NewHost', avatar: '😎' });
    await waitForEvent(player, 'join-success');
    await waitForEvent(host, 'player-joined');

    host.disconnect();
    // you-are-host is emitted without data
    await waitForEvent(player, 'you-are-host');
    // If we get here, the event was received
  });
});

// ──────────────────────────────────────────
// KICK PLAYER
// ──────────────────────────────────────────
describe('Kick Player', () => {
  test('host can kick a player', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const player = await makeClient();
    player.emit('join-room', { roomCode, playerName: 'Kickee', avatar: '😎' });
    await waitForEvent(player, 'join-success');
    const joined = await waitForEvent(host, 'player-joined');
    const playerId = joined.players.find(p => p.name === 'Kickee').id;

    host.emit('kick-player', { playerId });
    // kicked is emitted without data
    await waitForEvent(player, 'kicked');

    const updated = await waitForEvent(host, 'player-joined');
    expect(updated.players).toHaveLength(1);
  });

  test('non-host cannot kick players', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const p1 = await makeClient();
    p1.emit('join-room', { roomCode, playerName: 'P1', avatar: '😎' });
    await waitForEvent(p1, 'join-success');
    const joined = await waitForEvent(host, 'player-joined');

    const p2 = await makeClient();
    p2.emit('join-room', { roomCode, playerName: 'P2', avatar: '😎' });
    await waitForEvent(p2, 'join-success');
    await waitForEvent(host, 'player-joined');

    // P1 tries to kick P2 — should be ignored
    const p2Id = joined.players.find(p => p.name === 'P1')?.id;
    p1.emit('kick-player', { playerId: p2Id });
    await expect(waitForEvent(p2, 'kicked', 500)).rejects.toThrow('Timeout');
  });

  test('host cannot kick themselves', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    const joined = await waitForEvent(host, 'player-joined');
    const hostId = joined.players[0].id;

    host.emit('kick-player', { playerId: hostId });
    // Should not receive kicked
    await expect(waitForEvent(host, 'kicked', 500)).rejects.toThrow('Timeout');
  });
});

// ──────────────────────────────────────────
// SPECTATOR MODE
// ──────────────────────────────────────────
describe('Spectator Mode', () => {
  test('player joining mid-game becomes spectator', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const p1 = await makeClient();
    p1.emit('join-room', { roomCode, playerName: 'P1', avatar: '😎' });
    await waitForEvent(p1, 'join-success');
    await waitForEvent(host, 'player-joined');

    // Start a game
    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await delay(200);

    // Late joiner
    const spectator = await makeClient();
    spectator.emit('join-room', { roomCode, playerName: 'Spectator', avatar: '👻' });
    const specData = await waitForEvent(spectator, 'join-as-spectator');
    expect(specData.gameType).toBe('trivia');
    expect(specData.roomCode).toBe(roomCode);
  });

  test('spectator gets game state after joining', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const p1 = await makeClient();
    p1.emit('join-room', { roomCode, playerName: 'P1', avatar: '😎' });
    await waitForEvent(p1, 'join-success');

    host.emit('select-game', { gameType: 'hangman', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await waitForEvent(host, 'hangman-state', 2000);

    const spectator = await makeClient();
    spectator.emit('join-room', { roomCode, playerName: 'Watcher', avatar: '👀' });
    await waitForEvent(spectator, 'join-as-spectator');
    const state = await waitForEvent(spectator, 'hangman-state', 3000);
    expect(state).toBeDefined();
    expect(state.revealedWord).toBeDefined();
  });

  test('spectator becomes regular player on back-to-lobby', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const p1 = await makeClient();
    p1.emit('join-room', { roomCode, playerName: 'P1', avatar: '😎' });
    await waitForEvent(p1, 'join-success');

    host.emit('select-game', { gameType: 'trivia', category: 'all', settings: { rounds: 3 } });
    await waitForEvent(host, 'game-starting');
    await delay(200);

    const spectator = await makeClient();
    spectator.emit('join-room', { roomCode, playerName: 'Spec', avatar: '👻' });
    await waitForEvent(spectator, 'join-as-spectator');

    // Host goes back to lobby
    host.emit('back-to-lobby');
    const lobbyData = await waitForEvent(spectator, 'back-to-lobby');
    const specPlayer = lobbyData.players.find(p => p.name === 'Spec');
    expect(specPlayer.isSpectator).toBe(false);
  });
});

// ──────────────────────────────────────────
// REACTIONS
// ──────────────────────────────────────────
describe('Emoji Reactions', () => {
  test('valid reaction is broadcast to others', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const p1 = await makeClient();
    p1.emit('join-room', { roomCode, playerName: 'P1', avatar: '😎' });
    await waitForEvent(p1, 'join-success');
    await waitForEvent(host, 'player-joined');

    p1.emit('reaction', { emoji: '🔥' });
    const rxn = await waitForEvent(host, 'reaction');
    expect(rxn.emoji).toBe('🔥');
    expect(rxn.name).toBe('P1');
  });

  test('invalid emoji is rejected', async () => {
    const host = await makeClient();
    host.emit('create-room', { hostName: 'Host', avatar: '😎' });
    const { roomCode } = await waitForEvent(host, 'room-created');
    await waitForEvent(host, 'player-joined');

    const p1 = await makeClient();
    p1.emit('join-room', { roomCode, playerName: 'P1', avatar: '😎' });
    await waitForEvent(p1, 'join-success');
    await waitForEvent(host, 'player-joined');

    p1.emit('reaction', { emoji: '💩' }); // not in allowed list
    await expect(waitForEvent(host, 'reaction', 500)).rejects.toThrow('Timeout');
  });
});
