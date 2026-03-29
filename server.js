const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const rateLimit = require('express-rate-limit');
const dbModule = require('./db');
const triviaLogic = require('./game-logic/trivia');
const wordScrambleLogic = require('./game-logic/wordscramble');
const speedMathLogic = require('./game-logic/speedmath');
const emojiLogic = require('./game-logic/emoji');
const drawGuessLogic = require('./game-logic/drawguess');
const codenamesLogic = require('./game-logic/codenames');
const colorClashLogic = require('./game-logic/colorclash');
const blackjackLogic = require('./game-logic/blackjack');
const hangmanLogic = require('./game-logic/hangman');
const memoryMatchLogic = require('./game-logic/memorymatch');
const spyfallLogic = require('./game-logic/spyfall');
const wavelengthLogic = require('./game-logic/wavelength');
const justOneLogic = require('./game-logic/justone');
const wouldYouRatherLogic = require('./game-logic/wouldyourather');
const wordChainLogic = require('./game-logic/wordchain');
const imposterLogic = require('./game-logic/imposter');
const ludoLogic = require('./game-logic/ludo');
const pokerLogic = require('./game-logic/poker');
const chessLogic = require('./game-logic/chess');
const battleshipLogic = require('./game-logic/battleship');
const rummyLogic = require('./game-logic/rummy');
const coupLogic = require('./game-logic/coup');
const wordleLogic = require('./game-logic/wordle');
const dixitLogic = require('./game-logic/dixit');
const knowmeLogic = require('./game-logic/knowme');
const connectFourLogic = require('./game-logic/connectfour');
const ticTacToeLogic = require('./game-logic/tictactoe');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '8mb' }));

// ═══════════════════════════════════════
// REST API — AUTH & DATA
// ═══════════════════════════════════════

// Auth middleware for protected routes
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = dbModule.validateSession(token);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  req.user = user;
  next();
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});

// Register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password, displayName, avatar } = req.body;
  const result = await dbModule.register(username, password, displayName, avatar);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  const result = await dbModule.login(username, password);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// Logout
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  dbModule.logout(token);
  res.json({ success: true });
});

// Validate session
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// Update profile
app.put('/api/auth/profile', authMiddleware, (req, res) => {
  const { displayName, avatar } = req.body;
  const result = dbModule.updateProfile(req.user.user_id, displayName, avatar);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Player history
app.get('/api/history', authMiddleware, (req, res) => {
  const history = dbModule.getPlayerHistory(req.user.user_id, 50);
  res.json(history);
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const { game } = req.query;
  const leaderboard = dbModule.getLeaderboard(game || 'all', 50);
  res.json(leaderboard);
});

// Game rules
const gameRules = require('./data/game-rules.json');
app.get('/api/rules', (req, res) => {
  res.json(gameRules);
});
app.get('/api/rules/:game', (req, res) => {
  const rules = gameRules[req.params.game];
  if (!rules) return res.status(404).json({ error: 'Game not found.' });
  res.json(rules);
});

// Profile page
app.get('/api/profile/:username', (req, res) => {
  const user = dbModule.getUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const history = dbModule.getPlayerHistory(user.id, 20);
  res.json({ ...user, history });
});

// ═══════════════════════════════════════
// REPORT ISSUE → GitHub Issues API
// ═══════════════════════════════════════
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                    // 5 reports per hour per IP
  message: { error: 'Too many reports. Please try again later.' }
});

app.post('/api/report-issue', reportLimiter, async (req, res) => {
  const ghToken = process.env.GITHUB_TOKEN;
  const ghRepo  = process.env.GITHUB_REPO; // e.g. "owner/repo"
  if (!ghToken || !ghRepo) {
    return res.status(503).json({ error: 'Issue reporting is not configured.' });
  }

  const { title, description, category, severity, screenshot } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  const safeTitle = title.trim().slice(0, 200);
  const safeDesc  = (description || '').trim().slice(0, 2000);
  const safeCategory = ['bug', 'feature', 'ui', 'performance', 'other'].includes(category) ? category : 'other';
  const safeSeverity = ['low', 'medium', 'high'].includes(severity) ? severity : 'medium';

  const labels = [];
  if (safeCategory === 'bug') labels.push('bug');
  else if (safeCategory === 'feature') labels.push('enhancement');
  else if (safeCategory === 'ui') labels.push('ui');
  else if (safeCategory === 'performance') labels.push('performance');
  if (safeSeverity === 'high') labels.push('priority: high');

  let screenshotSection = '';
  if (screenshot && typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
    // Validate size (base64 string under ~7MB → ~5MB file)
    if (screenshot.length <= 7 * 1024 * 1024) {
      screenshotSection = `\n\n**Screenshot:**\n![screenshot](${screenshot})`;
    }
  }

  const severityEmoji = safeSeverity === 'high' ? '🔴' : safeSeverity === 'medium' ? '🟡' : '🟢';
  const body = `**Category:** ${safeCategory}\n**Priority:** ${severityEmoji} ${safeSeverity}\n\n${safeDesc}${screenshotSection}\n\n---\n*Submitted via Clutch app*`;

  try {
    const resp = await fetch(`https://api.github.com/repos/${ghRepo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ title: `[${safeCategory}] ${safeTitle}`, body, labels })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('GitHub Issues API error:', resp.status, err);
      return res.status(502).json({ error: 'Failed to create issue on GitHub.' });
    }

    const issue = await resp.json();
    res.json({ success: true, issueUrl: issue.html_url });
  } catch (err) {
    console.error('Report issue error:', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

// In-memory room storage
const rooms = new Map();

// Generate a 6-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Clean up empty rooms periodically
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.players.length === 0) {
      rooms.delete(code);
    }
  }
}, 60000);

// ─── DRAW & GUESS HELPERS ───

// Track timers per room
const roomTimers = new Map();

function startDrawRound(room, data) {
  // Send draw-start: word only to drawer, dashed to others
  room.players.forEach(p => {
    const payload = p.id === data.drawerId
      ? data
      : { ...data, word: undefined };
    io.to(p.id).emit('draw-start', payload);
  });

  // Start hint timers (reveal letters at ~40% and ~70% of time)
  startHintTimers(room, data.timeLimit);
}

function startAutoChooseTimer(room) {
  const gs = room.gameState;
  if (!gs) return;
  const key = room.code + '_autochoose';
  const timer = setTimeout(() => {
    const data = drawGuessLogic.autoChooseWord(room);
    if (data) startDrawRound(room, data);
  }, (gs.chooseTime + 1) * 1000);
  roomTimers.set(key, timer);
}

function clearAutoChooseTimer(room) {
  const key = room.code + '_autochoose';
  const timer = roomTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(key);
  }
}

function startHintTimers(room, drawTime) {
  const timers = [];
  // First hint at 40% time elapsed
  timers.push(setTimeout(() => {
    const hint = drawGuessLogic.revealLetter(room);
    if (hint) io.to(room.code).emit('hint-reveal', hint);
  }, drawTime * 0.4 * 1000));

  // Second hint at 70% time elapsed
  timers.push(setTimeout(() => {
    const hint = drawGuessLogic.revealLetter(room);
    if (hint) io.to(room.code).emit('hint-reveal', hint);
  }, drawTime * 0.7 * 1000));

  const key = room.code + '_hints';
  roomTimers.set(key, timers);
}

function clearHintTimers(room) {
  const key = room.code + '_hints';
  const timers = roomTimers.get(key);
  if (timers) {
    timers.forEach(t => clearTimeout(t));
    roomTimers.delete(key);
  }
}

// Track game start times for duration calculation
const gameStartTimes = new Map();

// Record completed game to database
function recordGameResults(room) {
  try {
    const startTime = gameStartTimes.get(room.code);
    const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
    gameStartTimes.delete(room.code);

    // Sort by score descending for placement
    const sorted = room.players
      .filter(p => !p.isSpectator)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const players = sorted.map((p, i) => {
      const sock = Array.from(io.sockets.sockets.values()).find(s => s.id === p.id);
      return {
        userId: sock?.userId || null,
        score: p.score || 0,
        placement: i + 1,
        isWinner: i === 0
      };
    });

    if (players.some(p => p.userId)) {
      dbModule.recordGame(room.code, room.currentGame, duration, players);

      // If tournament is active, record tournament game too
      if (room.tournamentId) {
        const t = dbModule.getTournament(room.tournamentId);
        if (t) {
          dbModule.recordTournamentGame(room.tournamentId, t.current_game_index, room.currentGame, players);
        }
      }
    }
  } catch (e) {
    console.error('Error recording game:', e.message);
  }
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // ─── SOCKET AUTH (optional — links socket to user account) ───
  socket.on('auth-socket', ({ token }) => {
    const user = dbModule.validateSession(token);
    if (user) {
      socket.userId = user.user_id;
      socket.userName = user.display_name;
      socket.emit('auth-ok', { userId: user.user_id, displayName: user.display_name, avatar: user.avatar });
    }
  });

  // ─── CHAT ───
  socket.on('chat-message', ({ message }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !message || typeof message !== 'string') return;
    const clean = message.substring(0, 500).trim();
    if (!clean) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const chatEntry = dbModule.saveChat(room.code, socket.userId || null, player.name, clean);
    if (chatEntry) {
      io.to(room.code).emit('chat-message', {
        playerName: player.name,
        avatar: player.avatar,
        message: clean,
        sentAt: chatEntry.sentAt
      });
    }
  });

  socket.on('get-chat-history', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const history = dbModule.getChatHistory(room.code, 50);
    socket.emit('chat-history', history);
  });

  // ─── CREATE ROOM ───
  socket.on('create-room', ({ hostName, avatar }) => {
    if (!hostName || typeof hostName !== 'string') return;
    const name = hostName.trim().substring(0, 20);
    if (!name) return;

    const playerAvatar = (typeof avatar === 'string' && avatar.length <= 4) ? avatar : '😎';
    const code = generateRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: [{
        id: socket.id,
        name,
        avatar: playerAvatar,
        score: 0,
        isHost: true
      }],
      currentGame: null,
      gameState: null,
      status: 'lobby'
    };

    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;

    socket.emit('room-created', { roomCode: code });
    io.to(code).emit('player-joined', { players: room.players });
    console.log(`Room ${code} created by ${name}`);
  });

  // ─── JOIN ROOM ───
  socket.on('join-room', ({ roomCode, playerName, avatar }) => {
    if (!roomCode || !playerName || typeof playerName !== 'string') return;
    const code = roomCode.trim().toUpperCase();
    const name = playerName.trim().substring(0, 20);
    if (!name) return;

    const playerAvatar = (typeof avatar === 'string' && avatar.length <= 4) ? avatar : '😎';

    const room = rooms.get(code);
    if (!room) {
      socket.emit('join-error', { message: 'Room not found. Check the code and try again.' });
      return;
    }

    if (room.players.length >= 50) {
      socket.emit('join-error', { message: 'Room is full (max 50 players).' });
      return;
    }

    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      socket.emit('join-error', { message: 'That name is taken. Pick another one.' });
      return;
    }

    const isSpectator = room.status !== 'lobby';

    room.players.push({
      id: socket.id,
      name,
      avatar: playerAvatar,
      score: 0,
      isHost: false,
      isSpectator
    });

    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;

    if (isSpectator) {
      socket.emit('join-as-spectator', { roomCode: code, gameType: room.currentGame });
      io.to(code).emit('player-joined', { players: room.players });
      console.log(`${name} joined room ${code} as spectator`);

      // Send current game state to spectator
      const gt = room.currentGame;
      setTimeout(() => {
        if (gt === 'trivia') { const d = triviaLogic.getCurrentQuestion(room); if (d) socket.emit('game-state', d); }
        else if (gt === 'wordscramble') { const d = wordScrambleLogic.getCurrentWord(room); if (d) socket.emit('game-state', d); }
        else if (gt === 'speedmath') { const d = speedMathLogic.getCurrentProblem(room); if (d) socket.emit('game-state', d); }
        else if (gt === 'emoji') { const d = emojiLogic.getCurrentPuzzle(room); if (d) socket.emit('game-state', d); }
        else if (gt === 'drawguess') { socket.emit('dg-spectator', {}); }
        else if (gt === 'codenames') { socket.emit('codenames-state', codenamesLogic.getGameState(room, socket.id)); }
        else if (gt === 'colorclash') { socket.emit('cc-state', colorClashLogic.getPlayerState(room, socket.id)); }
        else if (gt === 'blackjack') { socket.emit('bj-state', blackjackLogic.getPlayerView(room, socket.id)); }
        else if (gt === 'hangman') { socket.emit('hangman-state', hangmanLogic.getCurrentState(room)); }
        else if (gt === 'memorymatch') { socket.emit('mm-state', memoryMatchLogic.getPlayerView(room, socket.id)); }
      }, 500);
    } else {
      socket.emit('join-success', { roomCode: code, isHost: false });
      io.to(code).emit('player-joined', { players: room.players });
      console.log(`${name} joined room ${code}`);
    }
  });

  // ─── GET CATEGORIES ───
  socket.on('get-categories', ({ gameType }) => {
    const categoriesMap = {
      trivia: triviaLogic.getCategories(),
      wordscramble: wordScrambleLogic.getCategories(),
      emoji: emojiLogic.getCategories(),
      hangman: hangmanLogic.getCategories(),
      imposter: imposterLogic.getCategories()
    };
    const categories = categoriesMap[gameType] || [];
    socket.emit('categories-list', { gameType, categories });
  });

  // ─── SELECT GAME ───
  socket.on('select-game', ({ gameType, category, settings }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;

    const validGames = ['trivia', 'wordscramble', 'speedmath', 'emoji', 'drawguess', 'codenames', 'colorclash', 'blackjack', 'hangman', 'memorymatch', 'spyfall', 'wavelength', 'justone', 'wouldyourather', 'wordchain', 'imposter', 'ludo', 'poker', 'chess', 'battleship', 'rummy', 'coup', 'wordle', 'dixit', 'knowme', 'connectfour', 'tictactoe'];
    if (!validGames.includes(gameType)) return;

    // Sanitize category
    const cat = (typeof category === 'string') ? category.trim().toLowerCase() : 'all';

    // Sanitize settings
    const s = {};
    if (settings && typeof settings === 'object') {
      if (typeof settings.rounds === 'number') s.rounds = Math.max(3, Math.min(30, Math.floor(settings.rounds)));
      if (typeof settings.timeLimit === 'number') s.timeLimit = Math.max(5, Math.min(120, Math.floor(settings.timeLimit)));
      if (typeof settings.votingRounds === 'number') s.votingRounds = Math.max(1, Math.min(5, Math.floor(settings.votingRounds)));
    }

    room.currentGame = gameType;
    room.status = 'playing';
    gameStartTimes.set(room.code, Date.now());

    // Store last game info for rematch
    room.lastGame = { gameType, category: cat, settings: s };

    // Handle max player limits — auto-spectate excess players
    const maxPlayers = { chess: 2, battleship: 2, rummy: 6, coup: 6, dixit: 8, codenames: 20, ludo: 4, poker: 8, knowme: 2, connectfour: 2, tictactoe: 2 };
    const maxP = maxPlayers[gameType];
    if (maxP) {
      const activePlayers = room.players.filter(p => !p.isSpectator);
      if (activePlayers.length > maxP) {
        // Shuffle non-host players, keep host always as player
        const host = activePlayers.find(p => p.isHost);
        const others = activePlayers.filter(p => !p.isHost).sort(() => Math.random() - 0.5);
        const players = host ? [host, ...others] : others;
        const spectated = players.slice(maxP);
        spectated.forEach(p => {
          p.isSpectator = true;
          io.to(p.id).emit('game-spectator-overflow', {
            message: `${gameType.charAt(0).toUpperCase() + gameType.slice(1)} supports max ${maxP} players. You're watching this round!`
          });
        });
        // Notify the room about who's spectating
        const spectNames = spectated.map(p => p.name).join(', ');
        io.to(room.code).emit('toast-message', { message: `${spectNames} will spectate this round (max ${maxP} players)`, type: 'info' });
      }
    }

    if (gameType === 'trivia') triviaLogic.init(room, cat, s);
    else if (gameType === 'wordscramble') wordScrambleLogic.init(room, cat, s);
    else if (gameType === 'speedmath') speedMathLogic.init(room, s);
    else if (gameType === 'emoji') emojiLogic.init(room, cat, s);
    else if (gameType === 'drawguess') drawGuessLogic.init(room, s);
    else if (gameType === 'codenames') codenamesLogic.init(room);
    else if (gameType === 'colorclash') colorClashLogic.init(room);
    else if (gameType === 'blackjack') blackjackLogic.init(room);
    else if (gameType === 'hangman') hangmanLogic.init(room, cat, s);
    else if (gameType === 'memorymatch') memoryMatchLogic.init(room, s);
    else if (gameType === 'spyfall') spyfallLogic.init(room, s);
    else if (gameType === 'wavelength') wavelengthLogic.init(room, s);
    else if (gameType === 'justone') justOneLogic.init(room, s);
    else if (gameType === 'wouldyourather') wouldYouRatherLogic.init(room, s);
    else if (gameType === 'wordchain') wordChainLogic.init(room, s);
    else if (gameType === 'imposter') { s.category = cat; imposterLogic.init(room, s); }
    else if (gameType === 'ludo') ludoLogic.init(room);
    else if (gameType === 'poker') pokerLogic.init(room);
    else if (gameType === 'chess') chessLogic.init(room);
    else if (gameType === 'battleship') battleshipLogic.init(room);
    else if (gameType === 'rummy') rummyLogic.init(room, s);
    else if (gameType === 'coup') coupLogic.init(room);
    else if (gameType === 'wordle') wordleLogic.init(room, s);
    else if (gameType === 'dixit') dixitLogic.init(room, s);
    else if (gameType === 'knowme') knowmeLogic.init(room, s);
    else if (gameType === 'connectfour') connectFourLogic.init(room);
    else if (gameType === 'tictactoe') ticTacToeLogic.init(room);

    // Check if init succeeded (some games need minimum players)
    if (!room.gameState) {
      room.currentGame = null;
      room.status = 'lobby';
      room.lastGame = null;
      gameStartTimes.delete(room.code);
      const minPlayers = { chess: 1, battleship: 2, rummy: 2, coup: 2, dixit: 3, codenames: 4, ludo: 2, poker: 2, knowme: 2, connectfour: 2, tictactoe: 2 };
      const needed = minPlayers[gameType] || 2;
      socket.emit('game-error', { message: `${gameType.charAt(0).toUpperCase() + gameType.slice(1)} requires at least ${needed} players` });
      return;
    }

    io.to(room.code).emit('game-starting', { gameType });

    setTimeout(() => {
      let data;
      if (gameType === 'trivia') data = triviaLogic.getCurrentQuestion(room);
      else if (gameType === 'wordscramble') data = wordScrambleLogic.getCurrentWord(room);
      else if (gameType === 'speedmath') data = speedMathLogic.getCurrentProblem(room);
      else if (gameType === 'emoji') data = emojiLogic.getCurrentPuzzle(room);
      else if (gameType === 'drawguess') {
        // Draw & Guess: send word choices to drawer first
        data = drawGuessLogic.getWordChoices(room);
        if (data) {
          // Send words only to drawer, waiting screen to others
          io.to(data.drawerId).emit('word-choices', data);
          room.players.forEach(p => {
            if (p.id !== data.drawerId) {
              io.to(p.id).emit('word-choices', { ...data, words: undefined });
            }
          });
          // Auto-choose after timeout
          startAutoChooseTimer(room);
          return;
        }
      }

      // Codenames: send team selection UI
      if (gameType === 'codenames') {
        room.players.forEach(p => {
          io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id));
        });
        return;
      }

      // Crazy Eights: send each player their hand
      if (gameType === 'colorclash') {
        room.players.forEach(p => {
          io.to(p.id).emit('cc-state', colorClashLogic.getPlayerState(room, p.id));
        });
        return;
      }

      // Blackjack: send betting UI
      if (gameType === 'blackjack') {
        room.players.forEach(p => {
          io.to(p.id).emit('bj-state', blackjackLogic.getPlayerView(room, p.id));
        });
        return;
      }

      // Hangman: send initial state
      if (gameType === 'hangman') {
        const state = hangmanLogic.getCurrentState(room);
        io.to(room.code).emit('hangman-state', state);
        return;
      }

      // Memory Match: send each player their view
      if (gameType === 'memorymatch') {
        room.players.forEach(p => {
          io.to(p.id).emit('mm-state', memoryMatchLogic.getPlayerView(room, p.id));
        });
        return;
      }

      // Spyfall: send per-player view (spy vs non-spy)
      if (gameType === 'spyfall') {
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
        });
        return;
      }

      // Wavelength: clue-giver sees target, guessers don't
      if (gameType === 'wavelength') {
        const gs = room.gameState;
        const clueGiverId = gs.clueGiverId;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === clueGiverId) {
            io.to(p.id).emit('wavelength-clue-view', wavelengthLogic.getClueGiverView(room));
          } else {
            io.to(p.id).emit('wavelength-guess-view', wavelengthLogic.getGuesserView(room));
          }
        });
        return;
      }

      // Just One: guesser can't see the word, clue-givers can
      if (gameType === 'justone') {
        const gs = room.gameState;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.guesserId) {
            io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
          } else {
            io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room));
          }
        });
        return;
      }

      // Word Chain: broadcast state to all
      if (gameType === 'wordchain') {
        io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
        return;
      }

      // Imposter: send per-player view (imposter vs villager)
      if (gameType === 'imposter') {
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
        });
        return;
      }

      // Ludo: send per-player view
      if (gameType === 'ludo') {
        room.players.forEach(p => {
          const view = ludoLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('ludo-state', view);
        });
        return;
      }

      // Poker: send per-player view (each sees own cards)
      if (gameType === 'poker') {
        room.players.forEach(p => {
          const view = pokerLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('poker-state', view);
        });
        return;
      }

      // Chess: send per-player view
      if (gameType === 'chess') {
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-state', view);
        });
        return;
      }

      // Battleship: send per-player view
      if (gameType === 'battleship') {
        room.players.forEach(p => {
          const view = battleshipLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('battleship-state', view);
        });
        return;
      }

      // Rummy: send per-player view
      if (gameType === 'rummy') {
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-state', view);
        });
        return;
      }

      // Coup: send per-player view
      if (gameType === 'coup') {
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-state', view);
        });
        return;
      }

      // Wordle: send per-player view
      if (gameType === 'wordle') {
        room.players.forEach(p => {
          const view = wordleLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('wordle-state', view);
        });
        return;
      }

      // Dixit: send per-player view
      if (gameType === 'dixit') {
        room.players.forEach(p => {
          const view = dixitLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('dixit-state', view);
        });
        return;
      }

      // Know Me: round-based broadcast
      if (gameType === 'knowme') {
        data = knowmeLogic.getCurrentQuestion(room);
      }

      // Connect Four: send per-player view
      if (gameType === 'connectfour') {
        room.players.forEach(p => {
          const view = connectFourLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('connectfour-state', view);
        });
        return;
      }

      // Tic Tac Toe: send per-player view
      if (gameType === 'tictactoe') {
        room.players.forEach(p => {
          const view = ticTacToeLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('tictactoe-state', view);
        });
        return;
      }

      // Would You Rather uses standard game-state
      if (gameType === 'wouldyourather') {
        data = wouldYouRatherLogic.getCurrentQuestion(room);
      }

      if (data) io.to(room.code).emit('game-state', data);
    }, 3000);
  });

  // ─── DRAW & GUESS: WORD CHOICE ───
  socket.on('choose-word', ({ wordIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'drawguess') return;

    const data = drawGuessLogic.chooseWord(room, socket.id, wordIndex);
    if (!data) return;

    clearAutoChooseTimer(room);
    startDrawRound(room, data);
  });

  // ─── PLAYER ANSWER ───
  socket.on('player-answer', ({ answer }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.status !== 'playing') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isSpectator) return;

    let result;
    if (room.currentGame === 'trivia') {
      result = triviaLogic.handleAnswer(room, socket.id, answer);
    } else if (room.currentGame === 'wordscramble') {
      result = wordScrambleLogic.handleAnswer(room, socket.id, answer);
    } else if (room.currentGame === 'speedmath') {
      result = speedMathLogic.handleAnswer(room, socket.id, answer);
    } else if (room.currentGame === 'emoji') {
      result = emojiLogic.handleAnswer(room, socket.id, answer);
    } else if (room.currentGame === 'wouldyourather') {
      result = wouldYouRatherLogic.handleAnswer(room, socket.id, answer);
    } else if (room.currentGame === 'knowme') {
      result = knowmeLogic.handleAnswer(room, socket.id, answer);
    } else if (room.currentGame === 'drawguess') {
      result = drawGuessLogic.handleGuess(room, socket.id, answer);
      if (result) {
        // Send personal result to guesser
        socket.emit('answer-result', { isCorrect: result.isCorrect, isClose: result.isClose, points: result.points });

        // Broadcast chat message to everyone
        const chatEntry = result.chatEntry;
        if (chatEntry.isCorrect) {
          // Correct guess: show system message to all
          io.to(room.code).emit('guess-chat', chatEntry);
        } else {
          // Wrong guess: show the guess text to everyone (except drawer sees it too)
          io.to(room.code).emit('guess-chat', chatEntry);
        }

        // If all guessed, end turn early
        if (result.allGuessedCorrect) {
          io.to(room.code).emit('all-guessed');
        }
        return; // already sent answer-result above
      }
    }
    if (result) {
      socket.emit('answer-result', result);
    }
  });

  // ─── HOST: NEXT QUESTION ───
  socket.on('next-question', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;

    const game = room.currentGame;
    let logic;
    if (game === 'trivia') logic = triviaLogic;
    else if (game === 'wordscramble') logic = wordScrambleLogic;
    else if (game === 'speedmath') logic = speedMathLogic;
    else if (game === 'emoji') logic = emojiLogic;
    else if (game === 'drawguess') logic = drawGuessLogic;
    else if (game === 'wouldyourather') logic = wouldYouRatherLogic;
    else if (game === 'knowme') logic = knowmeLogic;
    if (!logic) return;

    const hasNext = logic.nextRound(room);
    if (hasNext) {
      let data;
      if (game === 'trivia') data = triviaLogic.getCurrentQuestion(room);
      else if (game === 'wordscramble') data = wordScrambleLogic.getCurrentWord(room);
      else if (game === 'speedmath') data = speedMathLogic.getCurrentProblem(room);
      else if (game === 'emoji') data = emojiLogic.getCurrentPuzzle(room);
      else if (game === 'wouldyourather') data = wouldYouRatherLogic.getCurrentQuestion(room);
      else if (game === 'knowme') data = knowmeLogic.getCurrentQuestion(room);
      else if (game === 'drawguess') {
        // Draw & Guess: next turn starts with word choices
        const choiceData = drawGuessLogic.getWordChoices(room);
        if (choiceData) {
          io.to(choiceData.drawerId).emit('word-choices', choiceData);
          room.players.forEach(p => {
            if (p.id !== choiceData.drawerId) {
              io.to(p.id).emit('word-choices', { ...choiceData, words: undefined });
            }
          });
          startAutoChooseTimer(room);
          return;
        }
      }
      if (data) io.to(room.code).emit('game-state', data);
    } else {
      const results = logic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── HOST: SHOW ROUND RESULTS ───
  socket.on('show-results', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;

    clearHintTimers(room);

    const game = room.currentGame;
    let roundData;
    if (game === 'trivia') roundData = triviaLogic.getRoundResults(room);
    else if (game === 'wordscramble') roundData = wordScrambleLogic.getRoundResults(room);
    else if (game === 'speedmath') roundData = speedMathLogic.getRoundResults(room);
    else if (game === 'emoji') roundData = emojiLogic.getRoundResults(room);
    else if (game === 'drawguess') roundData = drawGuessLogic.getRoundResults(room);
    else if (game === 'wouldyourather') roundData = wouldYouRatherLogic.getRoundResults(room);
    else if (game === 'knowme') roundData = knowmeLogic.getRoundResults(room);

    if (roundData) io.to(room.code).emit('round-result', roundData);
  });

  // ─── HOST: END GAME EARLY ───
  socket.on('end-game-early', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== 'playing') return;

    clearAutoChooseTimer(room);
    clearHintTimers(room);

    const game = room.currentGame;
    let logic;
    if (game === 'trivia') logic = triviaLogic;
    else if (game === 'wordscramble') logic = wordScrambleLogic;
    else if (game === 'speedmath') logic = speedMathLogic;
    else if (game === 'emoji') logic = emojiLogic;
    else if (game === 'drawguess') logic = drawGuessLogic;
    else if (game === 'codenames') logic = codenamesLogic;
    else if (game === 'colorclash') logic = colorClashLogic;
    else if (game === 'blackjack') logic = blackjackLogic;
    else if (game === 'hangman') logic = hangmanLogic;
    else if (game === 'memorymatch') logic = memoryMatchLogic;
    else if (game === 'spyfall') logic = spyfallLogic;
    else if (game === 'wavelength') logic = wavelengthLogic;
    else if (game === 'justone') logic = justOneLogic;
    else if (game === 'wouldyourather') logic = wouldYouRatherLogic;
    else if (game === 'wordchain') logic = wordChainLogic;
    else if (game === 'imposter') logic = imposterLogic;
    else if (game === 'ludo') logic = ludoLogic;
    else if (game === 'poker') logic = pokerLogic;
    else if (game === 'chess') logic = chessLogic;
    else if (game === 'battleship') logic = battleshipLogic;
    else if (game === 'rummy') logic = rummyLogic;
    else if (game === 'coup') logic = coupLogic;
    else if (game === 'wordle') logic = wordleLogic;
    else if (game === 'dixit') logic = dixitLogic;
    else if (game === 'knowme') logic = knowmeLogic;
    else if (game === 'connectfour') logic = connectFourLogic;
    else if (game === 'tictactoe') logic = ticTacToeLogic;

    if (logic) {
      const results = logic.getResults(room);
      recordGameResults(room);
      // Emit both generic and game-specific end events
      io.to(room.code).emit('game-over', results);
      if (game === 'codenames') io.to(room.code).emit('codenames-over', results);
      else if (game === 'colorclash') io.to(room.code).emit('cc-over', results);
      else if (game === 'blackjack') {
        room.players.forEach(p => {
          const view = blackjackLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('bj-update', { ...view, phase: 'ended' });
        });
      }
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── REMATCH ───
  socket.on('rematch', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id || !room.lastGame) return;

    const { gameType, category, settings } = room.lastGame;

    // Reset scores for new game but keep session scores
    room.currentGame = gameType;
    room.status = 'playing';
    // Remove spectator flags
    room.players.forEach(p => { p.isSpectator = false; });

    if (gameType === 'trivia') triviaLogic.init(room, category, settings);
    else if (gameType === 'wordscramble') wordScrambleLogic.init(room, category, settings);
    else if (gameType === 'speedmath') speedMathLogic.init(room, settings);
    else if (gameType === 'emoji') emojiLogic.init(room, category, settings);
    else if (gameType === 'drawguess') drawGuessLogic.init(room, settings);
    else if (gameType === 'codenames') codenamesLogic.init(room);
    else if (gameType === 'colorclash') colorClashLogic.init(room);
    else if (gameType === 'blackjack') blackjackLogic.init(room);
    else if (gameType === 'hangman') hangmanLogic.init(room, category, settings);
    else if (gameType === 'memorymatch') memoryMatchLogic.init(room, settings);
    else if (gameType === 'spyfall') spyfallLogic.init(room, settings);
    else if (gameType === 'wavelength') wavelengthLogic.init(room, settings);
    else if (gameType === 'justone') justOneLogic.init(room, settings);
    else if (gameType === 'wouldyourather') wouldYouRatherLogic.init(room, settings);
    else if (gameType === 'wordchain') wordChainLogic.init(room, settings);
    else if (gameType === 'imposter') { settings.category = category; imposterLogic.init(room, settings); }
    else if (gameType === 'ludo') ludoLogic.init(room);
    else if (gameType === 'poker') pokerLogic.init(room);
    else if (gameType === 'chess') chessLogic.init(room);
    else if (gameType === 'battleship') battleshipLogic.init(room);
    else if (gameType === 'rummy') rummyLogic.init(room, settings);
    else if (gameType === 'coup') coupLogic.init(room);
    else if (gameType === 'wordle') wordleLogic.init(room, settings);
    else if (gameType === 'dixit') dixitLogic.init(room, settings);
    else if (gameType === 'knowme') knowmeLogic.init(room, settings);
    else if (gameType === 'connectfour') connectFourLogic.init(room);
    else if (gameType === 'tictactoe') ticTacToeLogic.init(room);

    // Check if init succeeded (some games need minimum players)
    if (!room.gameState) {
      room.currentGame = null;
      room.status = 'lobby';
      const minPlayers = { chess: 1, battleship: 2, rummy: 2, coup: 2, dixit: 3, codenames: 4, ludo: 2, poker: 2, knowme: 2, connectfour: 2, tictactoe: 2 };
      const needed = minPlayers[gameType] || 2;
      socket.emit('game-error', { message: `${gameType.charAt(0).toUpperCase() + gameType.slice(1)} requires at least ${needed} players` });
      return;
    }

    io.to(room.code).emit('game-starting', { gameType });

    setTimeout(() => {
      let data;
      if (gameType === 'trivia') data = triviaLogic.getCurrentQuestion(room);
      else if (gameType === 'wordscramble') data = wordScrambleLogic.getCurrentWord(room);
      else if (gameType === 'speedmath') data = speedMathLogic.getCurrentProblem(room);
      else if (gameType === 'emoji') data = emojiLogic.getCurrentPuzzle(room);
      else if (gameType === 'drawguess') {
        data = drawGuessLogic.getWordChoices(room);
        if (data) {
          io.to(data.drawerId).emit('word-choices', data);
          room.players.forEach(p => {
            if (p.id !== data.drawerId) {
              io.to(p.id).emit('word-choices', { ...data, words: undefined });
            }
          });
          startAutoChooseTimer(room);
          return;
        }
      }
      if (gameType === 'codenames') {
        room.players.forEach(p => {
          io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id));
        });
        return;
      }
      if (gameType === 'colorclash') {
        room.players.forEach(p => {
          io.to(p.id).emit('cc-state', colorClashLogic.getPlayerState(room, p.id));
        });
        return;
      }
      if (gameType === 'blackjack') {
        room.players.forEach(p => {
          io.to(p.id).emit('bj-state', blackjackLogic.getPlayerView(room, p.id));
        });
        return;
      }
      if (gameType === 'hangman') {
        const state = hangmanLogic.getCurrentState(room);
        io.to(room.code).emit('hangman-state', state);
        return;
      }
      if (gameType === 'memorymatch') {
        room.players.forEach(p => {
          io.to(p.id).emit('mm-state', memoryMatchLogic.getPlayerView(room, p.id));
        });
        return;
      }
      if (gameType === 'spyfall') {
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
        });
        return;
      }
      if (gameType === 'wavelength') {
        const gs = room.gameState;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.giverOrder[gs.currentRound]) {
            io.to(p.id).emit('wavelength-clue-view', wavelengthLogic.getClueGiverView(room));
          } else {
            io.to(p.id).emit('wavelength-guess-view', wavelengthLogic.getGuesserView(room));
          }
        });
        return;
      }
      if (gameType === 'justone') {
        const gs = room.gameState;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.guesserOrder[gs.currentRound]) {
            io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
          } else {
            io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
          }
        });
        return;
      }
      if (gameType === 'wordchain') {
        io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
        return;
      }
      if (gameType === 'imposter') {
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
        });
        return;
      }
      if (gameType === 'ludo') {
        room.players.forEach(p => {
          const view = ludoLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('ludo-state', view);
        });
        return;
      }
      if (gameType === 'poker') {
        room.players.forEach(p => {
          const view = pokerLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('poker-state', view);
        });
        return;
      }
      if (gameType === 'chess') {
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-state', view);
        });
        return;
      }
      if (gameType === 'battleship') {
        room.players.forEach(p => {
          const view = battleshipLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('battleship-state', view);
        });
        return;
      }
      if (gameType === 'rummy') {
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-state', view);
        });
        return;
      }
      if (gameType === 'coup') {
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-state', view);
        });
        return;
      }
      if (gameType === 'wordle') {
        room.players.forEach(p => {
          const view = wordleLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('wordle-state', view);
        });
        return;
      }
      if (gameType === 'dixit') {
        room.players.forEach(p => {
          const view = dixitLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('dixit-state', view);
        });
        return;
      }
      if (gameType === 'knowme') {
        data = knowmeLogic.getCurrentQuestion(room);
      }
      if (gameType === 'connectfour') {
        room.players.forEach(p => {
          const view = connectFourLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('connectfour-state', view);
        });
        return;
      }
      if (gameType === 'tictactoe') {
        room.players.forEach(p => {
          const view = ticTacToeLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('tictactoe-state', view);
        });
        return;
      }
      if (gameType === 'wouldyourather') {
        data = wouldYouRatherLogic.getCurrentQuestion(room);
      }
      if (data) io.to(room.code).emit('game-state', data);
    }, 3000);
  });

  // ─── BACK TO LOBBY ───
  socket.on('back-to-lobby', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;

    clearAutoChooseTimer(room);
    clearHintTimers(room);
    room.status = 'lobby';
    room.currentGame = null;
    room.gameState = null;
    // Convert spectators to regular players
    room.players.forEach(p => { p.isSpectator = false; });
    io.to(room.code).emit('back-to-lobby', { players: room.players });
  });

  // ─── DRAW & GUESS: relay drawing data ───
  socket.on('draw-data', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'drawguess') return;
    socket.to(room.code).emit('draw-data', data);
  });

  socket.on('draw-clear', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'drawguess') return;
    socket.to(room.code).emit('draw-clear');
  });

  socket.on('draw-fill', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'drawguess') return;
    socket.to(room.code).emit('draw-fill', data);
  });

  socket.on('draw-undo', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'drawguess') return;
    socket.to(room.code).emit('draw-undo', data || {});
  });

  // ─── CODENAMES EVENTS ───
  socket.on('codenames-join', ({ team }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'codenames') return;
    const result = codenamesLogic.joinTeam(room, socket.id, team);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id));
      });
    }
  });

  socket.on('codenames-spymaster', ({ team }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'codenames') return;
    const result = codenamesLogic.setSpymaster(room, socket.id, team);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id));
      });
    }
  });

  socket.on('codenames-start', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'codenames' || room.hostId !== socket.id) return;
    const result = codenamesLogic.startGame(room);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('codenames-state', codenamesLogic.getGameState(room, p.id));
      });
    }
  });

  socket.on('codenames-clue', ({ word, number }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'codenames') return;
    const result = codenamesLogic.giveClue(room, socket.id, word, number);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('codenames-update', codenamesLogic.getGameState(room, p.id));
      });
    }
  });

  socket.on('codenames-pick', ({ cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'codenames') return;
    const result = codenamesLogic.pickCard(room, socket.id, cardIndex);
    if (result) {
      if (result.gameOver) {
        io.to(room.code).emit('codenames-over', codenamesLogic.getResults(room));
        room.status = 'lobby';
        room.currentGame = null;
      } else {
        room.players.forEach(p => {
          io.to(p.id).emit('codenames-update', codenamesLogic.getGameState(room, p.id));
        });
      }
    }
  });

  socket.on('codenames-end-turn', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'codenames') return;
    const result = codenamesLogic.endTurn(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('codenames-update', codenamesLogic.getGameState(room, p.id));
      });
    }
  });

  // ─── COLOR CLASH (UNO) EVENTS ───
  socket.on('cc-play', ({ cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'colorclash') return;
    const result = colorClashLogic.playCard(room, socket.id, cardIndex);
    if (!result) return;

    if (result.action === 'win') {
      const results = colorClashLogic.getResults(room);
      io.to(room.code).emit('cc-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    } else {
      room.players.forEach(p => {
        io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id));
      });
    }
  });

  socket.on('cc-draw', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'colorclash') return;
    const result = colorClashLogic.drawCards(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id));
      });
    }
  });

  socket.on('cc-pick-color', ({ color }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'colorclash') return;
    const result = colorClashLogic.pickColor(room, socket.id, color);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id));
      });
    }
  });

  socket.on('cc-uno', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'colorclash') return;
    const result = colorClashLogic.callUno(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id));
      });
    }
  });

  socket.on('cc-catch', ({ targetId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'colorclash') return;
    const result = colorClashLogic.catchUno(room, socket.id, targetId);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id));
      });
    }
  });

  // ─── BLACKJACK EVENTS ───
  socket.on('bj-bet', ({ amount }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'blackjack') return;
    const result = blackjackLogic.placeBet(room, socket.id, amount);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('bj-hit', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'blackjack') return;
    const result = blackjackLogic.hit(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('bj-stand', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'blackjack') return;
    const result = blackjackLogic.stand(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('bj-double', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'blackjack') return;
    const result = blackjackLogic.doubleDown(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('bj-new-round', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'blackjack' || room.hostId !== socket.id) return;
    const result = blackjackLogic.newRound(room);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id));
      });
    }
  });

  // ─── HANGMAN EVENTS ───
  socket.on('hangman-guess', ({ letter }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'hangman') return;
    const result = hangmanLogic.handleGuess(room, socket.id, letter);
    if (!result) return;

    if (result.action === 'solved' || result.action === 'hanged') {
      const state = hangmanLogic.getCurrentState(room);
      io.to(room.code).emit('hangman-round-over', state);
    } else {
      const state = hangmanLogic.getCurrentState(room);
      io.to(room.code).emit('hangman-update', state);
    }
  });

  socket.on('hangman-timeout', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'hangman') return;
    const result = hangmanLogic.timeOut(room);
    if (!result) return;
    const state = hangmanLogic.getCurrentState(room);
    io.to(room.code).emit('hangman-round-over', state);
  });

  socket.on('hangman-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'hangman' || room.hostId !== socket.id) return;
    const result = hangmanLogic.nextRound(room);
    if (!result) return;

    if (result.action === 'gameOver') {
      const results = hangmanLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    } else {
      const state = hangmanLogic.getCurrentState(room);
      io.to(room.code).emit('hangman-state', state);
    }
  });

  // ─── MEMORY MATCH EVENTS ───
  socket.on('mm-flip', ({ cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'memorymatch') return;
    const result = memoryMatchLogic.flipCard(room, socket.id, cardIndex);
    if (!result) return;

    if (result.action === 'gameOver') {
      const results = memoryMatchLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    } else if (result.action === 'match') {
      room.players.forEach(p => {
        io.to(p.id).emit('mm-match', memoryMatchLogic.getPlayerView(room, p.id));
      });
    } else if (result.action === 'mismatch') {
      room.players.forEach(p => {
        io.to(p.id).emit('mm-mismatch', memoryMatchLogic.getPlayerView(room, p.id));
      });
    } else {
      room.players.forEach(p => {
        io.to(p.id).emit('mm-flip', memoryMatchLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('mm-hide', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'memorymatch') return;
    const result = memoryMatchLogic.hideMismatch(room);
    if (!result) return;
    room.players.forEach(p => {
      io.to(p.id).emit('mm-update', memoryMatchLogic.getPlayerView(room, p.id));
    });
  });

  // ─── SPYFALL EVENTS ───
  socket.on('spyfall-next-asker', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'spyfall') return;
    spyfallLogic.advanceAsker(room);
    room.players.forEach(p => {
      if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
    });
  });

  socket.on('spyfall-vote-start', ({ targetId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'spyfall') return;
    const result = spyfallLogic.startVote(room, targetId);
    if (result) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('spyfall-voting', spyfallLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('spyfall-vote', ({ vote }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'spyfall') return;
    const result = spyfallLogic.castVote(room, socket.id, vote);
    if (!result) return;
    if (result.waiting) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('spyfall-voting', spyfallLogic.getPlayerView(room, p.id));
      });
    } else if (result.resolved) {
      io.to(room.code).emit('spyfall-vote-result', result);
      if (result.spyCaught !== undefined) {
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('spyfall-reveal', spyfallLogic.getPlayerView(room, p.id));
        });
      }
    }
  });

  socket.on('spyfall-guess', ({ guess }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'spyfall') return;
    const result = spyfallLogic.spyGuessLocation(room, socket.id, guess);
    if (result) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('spyfall-reveal', spyfallLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('spyfall-timeout', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'spyfall') return;
    const result = spyfallLogic.timeUp(room);
    if (result) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('spyfall-reveal', spyfallLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('spyfall-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'spyfall' || room.hostId !== socket.id) return;
    const hasNext = spyfallLogic.nextRound(room);
    if (hasNext) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
      });
    } else {
      const results = spyfallLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── IMPOSTER EVENTS ───
  socket.on('imposter-describe', ({ description }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'imposter') return;
    const result = imposterLogic.submitDescription(room, socket.id, description);
    if (!result) return;
    room.players.forEach(p => {
      if (!p.isSpectator) {
        if (result.allDone) {
          io.to(p.id).emit('imposter-voting', imposterLogic.getPlayerView(room, p.id));
        } else {
          io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
        }
      }
    });
  });

  socket.on('imposter-skip', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'imposter' || room.hostId !== socket.id) return;
    const result = imposterLogic.skipDescription(room);
    if (!result) return;
    room.players.forEach(p => {
      if (!p.isSpectator) {
        if (result.allDone) {
          io.to(p.id).emit('imposter-voting', imposterLogic.getPlayerView(room, p.id));
        } else {
          io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
        }
      }
    });
  });

  socket.on('imposter-vote', ({ targetId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'imposter') return;
    const result = imposterLogic.castVote(room, socket.id, targetId);
    if (!result) return;
    if (result.waiting) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('imposter-voting', imposterLogic.getPlayerView(room, p.id));
      });
    } else if (result.resolved) {
      if (result.imposterCaught && result.awaitingGuess) {
        // Imposter caught — show guess phase
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('imposter-guess-phase', imposterLogic.getPlayerView(room, p.id));
        });
      } else {
        // Round over (wrong vote or tie)
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('imposter-reveal', imposterLogic.getPlayerView(room, p.id));
        });
      }
    }
  });

  socket.on('imposter-guess-word', ({ guess }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'imposter') return;
    const result = imposterLogic.imposterGuessWord(room, socket.id, guess);
    if (result) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('imposter-reveal', imposterLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('imposter-continue', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'imposter' || room.hostId !== socket.id) return;
    const continued = imposterLogic.continueVotingRound(room);
    if (continued) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('imposter-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'imposter' || room.hostId !== socket.id) return;
    const hasNext = imposterLogic.nextRound(room);
    if (hasNext) {
      room.players.forEach(p => {
        if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
      });
    } else {
      const results = imposterLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── LUDO EVENTS ───
  socket.on('ludo-roll', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'ludo') return;
    const result = ludoLogic.rollDice(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('ludo-update', ludoLogic.getPlayerView(room, p.id));
      });
      if (result.gameOver) {
        const results = ludoLogic.getResults(room);
        recordGameResults(room);
        io.to(room.code).emit('game-over', results);
        room.status = 'lobby';
        room.currentGame = null;
      }
    }
  });

  socket.on('ludo-move', ({ tokenIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'ludo') return;
    const result = ludoLogic.moveToken(room, socket.id, tokenIndex);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('ludo-update', ludoLogic.getPlayerView(room, p.id));
      });
      if (result.gameOver) {
        const results = ludoLogic.getResults(room);
        recordGameResults(room);
        io.to(room.code).emit('game-over', results);
        room.status = 'lobby';
        room.currentGame = null;
      }
    }
  });

  socket.on('ludo-end', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'ludo' || room.hostId !== socket.id) return;
    const results = ludoLogic.getResults(room);
    recordGameResults(room);
    io.to(room.code).emit('game-over', results);
    room.status = 'lobby';
    room.currentGame = null;
  });

  // ─── POKER EVENTS ───
  socket.on('poker-fold', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker') return;
    const result = pokerLogic.fold(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('poker-check', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker') return;
    const result = pokerLogic.check(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('poker-call', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker') return;
    const result = pokerLogic.call(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('poker-raise', ({ amount }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker') return;
    const result = pokerLogic.raise(room, socket.id, amount);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('poker-allin', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker') return;
    const result = pokerLogic.allIn(room, socket.id);
    if (result) {
      room.players.forEach(p => {
        io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id));
      });
    }
  });

  socket.on('poker-new-hand', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker' || room.hostId !== socket.id) return;
    const result = pokerLogic.newHand(room);
    if (!result) return;
    const gs = room.gameState;
    if (gs.phase === 'finished') {
      const results = pokerLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
      return;
    }
    room.players.forEach(p => {
      io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id));
    });
  });

  socket.on('poker-end', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'poker' || room.hostId !== socket.id) return;
    const results = pokerLogic.getResults(room);
    recordGameResults(room);
    io.to(room.code).emit('game-over', results);
    room.status = 'lobby';
    room.currentGame = null;
  });

  // ─── CHESS EVENTS ───
  socket.on('chess-move', ({ fromR, fromC, toR, toC, promotion }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'chess') return;
    const result = chessLogic.makeMove(room, socket.id, fromR, fromC, toR, toC, promotion);
    if (!result) return;
    room.players.forEach(p => {
      const view = chessLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('chess-update', view);
    });
    if (result.gameOver) {
      const results = chessLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // AI move — allows the human player to submit a move on behalf of the AI opponent
  socket.on('chess-ai-move', ({ fromR, fromC, toR, toC, promotion }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'chess') { console.log('[Chess AI] Room not found or not chess game'); return; }
    const gs = room.gameState;
    if (!gs || !gs.aiMode) { console.log('[Chess AI] No game state or not AI mode'); return; }
    // Determine AI's player id
    const aiId = gs.whiteId === socket.id ? gs.blackId : (gs.blackId === socket.id ? gs.whiteId : null);
    if (!aiId) { console.log('[Chess AI] Could not determine AI id. socket:', socket.id, 'white:', gs.whiteId, 'black:', gs.blackId); return; }
    const result = chessLogic.makeMove(room, aiId, fromR, fromC, toR, toC, promotion);
    if (!result) { console.log('[Chess AI] makeMove returned null for', { fromR, fromC, toR, toC, aiId, turn: gs.turn }); return; }
    room.players.forEach(p => {
      const view = chessLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('chess-update', view);
    });
    if (result.gameOver) {
      const results = chessLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('chess-resign', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'chess') return;
    const result = chessLogic.resign(room, socket.id);
    if (!result) return;
    room.players.forEach(p => {
      const view = chessLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('chess-update', view);
    });
    const results = chessLogic.getResults(room);
    recordGameResults(room);
    io.to(room.code).emit('game-over', results);
    room.status = 'lobby';
    room.currentGame = null;
  });

  socket.on('chess-draw-offer', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'chess') return;
    const result = chessLogic.offerDraw(room, socket.id);
    if (!result) return;
    room.players.forEach(p => {
      const view = chessLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('chess-update', view);
    });
  });

  socket.on('chess-draw-respond', ({ accept }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'chess') return;
    const result = chessLogic.respondDraw(room, socket.id, accept);
    if (!result) return;
    room.players.forEach(p => {
      const view = chessLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('chess-update', view);
    });
    if (result.accepted) {
      const results = chessLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── BATTLESHIP EVENTS ───
  socket.on('battleship-place', ({ ships }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'battleship') return;
    const result = battleshipLogic.placeShips(room, socket.id, ships);
    if (!result) return;
    room.players.forEach(p => {
      const view = battleshipLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('battleship-update', view);
    });
  });

  socket.on('battleship-auto-place', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'battleship') return;
    const result = battleshipLogic.autoPlaceShips(room, socket.id);
    if (!result) return;
    room.players.forEach(p => {
      const view = battleshipLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('battleship-update', view);
    });
  });

  socket.on('battleship-fire', ({ row, col }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'battleship') return;
    const result = battleshipLogic.fireShot(room, socket.id, row, col);
    if (!result) return;
    room.players.forEach(p => {
      const view = battleshipLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('battleship-update', view);
    });
    if (result.gameOver) {
      const results = battleshipLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── CONNECT FOUR EVENTS ───
  socket.on('connectfour-move', ({ col }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'connectfour') return;
    const result = connectFourLogic.dropDisc(room, socket.id, col);
    if (!result) return;
    room.players.forEach(p => {
      const view = connectFourLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('connectfour-update', view);
    });
    if (result.action === 'win' || result.action === 'draw') {
      const results = connectFourLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── TIC TAC TOE EVENTS ───
  socket.on('tictactoe-move', ({ row, col }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'tictactoe') return;
    const result = ticTacToeLogic.makeMove(room, socket.id, row, col);
    if (!result) return;
    room.players.forEach(p => {
      const view = ticTacToeLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('tictactoe-update', view);
    });
    if (result.action === 'win' || result.action === 'draw') {
      const results = ticTacToeLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── RUMMY EVENTS ───
  socket.on('rummy-draw-deck', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'rummy') return;
    const result = rummyLogic.drawFromDeck(room, socket.id);
    if (!result) return;
    room.players.forEach(p => {
      const view = rummyLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('rummy-update', view);
    });
  });

  socket.on('rummy-draw-discard', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'rummy') return;
    const result = rummyLogic.drawFromDiscard(room, socket.id);
    if (!result) return;
    room.players.forEach(p => {
      const view = rummyLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('rummy-update', view);
    });
  });

  socket.on('rummy-discard', ({ cardId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'rummy') return;
    const result = rummyLogic.discard(room, socket.id, cardId);
    if (!result) return;
    room.players.forEach(p => {
      const view = rummyLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('rummy-update', view);
    });
    if (result.gameOver) {
      const results = rummyLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('rummy-lay-meld', ({ cardIds }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'rummy') return;
    const result = rummyLogic.layMeld(room, socket.id, cardIds);
    if (!result) {
      socket.emit('rummy-error', { message: 'Invalid meld! Must be 3+ cards of same value (set) or consecutive same-suit cards (run).' });
      return;
    }
    room.players.forEach(p => {
      const view = rummyLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('rummy-update', view);
    });
  });

  socket.on('rummy-lay-off', ({ cardIndex, meldIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'rummy') return;
    const result = rummyLogic.layOff(room, socket.id, cardIndex, meldIndex);
    if (!result) return;
    room.players.forEach(p => {
      const view = rummyLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('rummy-update', view);
    });
  });

  // ─── COUP EVENTS ───
  socket.on('coup-action', ({ action, targetId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'coup') return;
    const result = coupLogic.takeAction(room, socket.id, action, targetId);
    if (!result) return;
    room.players.forEach(p => {
      const view = coupLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('coup-update', view);
    });
    if (result.gameOver) {
      const results = coupLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('coup-challenge', ({ challenge }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'coup') return;
    const result = coupLogic.respondChallenge(room, socket.id, challenge);
    if (!result) return;
    room.players.forEach(p => {
      const view = coupLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('coup-update', view);
    });
    if (result.gameOver) {
      const results = coupLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('coup-counter', ({ counter, claimedRole }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'coup') return;
    const result = coupLogic.respondCounter(room, socket.id, counter, claimedRole);
    if (!result) return;
    room.players.forEach(p => {
      const view = coupLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('coup-update', view);
    });
    if (result.gameOver) {
      const results = coupLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('coup-counter-challenge', ({ challenge }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'coup') return;
    const result = coupLogic.respondCounterChallenge(room, socket.id, challenge);
    if (!result) return;
    room.players.forEach(p => {
      const view = coupLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('coup-update', view);
    });
    if (result.gameOver) {
      const results = coupLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('coup-lose-card', ({ cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'coup') return;
    const result = coupLogic.loseCard(room, socket.id, cardIndex);
    if (!result) return;
    room.players.forEach(p => {
      const view = coupLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('coup-update', view);
    });
    if (result.gameOver) {
      const results = coupLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('coup-exchange', ({ keptCards }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'coup') return;
    const result = coupLogic.exchangeCards(room, socket.id, keptCards);
    if (!result) return;
    room.players.forEach(p => {
      const view = coupLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('coup-update', view);
    });
    if (result.gameOver) {
      const results = coupLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── WORDLE EVENTS ───
  socket.on('wordle-guess', ({ guess }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wordle') return;
    const result = wordleLogic.submitGuess(room, socket.id, guess);
    if (!result) return;
    room.players.forEach(p => {
      const view = wordleLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('wordle-update', view);
    });
    if (result.allDone) {
      // Check if game is over
      const gs = room.gameState;
      if (gs.phase === 'finished') {
        const results = wordleLogic.getResults(room);
        recordGameResults(room);
        io.to(room.code).emit('game-over', results);
        room.status = 'lobby';
        room.currentGame = null;
      }
    }
  });

  socket.on('wordle-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wordle' || room.hostId !== socket.id) return;
    const hasNext = wordleLogic.nextRound(room);
    if (!hasNext) {
      // All rounds done — game is finished
      const results = wordleLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
      return;
    }
    room.players.forEach(p => {
      const view = wordleLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('wordle-update', view);
    });
  });

  // ─── DIXIT EVENTS ───
  socket.on('dixit-submit-clue', ({ clue, cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'dixit') return;
    const result = dixitLogic.submitClue(room, socket.id, clue, cardIndex);
    if (!result) return;
    room.players.forEach(p => {
      const view = dixitLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('dixit-update', view);
    });
  });

  socket.on('dixit-play-card', ({ cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'dixit') return;
    const result = dixitLogic.playCard(room, socket.id, cardIndex);
    if (!result) return;
    room.players.forEach(p => {
      const view = dixitLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('dixit-update', view);
    });
  });

  socket.on('dixit-vote', ({ cardIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'dixit') return;
    const result = dixitLogic.vote(room, socket.id, cardIndex);
    if (!result) return;
    room.players.forEach(p => {
      const view = dixitLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('dixit-update', view);
    });
    if (result.allVoted && room.gameState && room.gameState.phase === 'finished') {
      const results = dixitLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  socket.on('dixit-next-round', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'dixit' || room.hostId !== socket.id) return;
    const result = dixitLogic.nextRound(room);
    if (!result) return;
    room.players.forEach(p => {
      const view = dixitLogic.getPlayerView(room, p.id);
      if (view) io.to(p.id).emit('dixit-update', view);
    });
  });

  // ─── WAVELENGTH EVENTS ───
  socket.on('wavelength-clue', ({ clue }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wavelength') return;
    const result = wavelengthLogic.submitClue(room, socket.id, clue);
    if (result) {
      // Send guesser view to all non-clue-givers
      const gs = room.gameState;
      room.players.forEach(p => {
        if (p.isSpectator) return;
        if (p.id === gs.giverOrder[gs.currentRound]) return; // clue giver waits
        const view = wavelengthLogic.getGuesserView(room);
        view.hasGuessed = !!gs.guesses[p.id];
        io.to(p.id).emit('wavelength-guess-view', view);
      });
    }
  });

  socket.on('wavelength-guess', ({ guess }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wavelength') return;
    const result = wavelengthLogic.submitGuess(room, socket.id, guess);
    if (!result) return;

    // Check if all guessers have guessed
    const gs = room.gameState;
    const guessers = room.players.filter(p => !p.isSpectator && p.id !== gs.giverOrder[gs.currentRound]);
    const allGuessed = guessers.every(p => gs.guesses[p.id] !== undefined);
    if (allGuessed) {
      const reveal = wavelengthLogic.getRevealData(room);
      io.to(room.code).emit('wavelength-reveal', reveal);
    }
  });

  socket.on('wavelength-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wavelength' || room.hostId !== socket.id) return;
    const hasNext = wavelengthLogic.nextRound(room);
    if (hasNext) {
      const gs = room.gameState;
      room.players.forEach(p => {
        if (p.isSpectator) return;
        if (p.id === gs.giverOrder[gs.currentRound]) {
          io.to(p.id).emit('wavelength-clue-view', wavelengthLogic.getClueGiverView(room));
        } else {
          io.to(p.id).emit('wavelength-guess-view', wavelengthLogic.getGuesserView(room));
        }
      });
    } else {
      const results = wavelengthLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── JUST ONE EVENTS ───
  socket.on('justone-clue', ({ clue }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'justone') return;
    const result = justOneLogic.submitClue(room, socket.id, clue);
    if (!result) return;

    // Check if all clue-givers submitted
    const gs = room.gameState;
    const clueGivers = room.players.filter(p => !p.isSpectator && p.id !== gs.guesserOrder[gs.currentRound]);
    const allSubmitted = clueGivers.every(p => gs.clues[p.id] !== undefined);
    if (allSubmitted) {
      gs.phase = 'review';
      room.players.forEach(p => {
        if (p.isSpectator) return;
        if (p.id === gs.guesserOrder[gs.currentRound]) {
          io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
        } else {
          io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
        }
      });
    } else {
      // Send updated clue count
      room.players.forEach(p => {
        if (p.isSpectator) return;
        if (p.id === gs.guesserOrder[gs.currentRound]) {
          io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
        } else {
          io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
        }
      });
    }
  });

  socket.on('justone-confirm', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'justone' || room.hostId !== socket.id) return;
    const filtered = justOneLogic.filterClues(room);
    if (!filtered) return;
    const gs = room.gameState;
    room.players.forEach(p => {
      if (p.isSpectator) return;
      if (p.id === gs.guesserOrder[gs.currentRound]) {
        io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
      } else {
        io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
      }
    });
  });

  socket.on('justone-guess', ({ guess }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'justone') return;
    const result = justOneLogic.submitGuess(room, socket.id, guess);
    if (!result) return;
    const gs = room.gameState;
    room.players.forEach(p => {
      if (p.isSpectator) return;
      if (p.id === gs.guesserOrder[gs.currentRound]) {
        io.to(p.id).emit('justone-state', { ...justOneLogic.getGuesserView(room), reveal: result });
      } else {
        io.to(p.id).emit('justone-state', { ...justOneLogic.getClueGiverView(room, p.id), reveal: result });
      }
    });
  });

  socket.on('justone-skip', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'justone') return;
    const result = justOneLogic.skipGuess(room);
    if (!result) return;
    const gs = room.gameState;
    room.players.forEach(p => {
      if (p.isSpectator) return;
      if (p.id === gs.guesserOrder[gs.currentRound]) {
        io.to(p.id).emit('justone-state', { ...justOneLogic.getGuesserView(room), reveal: result });
      } else {
        io.to(p.id).emit('justone-state', { ...justOneLogic.getClueGiverView(room, p.id), reveal: result });
      }
    });
  });

  socket.on('justone-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'justone' || room.hostId !== socket.id) return;
    const hasNext = justOneLogic.nextRound(room);
    if (hasNext) {
      const gs = room.gameState;
      room.players.forEach(p => {
        if (p.isSpectator) return;
        if (p.id === gs.guesserOrder[gs.currentRound]) {
          io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
        } else {
          io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
        }
      });
    } else {
      const results = justOneLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    }
  });

  // ─── WORD CHAIN EVENTS ───
  socket.on('wordchain-word', ({ word }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wordchain') return;
    const result = wordChainLogic.handleWord(room, socket.id, word);
    if (!result) return;

    if (result.eliminated) {
      io.to(room.code).emit('wordchain-eliminated', result);
    }
    if (result.gameOver) {
      const results = wordChainLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    } else {
      io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
    }
  });

  socket.on('wordchain-timeout', ({ playerId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.currentGame !== 'wordchain') return;
    const result = wordChainLogic.handleTimeout(room, playerId);
    if (!result) return;

    if (result.eliminated) {
      io.to(room.code).emit('wordchain-eliminated', result);
    }
    if (result.gameOver) {
      const results = wordChainLogic.getResults(room);
      recordGameResults(room);
      io.to(room.code).emit('game-over', results);
      room.status = 'lobby';
      room.currentGame = null;
    } else {
      io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
    }
  });

  // ─── EMOJI REACTIONS ───
  socket.on('reaction', ({ emoji }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const allowed = ['😂','🔥','👏','❤️','😮','💀','🎉','👀','😭','🤔'];
    if (!allowed.includes(emoji)) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    socket.to(room.code).emit('reaction', { name: player.name, emoji });
  });

  // ─── KICK PLAYER ───
  socket.on('kick-player', ({ playerId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;

    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx !== -1 && !room.players[idx].isHost) {
      room.players.splice(idx, 1);
      io.to(playerId).emit('kicked');
      const kickedSocket = io.sockets.sockets.get(playerId);
      if (kickedSocket) {
        kickedSocket.leave(room.code);
        kickedSocket.roomCode = null;
      }
      io.to(room.code).emit('player-joined', { players: room.players });
    }
  });

  // ─── DISCONNECT ───
  // ─── TOURNAMENT ───
  socket.on('create-tournament', ({ name, games }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id || !socket.userId) return;
    const result = dbModule.createTournament(name, room.code, socket.userId, games);
    if (result.error) { socket.emit('tournament-error', { message: result.error }); return; }
    room.tournamentId = result.tournamentId;
    io.to(room.code).emit('tournament-created', {
      tournamentId: result.tournamentId,
      name: name.substring(0, 50),
      games,
      currentGameIndex: 0
    });
  });

  socket.on('tournament-next', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id || !room.tournamentId) return;
    const t = dbModule.getTournament(room.tournamentId);
    if (!t || t.status === 'completed') {
      const standings = dbModule.getTournamentStandings(room.tournamentId);
      io.to(room.code).emit('tournament-over', { standings });
      room.tournamentId = null;
      return;
    }
    const nextGame = t.games[t.current_game_index];
    io.to(room.code).emit('tournament-next-game', {
      gameType: nextGame.gameType || nextGame,
      gameIndex: t.current_game_index,
      totalGames: t.games.length
    });
  });

  socket.on('tournament-standings', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.tournamentId) return;
    const standings = dbModule.getTournamentStandings(room.tournamentId);
    const t = dbModule.getTournament(room.tournamentId);
    socket.emit('tournament-standings', {
      standings,
      currentGameIndex: t ? t.current_game_index : 0,
      totalGames: t ? t.games.length : 0,
      status: t ? t.status : 'unknown'
    });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    // If host left, assign new host or delete room
    if (room.hostId === socket.id) {
      if (room.players.length > 0) {
        room.players[0].isHost = true;
        room.hostId = room.players[0].id;
        io.to(room.players[0].id).emit('you-are-host');
      } else {
        rooms.delete(code);
        console.log(`Room ${code} deleted (empty)`);
        return;
      }
    }

    io.to(code).emit('player-joined', { players: room.players });
    console.log(`${socket.playerName} left room ${code}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚡ Clutch running on http://localhost:${PORT}`);
});
