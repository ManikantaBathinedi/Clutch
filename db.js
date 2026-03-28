// ══════════════════════════════════════
// IN-MEMORY DATA STORE
// ══════════════════════════════════════
// All data lives in memory. Restarting the server clears everything.
// This keeps the app fully portable with zero dependencies on disk storage.

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const users = new Map();         // id -> user object
const usersByName = new Map();   // lowercase username -> id
const sessions = new Map();      // token -> { userId, expiresAt }
const gameHistory = [];          // [{ id, roomCode, gameType, playedAt, durationSeconds, playerCount }]
const gameResults = [];          // [{ gameHistoryId, userId, score, placement, isWinner }]
const chatMessages = new Map();  // roomCode -> [{ displayName, message, sentAt }]
const tournaments = new Map();   // id -> tournament object
const tournamentScores = [];     // [{ tournamentId, userId, gameIndex, gameType, score, placement }]

let nextUserId = 1;
let nextGameHistoryId = 1;
let nextTournamentId = 1;
let nextChatId = 1;

// Clean expired sessions periodically
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(token);
  }
}
setInterval(cleanExpiredSessions, 3600000);

// ══════════════════════════════════════
// USER OPERATIONS
// ══════════════════════════════════════

const SALT_ROUNDS = 10;
const SESSION_DAYS = 30;

async function register(username, password, displayName, avatar) {
  if (!username || !password || !displayName) return { error: 'All fields are required.' };
  if (username.length < 3 || username.length > 20) return { error: 'Username must be 3-20 characters.' };
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { error: 'Username can only contain letters, numbers, and underscores.' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  if (displayName.length < 1 || displayName.length > 20) return { error: 'Display name must be 1-20 characters.' };

  if (usersByName.has(username.toLowerCase())) return { error: 'Username already taken.' };

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const safeAvatar = (typeof avatar === 'string' && avatar.length <= 4) ? avatar : '😎';
  const id = nextUserId++;
  const now = new Date().toISOString();
  const user = {
    id, username, password_hash: hash,
    display_name: displayName.substring(0, 20), avatar: safeAvatar,
    created_at: now, last_login: now,
    games_played: 0, games_won: 0, total_score: 0
  };
  users.set(id, user);
  usersByName.set(username.toLowerCase(), id);

  const token = createSession(id);
  return { success: true, token, userId: id, displayName: user.display_name, avatar: safeAvatar };
}

async function login(username, password) {
  if (!username || !password) return { error: 'Username and password required.' };

  const uid = usersByName.get(username.toLowerCase());
  if (!uid) return { error: 'Invalid username or password.' };
  const user = users.get(uid);
  if (!user) return { error: 'Invalid username or password.' };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { error: 'Invalid username or password.' };

  user.last_login = new Date().toISOString();
  const token = createSession(user.id);
  return {
    success: true, token, userId: user.id,
    displayName: user.display_name, avatar: user.avatar,
    username: user.username
  };
}

function createSession(userId) {
  const token = uuidv4();
  const expiresAt = Date.now() + SESSION_DAYS * 86400000;
  sessions.set(token, { userId, expiresAt });
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) { if (s) sessions.delete(token); return null; }
  const user = users.get(s.userId);
  if (!user) return null;
  return {
    user_id: user.id, username: user.username,
    display_name: user.display_name, avatar: user.avatar,
    games_played: user.games_played, games_won: user.games_won, total_score: user.total_score
  };
}

function logout(token) {
  sessions.delete(token);
}

function getProfile(userId) {
  const u = users.get(userId);
  if (!u) return null;
  return {
    id: u.id, username: u.username, display_name: u.display_name,
    avatar: u.avatar, games_played: u.games_played, games_won: u.games_won,
    total_score: u.total_score, created_at: u.created_at, last_login: u.last_login
  };
}

function getUserByUsername(username) {
  const uid = usersByName.get(username.toLowerCase());
  if (!uid) return null;
  const u = users.get(uid);
  if (!u) return null;
  return {
    id: u.id, display_name: u.display_name, avatar: u.avatar,
    username: u.username, games_played: u.games_played,
    games_won: u.games_won, total_score: u.total_score, created_at: u.created_at
  };
}

function updateProfile(userId, displayName, avatar) {
  const user = users.get(userId);
  if (!user) return { error: 'User not found.' };
  let changed = false;
  if (displayName && displayName.length >= 1 && displayName.length <= 20) { user.display_name = displayName; changed = true; }
  if (avatar && typeof avatar === 'string' && avatar.length <= 4) { user.avatar = avatar; changed = true; }
  if (!changed) return { error: 'Nothing to update.' };
  return { success: true };
}

// ══════════════════════════════════════
// GAME HISTORY & STATS
// ══════════════════════════════════════

function recordGame(roomCode, gameType, durationSeconds, players) {
  const gameId = nextGameHistoryId++;
  gameHistory.push({
    id: gameId, room_code: roomCode, game_type: gameType,
    played_at: new Date().toISOString(), duration_seconds: durationSeconds,
    player_count: players.length
  });

  for (const p of players) {
    if (!p.userId) continue;
    gameResults.push({
      gameHistoryId: gameId, userId: p.userId,
      score: p.score, placement: p.placement, isWinner: p.isWinner ? 1 : 0
    });
    const user = users.get(p.userId);
    if (user) {
      user.games_played++;
      user.total_score += p.score || 0;
      if (p.isWinner) user.games_won++;
    }
  }
  return gameId;
}

function getPlayerHistory(userId, limit = 20) {
  const results = [];
  for (let i = gameResults.length - 1; i >= 0 && results.length < limit; i--) {
    const gr = gameResults[i];
    if (gr.userId === userId) {
      const gh = gameHistory.find(h => h.id === gr.gameHistoryId);
      if (gh) {
        results.push({
          game_type: gh.game_type, played_at: gh.played_at, player_count: gh.player_count,
          score: gr.score, placement: gr.placement, is_winner: gr.isWinner
        });
      }
    }
  }
  return results;
}

function getLeaderboard(gameType, limit = 50) {
  if (gameType && gameType !== 'all') {
    const userStats = new Map();
    for (const gr of gameResults) {
      const gh = gameHistory.find(h => h.id === gr.gameHistoryId);
      if (!gh || gh.game_type !== gameType) continue;
      const u = users.get(gr.userId);
      if (!u) continue;
      if (!userStats.has(gr.userId)) userStats.set(gr.userId, { games: 0, total_score: 0, wins: 0, user: u });
      const s = userStats.get(gr.userId);
      s.games++;
      s.total_score += gr.score || 0;
      s.wins += gr.isWinner || 0;
    }
    return [...userStats.values()]
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, limit)
      .map(s => ({ display_name: s.user.display_name, avatar: s.user.avatar, username: s.user.username, games: s.games, total_score: s.total_score, wins: s.wins }));
  }
  return [...users.values()]
    .filter(u => u.games_played > 0)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, limit)
    .map(u => ({ display_name: u.display_name, avatar: u.avatar, username: u.username, games: u.games_played, total_score: u.total_score, wins: u.games_won }));
}

// ══════════════════════════════════════
// CHAT
// ══════════════════════════════════════

function saveChat(roomCode, userId, displayName, message) {
  if (!message || typeof message !== 'string') return null;
  const clean = message.substring(0, 500).trim();
  if (!clean) return null;
  const id = nextChatId++;
  const sentAt = new Date().toISOString();
  if (!chatMessages.has(roomCode)) chatMessages.set(roomCode, []);
  chatMessages.get(roomCode).push({ id, displayName, message: clean, sentAt });
  return { id, displayName, message: clean, sentAt };
}

function getChatHistory(roomCode, limit = 50) {
  const msgs = chatMessages.get(roomCode) || [];
  return msgs.slice(-limit).map(m => ({ display_name: m.displayName, message: m.message, sent_at: m.sentAt }));
}

// ══════════════════════════════════════
// TOURNAMENTS
// ══════════════════════════════════════

function createTournament(name, roomCode, createdBy, games) {
  if (!name || !games || !Array.isArray(games) || games.length < 2) {
    return { error: 'Tournament needs a name and at least 2 games.' };
  }
  if (name.length > 50) name = name.substring(0, 50);
  const id = nextTournamentId++;
  tournaments.set(id, {
    id, name, room_code: roomCode, created_by: createdBy,
    games: [...games], status: 'active', current_game_index: 0,
    created_at: new Date().toISOString()
  });
  return { success: true, tournamentId: id };
}

function getTournament(tournamentId) {
  const t = tournaments.get(tournamentId);
  if (!t) return null;
  const scores = tournamentScores
    .filter(s => s.tournamentId === tournamentId)
    .map(s => {
      const u = users.get(s.userId);
      return { ...s, display_name: u ? u.display_name : '?', avatar: u ? u.avatar : '😎' };
    })
    .sort((a, b) => a.gameIndex - b.gameIndex || b.score - a.score);
  return { ...t, scores };
}

function recordTournamentGame(tournamentId, gameIndex, gameType, players) {
  for (const p of players) {
    if (!p.userId) continue;
    tournamentScores.push({
      tournamentId, userId: p.userId, gameIndex, gameType,
      score: p.score || 0, placement: p.placement || 0
    });
  }
  const t = tournaments.get(tournamentId);
  if (t) {
    if (gameIndex + 1 >= t.games.length) {
      t.status = 'completed';
      t.current_game_index = gameIndex + 1;
    } else {
      t.current_game_index = gameIndex + 1;
    }
  }
}

function getTournamentStandings(tournamentId) {
  const userStats = new Map();
  for (const s of tournamentScores) {
    if (s.tournamentId !== tournamentId) continue;
    const u = users.get(s.userId);
    if (!u) continue;
    if (!userStats.has(s.userId)) userStats.set(s.userId, { user_id: s.userId, total_score: 0, games_completed: 0, first_places: 0, user: u });
    const st = userStats.get(s.userId);
    st.total_score += s.score || 0;
    st.games_completed++;
    if (s.placement === 1) st.first_places++;
  }
  return [...userStats.values()]
    .sort((a, b) => b.total_score - a.total_score)
    .map(s => ({ display_name: s.user.display_name, avatar: s.user.avatar, username: s.user.username, user_id: s.user_id, total_score: s.total_score, games_completed: s.games_completed, first_places: s.first_places }));
}

module.exports = {
  register, login, validateSession, logout,
  getProfile, getUserByUsername, updateProfile,
  recordGame, getPlayerHistory, getLeaderboard,
  saveChat, getChatHistory,
  createTournament, getTournament, recordTournamentGame, getTournamentStandings
};
