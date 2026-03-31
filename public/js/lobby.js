const socket = io({ transports: ['websocket', 'polling'] });

// Session data
let roomCode = sessionStorage.getItem('roomCode');
const playerName = sessionStorage.getItem('playerName');
const playerAvatar = sessionStorage.getItem('playerAvatar') || '😎';
const isHost = sessionStorage.getItem('isHost') === 'true';
let isSpectator = false;

// Redirect if no session
if (!roomCode || !playerName) {
  window.location.href = '/';
}

// Elements
const roomCodeText = document.getElementById('room-code-text');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');
const gameSelectCard = document.getElementById('game-select-card');
const waitingCard = document.getElementById('waiting-card');
const gameGrid = document.getElementById('game-grid');
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const sessionScoresCard = document.getElementById('session-scores-card');
const sessionLeaderboard = document.getElementById('session-leaderboard');
const toast = document.getElementById('toast');

// Avatar colors
const avatarColors = [
  '#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#2ecc71', '#e84393', '#00b894',
  '#6c5ce7', '#fd79a8', '#fdcb6e', '#00cec9', '#d63031'
];

// Display room code
roomCodeText.textContent = roomCode;

let lobbyGamesPlayed = 0;

// Copy code & share link buttons
document.getElementById('copy-code-btn')?.addEventListener('click', () => {
  const code = roomCodeText.textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Room code copied!')).catch(() => {});
});
document.getElementById('share-link-btn')?.addEventListener('click', () => {
  const code = roomCodeText.textContent;
  const link = `${window.location.origin}/?code=${encodeURIComponent(code)}`;
  navigator.clipboard.writeText(link).then(() => showToast('Invite link copied!')).catch(() => {});
});

// Show/hide based on host status
if (isHost) {
  waitingCard.classList.add('hidden');
  gameSelectCard.classList.remove('hidden');
} else {
  gameSelectCard.classList.add('hidden');
  waitingCard.classList.remove('hidden');
}

// ─── CONNECTION STATE ───
const connBanner = document.getElementById('connection-banner');
const connText = document.getElementById('connection-text');
let hasJoinedRoom = false;

socket.on('disconnect', () => {
  connText.textContent = 'Connection lost — reconnecting\u2026';
  connBanner.classList.add('visible', 'reconnecting');
});

socket.on('reconnect_failed', () => {
  connText.textContent = 'Unable to connect to server';
  connBanner.classList.add('visible');
  connBanner.classList.remove('reconnecting');
});

// Rejoin room on socket connect (safe: uses join-room for both host and non-host on reconnect)
socket.on('connect', () => {
  if (hasJoinedRoom) {
    // Reconnect — always use join-room to rejoin existing room
    connBanner.classList.remove('visible', 'reconnecting');
    socket.emit('join-room', { roomCode, playerName, avatar: playerAvatar });
    showToast('Reconnected', 'success');
  } else {
    // First connect
    if (isHost) {
      socket.emit('create-room', { hostName: playerName, avatar: playerAvatar });
    } else {
      socket.emit('join-room', { roomCode, playerName, avatar: playerAvatar });
    }
    hasJoinedRoom = true;
  }
});

// ─── RENDER PLAYER LIST ───
function renderPlayers(players) {
  playerCount.textContent = `${players.length} player${players.length !== 1 ? 's' : ''}`;
  playerList.innerHTML = '';

  players.forEach((player, i) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.style.animationDelay = `${i * 0.05}s`;

    const color = avatarColors[i % avatarColors.length];
    const avatarEmoji = player.avatar || player.name.charAt(0).toUpperCase();

    const kickBtn = isHost && !player.isHost
      ? `<button class="kick-btn" data-id="${player.id}" title="Kick player">✕</button>`
      : '';

    li.innerHTML = `
      <div class="player-info">
        <span class="player-online-dot" title="Online"></span>
        <div class="player-avatar" style="font-size: 1.4rem">${avatarEmoji}</div>
        <span class="player-name">${escapeHtml(player.name)}</span>
        ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
        ${player.isSpectator ? '<span class="spectator-tag">👁 Spectating</span>' : ''}
      </div>
      <div class="player-right">
        <span class="player-score">${player.score > 0 ? player.score.toLocaleString() + ' pts' : ''}</span>
        ${kickBtn}
      </div>
    `;

    playerList.appendChild(li);
  });

  // Kick button handlers
  if (isHost) {
    document.querySelectorAll('.kick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.id;
        socket.emit('kick-player', { playerId });
      });
    });
  }
}

// ─── GAME SELECTION (HOST) ───
const gamesWithCategories = ['trivia', 'wordscramble', 'emoji', 'hangman', 'imposter'];
const gamesWithSettings = ['trivia', 'wordscramble', 'speedmath', 'emoji', 'drawguess', 'hangman', 'spyfall', 'wavelength', 'justone', 'wouldyourather', 'wordchain', 'imposter', 'knowme', 'partyprompts', 'mostlikelyto', 'neverhaveiever', 'truthordrink', 'typingrace'];
const defaultSettings = {
  trivia:       { rounds: 10, timeLimit: 15, timeLabel: 'sec/question' },
  wordscramble: { rounds: 10, timeLimit: 20, timeLabel: 'sec/word' },
  speedmath:    { rounds: 10, timeLimit: 12, timeLabel: 'sec/problem' },
  emoji:        { rounds: 8,  timeLimit: 25, timeLabel: 'sec/puzzle' },
  drawguess:    { rounds: 0,  timeLimit: 80, timeLabel: 'sec to draw', noRounds: true },
  hangman:      { rounds: 8,  timeLimit: 60, timeLabel: 'sec/word' },
  spyfall:      { rounds: 3,  timeLimit: 480, timeLabel: 'sec/round', noRounds: false },
  wavelength:   { rounds: 8,  timeLimit: 30, timeLabel: 'sec/turn' },
  justone:      { rounds: 8,  timeLimit: 30, timeLabel: 'sec/phase' },
  wouldyourather: { rounds: 10, timeLimit: 20, timeLabel: 'sec/question' },
  wordchain:    { rounds: 0,  timeLimit: 10, timeLabel: 'sec/turn', noRounds: true },
  imposter:     { rounds: 3,  timeLimit: 30, timeLabel: 'sec/describe', votingRounds: 2 },
  knowme:       { rounds: 10, timeLimit: 30, timeLabel: 'sec/question' },
  partyprompts: { rounds: 15, timeLimit: 10, timeLabel: 'sec/prompt' },
  mostlikelyto: { rounds: 10, timeLimit: 20, timeLabel: 'sec/question' },
  neverhaveiever: { rounds: 10, timeLimit: 15, timeLabel: 'sec/statement' },
  truthordrink: { rounds: 10, timeLimit: 30, timeLabel: 'sec/question' },
  typingrace:   { rounds: 3,  timeLimit: 30, timeLabel: 'sec/round' }
};
let pendingGameType = null;
let pendingCategory = 'all';

function handleGameCardClick(e) {
  // Ignore clicks on the help button
  if (e.target.closest('.game-help-btn')) return;

  const card = e.target.closest('.game-card');
  if (!card || !isHost || card.classList.contains('disabled')) return;

  const gameType = card.dataset.game;
  if (typeof SFX !== 'undefined') SFX.click();

  if (gamesWithCategories.includes(gameType)) {
    pendingGameType = gameType;
    pendingCategory = 'all';
    socket.emit('get-categories', { gameType });
  } else if (gamesWithSettings.includes(gameType)) {
    pendingGameType = gameType;
    pendingCategory = 'all';
    showSettingsModal(gameType);
  } else {
    socket.emit('select-game', { gameType, category: 'all' });
  }
}

gameGrid.addEventListener('click', handleGameCardClick);
const gameGridCreative = document.getElementById('game-grid-creative');
if (gameGridCreative) gameGridCreative.addEventListener('click', handleGameCardClick);
const gameGridBluff = document.getElementById('game-grid-bluff');
if (gameGridBluff) gameGridBluff.addEventListener('click', handleGameCardClick);
const gameGridCards = document.getElementById('game-grid-cards');
if (gameGridCards) gameGridCards.addEventListener('click', handleGameCardClick);
const gameGridBoard = document.getElementById('game-grid-board');
if (gameGridBoard) gameGridBoard.addEventListener('click', handleGameCardClick);
const gameGridDrinking = document.getElementById('game-grid-drinking');
if (gameGridDrinking) gameGridDrinking.addEventListener('click', handleGameCardClick);

// ─── GAME RULES / HELP SYSTEM ───
(() => {
  // Inject help buttons on every game card
  document.querySelectorAll('.game-card[data-game]').forEach(card => {
    const btn = document.createElement('button');
    btn.className = 'game-help-btn';
    btn.title = 'How to play';
    btn.textContent = '?';
    btn.dataset.game = card.dataset.game;
    card.style.position = 'relative';
    card.appendChild(btn);
  });

  let rulesCache = null;
  const rulesModal = document.getElementById('rules-modal');
  const rulesContent = document.getElementById('rules-content');
  const rulesClose = document.getElementById('rules-modal-close');
  if (rulesClose) rulesClose.addEventListener('click', () => { rulesModal.style.display = 'none'; });
  if (rulesModal) rulesModal.addEventListener('click', (e) => { if (e.target === rulesModal) rulesModal.style.display = 'none'; });

  async function showRules(gameType) {
    if (!rulesModal) return;
    rulesContent.innerHTML = '<p style="text-align:center;color:var(--text-dim)">Loading...</p>';
    rulesModal.style.display = 'flex';
    try {
      if (!rulesCache) {
        const resp = await fetch('/api/rules');
        rulesCache = await resp.json();
      }
      const r = rulesCache[gameType];
      if (!r) { rulesContent.innerHTML = '<p>Rules not available.</p>'; return; }
      rulesContent.innerHTML = `
        <div style="text-align:center;margin-bottom:12px">
          <span style="font-size:2rem">${r.icon}</span>
          <h2 style="margin-top:4px">${r.name}</h2>
          <span class="rules-players">${r.players} players</span>
        </div>
        <p style="color:var(--text-mid);margin-bottom:16px;text-align:center">${r.summary}</p>
        <h3 style="font-size:0.9rem;margin-bottom:8px">📋 Rules</h3>
        <ol class="rules-list">${r.rules.map(rule => `<li>${rule}</li>`).join('')}</ol>
        ${r.tips ? `<div class="rules-tip">💡 <strong>Tip:</strong> ${r.tips}</div>` : ''}
      `;
    } catch {
      rulesContent.innerHTML = '<p>Could not load rules.</p>';
    }
  }

  // Listen for help button clicks (delegated)
  document.addEventListener('click', (e) => {
    const helpBtn = e.target.closest('.game-help-btn');
    if (helpBtn) {
      e.stopPropagation();
      showRules(helpBtn.dataset.game);
    }
  });

  // Also expose for in-game help
  window.showGameRules = showRules;
})();

// ─── CATEGORY PICKER ───
socket.on('categories-list', ({ gameType, categories }) => {
  if (!isHost || gameType !== pendingGameType) return;
  showCategoryPicker(gameType, categories);
});

function showCategoryPicker(gameType, categories) {
  const gameLabels = { trivia: 'Trivia', wordscramble: 'Word Scramble', emoji: 'Emoji Decoder', imposter: 'Imposter' };
  const categoryIcons = {
    general: '📋', science: '🔬', movies: '🎬', sports: '⚽', geography: '🌍',
    technology: '💻', history: '📜', animals: '🐾', nature: '🌿', food: '🍔',
    objects: '🔧', fantasy: '🐉', popculture: '🌟', all: '🎯',
    places: '📍', professions: '👔', things: '🔮', music: '🎵'
  };

  const overlay = document.createElement('div');
  overlay.className = 'category-overlay';
  overlay.innerHTML = `
    <div class="category-modal">
      <h3 class="category-title">Pick a Category</h3>
      <p class="category-subtitle">${gameLabels[gameType] || gameType}</p>
      <div class="category-grid">
        <button class="category-btn category-all" data-cat="all">
          <span class="category-icon">${categoryIcons.all}</span>
          <span class="category-label">All Categories</span>
        </button>
        ${categories.map(cat => `
          <button class="category-btn" data-cat="${cat}">
            <span class="category-icon">${categoryIcons[cat] || '📁'}</span>
            <span class="category-label">${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
          </button>
        `).join('')}
      </div>
      <button class="category-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  overlay.querySelector('.category-cancel').addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
    pendingGameType = null;
  });

  overlay.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.cat;
      if (typeof SFX !== 'undefined') SFX.click();
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
      pendingCategory = category;
      // Show settings modal after picking category
      showSettingsModal(pendingGameType);
    });
  });
}

// ─── SETTINGS MODAL ───
function showSettingsModal(gameType) {
  const gameLabels = { trivia: 'Trivia', wordscramble: 'Word Scramble', speedmath: 'Speed Math', emoji: 'Emoji Decoder', drawguess: 'Draw & Guess', imposter: 'Imposter' };
  const def = defaultSettings[gameType] || { rounds: 10, timeLimit: 15, timeLabel: 'seconds' };

  const overlay = document.createElement('div');
  overlay.className = 'category-overlay';
  overlay.innerHTML = `
    <div class="category-modal settings-modal">
      <h3 class="category-title">⚙️ Game Settings</h3>
      <p class="category-subtitle">${gameLabels[gameType] || gameType}</p>
      <div class="settings-form">
        ${!def.noRounds ? `
          <div class="settings-row">
            <label class="settings-label">Rounds</label>
            <div class="settings-control">
              <button class="settings-dec" data-target="s-rounds">−</button>
              <input type="number" id="s-rounds" class="settings-input" value="${def.rounds}" min="3" max="30">
              <button class="settings-inc" data-target="s-rounds">+</button>
            </div>
          </div>
        ` : ''}
        <div class="settings-row">
          <label class="settings-label">Time <span class="settings-hint">(${def.timeLabel})</span></label>
          <div class="settings-control">
            <button class="settings-dec" data-target="s-time">−</button>
            <input type="number" id="s-time" class="settings-input" value="${def.timeLimit}" min="5" max="120">
            <button class="settings-inc" data-target="s-time">+</button>
          </div>
        </div>
        ${def.votingRounds !== undefined ? `
          <div class="settings-row">
            <label class="settings-label">Votes/Word <span class="settings-hint">(attempts per word)</span></label>
            <div class="settings-control">
              <button class="settings-dec" data-target="s-voting-rounds">−</button>
              <input type="number" id="s-voting-rounds" class="settings-input" value="${def.votingRounds}" min="1" max="5">
              <button class="settings-inc" data-target="s-voting-rounds">+</button>
            </div>
          </div>
        ` : ''}
      </div>
      <div class="settings-actions">
        <button class="btn btn-primary" id="s-start">Start Game</button>
        <button class="category-cancel" id="s-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // +/- buttons
  overlay.querySelectorAll('.settings-dec, .settings-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const step = btn.classList.contains('settings-inc') ? (btn.dataset.target === 's-time' ? 5 : 1) : (btn.dataset.target === 's-time' ? -5 : -1);
      input.value = Math.max(parseInt(input.min), Math.min(parseInt(input.max), parseInt(input.value || 0) + step));
    });
  });

  overlay.querySelector('#s-cancel').addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
    pendingGameType = null;
  });

  overlay.querySelector('#s-start').addEventListener('click', () => {
    const roundsEl = document.getElementById('s-rounds');
    const rounds = roundsEl ? parseInt(roundsEl.value) : undefined;
    const timeLimit = parseInt(document.getElementById('s-time').value);
    const votingRoundsEl = document.getElementById('s-voting-rounds');
    const votingRounds = votingRoundsEl ? parseInt(votingRoundsEl.value) : undefined;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
    const settings = { timeLimit };
    if (rounds) settings.rounds = rounds;
    if (votingRounds) settings.votingRounds = votingRounds;
    socket.emit('select-game', { gameType: pendingGameType, category: pendingCategory, settings });
    pendingGameType = null;
    pendingCategory = 'all';
  });
}

// ─── SOCKET EVENTS ───

// Room events handled — update comes from server
socket.on('room-created', ({ roomCode: newCode }) => {
  // Host reconnected, update room code if changed
  roomCode = newCode;
  roomCodeText.textContent = newCode;
  sessionStorage.setItem('roomCode', newCode);
});

socket.on('player-joined', ({ players }) => {
  if (typeof SFX !== 'undefined') SFX.playerJoin();
  renderPlayers(players);

  // Update status strip player count if visible
  const gssCount = document.getElementById('gss-player-count');
  if (gssCount) gssCount.textContent = players.length + ' playing';

  // Show session scores if any player has points
  if (players.some(p => p.score > 0)) {
    renderSessionScores(players);
    sessionScoresCard.classList.remove('hidden');
  }
});

// ─── Global helper for game scripts to update the status strip ───
window.updateGameStatus = function(text) {
  const el = document.getElementById('gss-info');
  if (el) el.textContent = text;
};

socket.on('join-error', ({ message }) => {
  showToast(message, 'error');
  // Show inline recovery instead of auto-redirecting
  const lobby = document.getElementById('lobby-view');
  if (lobby) {
    lobby.innerHTML =
      '<div style="text-align:center;padding:48px 24px">' +
        '<p style="color:var(--text-dim);margin-bottom:20px">' + message + '</p>' +
        '<a href="/" class="btn btn-primary">Go Home</a>' +
      '</div>';
  }
});

// ─── SPECTATOR JOIN ───
socket.on('join-as-spectator', ({ roomCode: code, gameType }) => {
  isSpectator = true;
  roomCode = code;
  sessionStorage.setItem('roomCode', code);

  const gameConfig = {
    trivia:       { icon: '🧠', label: 'Trivia',         script: '/js/games/trivia.js' },
    wordscramble: { icon: '🔤', label: 'Word Scramble',  script: '/js/games/wordscramble.js' },
    speedmath:    { icon: '⚡', label: 'Speed Math',     script: '/js/games/speedmath.js' },
    emoji:        { icon: '😎', label: 'Emoji Decoder',  script: '/js/games/emoji.js' },
    drawguess:    { icon: '🎨', label: 'Draw & Guess',   script: '/js/games/drawguess.js' },
    codenames:    { icon: '🕵️', label: 'Codenames',      script: '/js/games/codenames.js' },
    colorclash:   { icon: '🎴', label: 'Color Clash',   script: '/js/games/colorclash.js' },
    blackjack:    { icon: '🂡', label: 'Blackjack',      script: '/js/games/blackjack.js' },
    hangman:      { icon: '💀', label: 'Hangman',        script: '/js/games/hangman.js' },
    memorymatch:  { icon: '🧠', label: 'Memory Match',   script: '/js/games/memorymatch.js' },
    spyfall:      { icon: '🕵️‍♂️', label: 'Spyfall',       script: '/js/games/spyfall.js' },
    wavelength:   { icon: '📡', label: 'Wavelength',     script: '/js/games/wavelength.js' },
    justone:      { icon: '☝️', label: 'Just One',       script: '/js/games/justone.js' },
    wouldyourather: { icon: '🤔', label: 'Would You Rather', script: '/js/games/wouldyourather.js' },
    wordchain:    { icon: '🔗', label: 'Word Chain',     script: '/js/games/wordchain.js' },
    imposter:     { icon: '🤫', label: 'Imposter',       script: '/js/games/imposter.js' },
    ludo:         { icon: '🎲', label: 'Ludo',           script: '/js/games/ludo.js' },
    poker:        { icon: '🂪', label: 'Poker',          script: '/js/games/poker.js' },
    chess:        { icon: '♟️', label: 'Chess',          script: '/js/games/chess.js' },
    battleship:   { icon: '🚢', label: 'Battleship',     script: '/js/games/battleship.js' },
    rummy:        { icon: '🃏', label: 'Rummy',          script: '/js/games/rummy.js' },
    coup:         { icon: '👑', label: 'Coup',           script: '/js/games/coup.js' },
    wordle:       { icon: '📝', label: 'Wordle',         script: '/js/games/wordle.js' },
    dixit:        { icon: '📖', label: 'Dixit',          script: '/js/games/dixit.js' },
    knowme:       { icon: '💕', label: 'Know Me',         script: '/js/games/knowme.js' },
    connectfour:  { icon: '🔴', label: 'Connect Four',    script: '/js/games/connectfour.js' },
    tictactoe:    { icon: '❌', label: 'Tic Tac Toe',     script: '/js/games/tictactoe.js' },
    partyprompts: { icon: '🎉', label: 'Piloco',    script: '/js/games/partyprompts.js' },
    kingscup:     { icon: '👑', label: "King's Cup",      script: '/js/games/kingscup.js' },
    mostlikelyto: { icon: '🎯', label: 'Most Likely To',   script: '/js/games/mostlikelyto.js' },
    neverhaveiever: { icon: '🙈', label: 'Never Have I Ever', script: '/js/games/neverhaveiever.js' },
    truthordrink: { icon: '🍺', label: 'Truth or Drink',   script: '/js/games/truthordrink.js' },
    typingrace:   { icon: '🐵', label: 'Monkey Press',       script: '/js/games/typingrace.js' }
  };

  const config = gameConfig[gameType];
  if (!config) return;

  lobbyView.classList.add('hidden');
  gameView.classList.remove('hidden');
  window.scrollTo(0, 0);
  gameView.innerHTML = `
    <div class="text-center fade-in">
      <div style="font-size: 2.4rem; margin-bottom: 16px;">${config.icon}</div>
      <h2 style="font-size: 1.5rem; margin-bottom: 8px; font-weight: 700;">${config.label}</h2>
      <p style="color: var(--text-dim); font-size: 0.9rem;">Joining as spectator...</p>
      <div class="spinner" style="margin-top: 20px;"></div>
    </div>
  `;
  addSpectatorBadge();
  loadScript(config.script);
  showToast('Watching as spectator — you can play next round!', 'info');
});

socket.on('you-are-host', () => {
  sessionStorage.setItem('isHost', 'true');
  showToast('You are now the host!', 'success');
  waitingCard.classList.add('hidden');
  gameSelectCard.classList.remove('hidden');
  // Reload to get host controls
  location.reload();
});

socket.on('kicked', () => {
  if (typeof SFX !== 'undefined') SFX.kicked();
  showToast('You were removed from the room', 'error');
  sessionStorage.clear();
  setTimeout(() => { window.location.href = '/'; }, 2000);
});

// ─── GAME ERROR (not enough players, etc.) ───
socket.on('game-error', ({ message }) => {
  showToast(message, 'error');
});

// ─── SPECTATOR OVERFLOW (too many players for game) ───
socket.on('game-spectator-overflow', ({ message }) => {
  showToast(message, 'info');
});

socket.on('toast-message', ({ message, type }) => {
  showToast(message, type || 'info');
});

// ─── GAME START ───
socket.on('game-starting', ({ gameType }) => {
  // Remove game-over popup if present
  const popup = document.getElementById('game-over-popup');
  if (popup) popup.remove();

  const gameConfig = {
    trivia:       { icon: '🧠', label: 'Trivia',         script: '/js/games/trivia.js' },
    wordscramble: { icon: '🔤', label: 'Word Scramble',  script: '/js/games/wordscramble.js' },
    speedmath:    { icon: '⚡', label: 'Speed Math',     script: '/js/games/speedmath.js' },
    emoji:        { icon: '😎', label: 'Emoji Decoder',  script: '/js/games/emoji.js' },
    drawguess:    { icon: '🎨', label: 'Draw & Guess',   script: '/js/games/drawguess.js' },
    codenames:    { icon: '🕵️', label: 'Codenames',      script: '/js/games/codenames.js' },
    colorclash:   { icon: '🎴', label: 'Color Clash',   script: '/js/games/colorclash.js' },
    blackjack:    { icon: '🂡', label: 'Blackjack',      script: '/js/games/blackjack.js' },
    hangman:      { icon: '💀', label: 'Hangman',        script: '/js/games/hangman.js' },
    memorymatch:  { icon: '🧠', label: 'Memory Match',   script: '/js/games/memorymatch.js' },
    spyfall:      { icon: '🕵️‍♂️', label: 'Spyfall',       script: '/js/games/spyfall.js' },
    wavelength:   { icon: '📡', label: 'Wavelength',     script: '/js/games/wavelength.js' },
    justone:      { icon: '☝️', label: 'Just One',       script: '/js/games/justone.js' },
    wouldyourather: { icon: '🤔', label: 'Would You Rather', script: '/js/games/wouldyourather.js' },
    wordchain:    { icon: '🔗', label: 'Word Chain',     script: '/js/games/wordchain.js' },
    imposter:     { icon: '🤫', label: 'Imposter',       script: '/js/games/imposter.js' },
    ludo:         { icon: '🎲', label: 'Ludo',           script: '/js/games/ludo.js' },
    poker:        { icon: '🂪', label: 'Poker',          script: '/js/games/poker.js' },
    chess:        { icon: '♟️', label: 'Chess',          script: '/js/games/chess.js' },
    battleship:   { icon: '🚢', label: 'Battleship',     script: '/js/games/battleship.js' },
    rummy:        { icon: '🃏', label: 'Rummy',          script: '/js/games/rummy.js' },
    coup:         { icon: '👑', label: 'Coup',           script: '/js/games/coup.js' },
    wordle:       { icon: '📝', label: 'Wordle',         script: '/js/games/wordle.js' },
    dixit:        { icon: '📖', label: 'Dixit',          script: '/js/games/dixit.js' },
    knowme:       { icon: '💕', label: 'Know Me',         script: '/js/games/knowme.js' },
    connectfour:  { icon: '🔴', label: 'Connect Four',    script: '/js/games/connectfour.js' },
    tictactoe:    { icon: '❌', label: 'Tic Tac Toe',     script: '/js/games/tictactoe.js' },
    partyprompts: { icon: '🎉', label: 'Piloco',    script: '/js/games/partyprompts.js' },
    kingscup:     { icon: '👑', label: "King's Cup",      script: '/js/games/kingscup.js' },
    mostlikelyto: { icon: '🎯', label: 'Most Likely To',   script: '/js/games/mostlikelyto.js' },
    neverhaveiever: { icon: '🙈', label: 'Never Have I Ever', script: '/js/games/neverhaveiever.js' },
    truthordrink: { icon: '🍺', label: 'Truth or Drink',   script: '/js/games/truthordrink.js' },
    typingrace:   { icon: '🐵', label: 'Monkey Press',       script: '/js/games/typingrace.js' }
  };

  const config = gameConfig[gameType];
  if (!config) return;

  currentGameLabel = config.label;
  document.title = `${config.label} — Clutch`;

  const statusEl = document.getElementById('room-status-text');
  if (statusEl) statusEl.textContent = '● Playing';

  if (typeof SFX !== 'undefined') SFX.gameStart();

  // Animated transition: lobby -> game
  waitingCard.classList.add('hidden');
  lobbyView.classList.add('view-exit');
  setTimeout(() => {
    lobbyView.classList.add('hidden');
    lobbyView.classList.remove('view-exit');
    gameView.classList.remove('hidden');
    gameView.classList.add('view-enter');
    window.scrollTo(0, 0);
    gameView.innerHTML = `
      <div class="text-center fade-in">
        <div style="font-size: 2.4rem; margin-bottom: 16px;">${config.icon}</div>
        <h2 style="font-size: 1.5rem; margin-bottom: 8px; font-weight: 700;">${config.label}</h2>
        <p style="color: var(--text-dim); font-size: 0.9rem;">Get ready...</p>
        <div class="spinner" style="margin-top: 20px;"></div>
      </div>
    `;
    requestAnimationFrame(() => gameView.classList.remove('view-enter'));

    // Add exit game button
    addExitGameButton();

    loadScript(config.script);
  }, 300);
});

// ─── BACK TO LOBBY ───
socket.on('back-to-lobby', ({ players }) => {
  // Remove game-over popup if present
  const popup = document.getElementById('game-over-popup');
  if (popup) popup.remove();

  lobbyGamesPlayed++;
  const gamesEl = document.getElementById('room-games-played');
  if (gamesEl) gamesEl.textContent = lobbyGamesPlayed;
  const statusEl = document.getElementById('room-status-text');
  if (statusEl) statusEl.textContent = '● In Lobby';

  removeExitGameButton();
  removeSpectatorBadge();
  isSpectator = false;
  document.title = 'Clutch \u2014 Lobby';
  // Animated transition: game -> lobby
  gameView.classList.add('view-exit');
  setTimeout(() => {
    gameView.classList.add('hidden');
    gameView.classList.remove('view-exit');
    gameView.innerHTML = '';
    lobbyView.classList.remove('hidden');
    lobbyView.classList.add('view-enter');
    window.scrollTo(0, 0);
    requestAnimationFrame(() => lobbyView.classList.remove('view-enter'));
    renderPlayers(players);

    if (players.some(p => p.score > 0)) {
      renderSessionScores(players);
      sessionScoresCard.classList.remove('hidden');
    }
  }, 300);
});

// ─── RENDER SESSION SCORES ───
function renderSessionScores(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  sessionLeaderboard.innerHTML = '';

  sorted.forEach((player, i) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-item';
    li.style.animationDelay = `${i * 0.08}s`;

    const rankClass = i < 3 ? `rank-${i + 1}` : '';
    const medals = ['🥇', '🥈', '🥉'];

    li.innerHTML = `
      <span class="rank ${rankClass}">${i < 3 ? medals[i] : i + 1}</span>
      <span class="lb-name">${escapeHtml(player.name)}</span>
      <span class="lb-score">${player.score.toLocaleString()}</span>
    `;
    sessionLeaderboard.appendChild(li);
  });
}

// ─── IN-GAME STATUS STRIP ───
let currentGameLabel = '';

function addExitGameButton() {
  removeExitGameButton();

  // Determine game label
  const label = currentGameLabel || 'Game';

  // Create status strip
  const strip = document.createElement('div');
  strip.className = 'game-status-strip';
  strip.id = 'game-status-strip';
  strip.innerHTML = `
    <div class="game-status-strip__left">
      <span class="gss-game-label">${label}</span>
      <span class="gss-divider"></span>
      <span class="gss-room">${roomCode}</span>
      <span class="gss-divider"></span>
      <span class="gss-info" id="gss-info"></span>
    </div>
    <div class="game-status-strip__right">
      <span class="gss-players"><span class="gss-dot"></span> <span id="gss-player-count">—</span></span>
      ${isHost ? '<button class="gss-btn" id="gss-skip-btn">Skip ⏭</button>' : ''}
      <button class="gss-btn ${isHost ? 'gss-btn--danger' : ''}" id="gss-exit-btn">${isHost ? 'End Game' : 'Leave'}</button>
    </div>
  `;
  document.body.appendChild(strip);

  // Add padding to game view
  gameView.classList.add('game-view-with-strip');

  // Event handlers
  document.getElementById('gss-exit-btn').addEventListener('click', () => {
    if (isHost) {
      socket.emit('end-game-early');
    } else {
      removeExitGameButton();
      gameView.classList.add('hidden');
      gameView.innerHTML = '';
      lobbyView.classList.remove('hidden');
    }
  });

  if (isHost) {
    document.getElementById('gss-skip-btn')?.addEventListener('click', () => {
      socket.emit('show-results');
    });
  }

  // Add reaction bar
  addReactionBar();
}

function removeExitGameButton() {
  const strip = document.getElementById('game-status-strip');
  if (strip) strip.remove();
  // Legacy cleanup
  const existing = document.getElementById('exit-game-btn');
  if (existing) existing.remove();
  const skipBtn = document.getElementById('host-skip-btn');
  if (skipBtn) skipBtn.remove();
  const reactBar = document.getElementById('reaction-bar');
  if (reactBar) reactBar.remove();
  gameView.classList.remove('game-view-with-strip');
}

// ─── EMOJI REACTIONS ───
function addReactionBar() {
  const existing = document.getElementById('reaction-bar');
  if (existing) return;
  const bar = document.createElement('div');
  bar.id = 'reaction-bar';
  bar.className = 'reaction-bar';
  bar.innerHTML = ['😂','🔥','👏','❤️','😮','💀','🎉','👀','😭','🤔'].map(e =>
    `<button class="react-btn" data-emoji="${e}">${e}</button>`
  ).join('');

  // Dock into chat window (before the input row), or fallback to body
  const chatWindow = document.getElementById('chat-window');
  const chatInputRow = chatWindow ? chatWindow.querySelector('.chat-input-row') : null;
  if (chatInputRow) {
    chatWindow.insertBefore(bar, chatInputRow);
  } else {
    document.body.appendChild(bar);
  }

  bar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.react-btn');
    if (!btn) return;
    socket.emit('reaction', { emoji: btn.dataset.emoji });
    showFloatingReaction(btn.dataset.emoji, 'You');
  });
}

socket.on('reaction', ({ name, emoji }) => {
  showFloatingReaction(emoji, name);
});

function showFloatingReaction(emoji, name) {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.innerHTML = `<span class="fr-emoji">${emoji}</span><span class="fr-name">${escapeHtml(name)}</span>`;
  el.style.left = (20 + Math.random() * 60) + '%';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ─── SPECTATOR BADGE ───
function addSpectatorBadge() {
  removeSpectatorBadge();
  const badge = document.createElement('div');
  badge.id = 'spectator-badge';
  badge.className = 'spectator-badge';
  badge.innerHTML = '👁 Spectating';
  document.body.appendChild(badge);
}

function removeSpectatorBadge() {
  const existing = document.getElementById('spectator-badge');
  if (existing) existing.remove();
}

// ─── REMATCH / PLAY AGAIN (POPUP) ───
function showGameOverPopup(results) {
  if (document.getElementById('game-over-popup')) return;

  const overlay = document.createElement('div');
  overlay.id = 'game-over-popup';
  overlay.className = 'game-over-overlay';

  // Build results summary if available
  let resultsHtml = '';
  if (results && results.players && results.players.length > 0) {
    resultsHtml = `<div class="game-over-results">
      ${results.players.slice(0, 5).map((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        return `<div class="game-over-result-row ${i === 0 ? 'game-over-winner' : ''}">
          <span class="game-over-medal">${medal}</span>
          <span class="game-over-pname">${escapeHtml(p.name)}</span>
          <span class="game-over-pscore">${p.score != null ? p.score + ' pts' : ''}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  const actionsHtml = isHost
    ? `<div class="game-over-btns">
         <button class="btn btn-primary rematch-btn" id="rematch-btn">🔄 Play Again</button>
         <button class="btn btn-secondary rematch-lobby-btn" id="rematch-lobby-btn">🏠 Back to Lobby</button>
       </div>`
    : `<p style="color: var(--text-dim); font-size: 0.9rem;">Waiting for host...</p>`;

  overlay.innerHTML = `
    <div class="game-over-popup">
      <div class="game-over-title">🏆 Game Over!</div>
      ${resultsHtml}
      ${actionsHtml}
    </div>
  `;

  document.body.appendChild(overlay);

  if (isHost) {
    document.getElementById('rematch-btn')?.addEventListener('click', () => {
      socket.emit('rematch');
      overlay.remove();
    });
    document.getElementById('rematch-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
      overlay.remove();
    });
  }
}

socket.on('game-over', (results) => {
  setTimeout(() => showGameOverPopup(results), 300);
});

['codenames-over', 'cc-over'].forEach(evt => {
  socket.on(evt, (results) => {
    setTimeout(() => showGameOverPopup(results), 300);
  });
});

// ─── UTILITIES ───
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function resetGameClientState() {
  // NOTE: Do NOT include 'game-over' here — it's a lobby-level handler that must persist
  const gameEvents = [
    'game-state', 'answer-result', 'round-result',
    'word-choices', 'draw-state', 'draw-update', 'drawing-update',
    'codenames-teams', 'codenames-over', 'cc-state', 'cc-over',
    'bj-state', 'bj-update',
    'hangman-state', 'mm-state', 'spyfall-state', 'wavelength-clue-view',
    'wavelength-guess-view', 'justone-state', 'wordchain-state',
    'imposter-state', 'ludo-state', 'ludo-update', 'poker-state', 'poker-update',
    'chess-state', 'chess-update', 'battleship-state', 'battleship-update',
    'rummy-state', 'rummy-update', 'coup-state', 'coup-update',
    'wordle-state', 'wordle-update', 'wordle-error', 'dixit-state', 'dixit-update',
    'knowme-state', 'knowme-update',
    'connectfour-state', 'connectfour-update',
    'tictactoe-state', 'tictactoe-update',
    'partyprompts-state', 'kingscup-state',
    'mostlikelyto-state', 'neverhaveiever-state', 'truthordrink-state'
  ];

  gameEvents.forEach(eventName => socket.off(eventName));

  if (window._wordleKeyHandler) {
    document.removeEventListener('keydown', window._wordleKeyHandler);
    window._wordleKeyHandler = null;
  }

  document.querySelectorAll('script[src^="/js/games/"]').forEach(script => script.remove());
}

function loadScript(src) {
  resetGameClientState();

  const script = document.createElement('script');
  script.src = src;
  document.body.appendChild(script);
}

let toastTimer;
function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ═══════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════
(() => {
  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel) return;

  const chatToggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const chatMinimize = document.getElementById('chat-minimize');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatBadge = document.getElementById('chat-badge');
  let unread = 0;
  let chatOpen = false;

  chatToggle.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatWindow.style.display = chatOpen ? 'flex' : 'none';
    if (chatOpen) {
      unread = 0;
      chatBadge.style.display = 'none';
      chatInput.focus();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
  chatMinimize.addEventListener('click', () => {
    chatOpen = false;
    chatWindow.style.display = 'none';
  });

  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('chat-message', { text });
    chatInput.value = '';
    chatInput.focus();
  }
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  function appendChatMsg(data) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const time = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<span class="chat-author">${escapeHtml(data.playerName)}</span>${escapeHtml(data.text)}<span class="chat-time">${time}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (!chatOpen) {
      unread++;
      chatBadge.textContent = unread > 99 ? '99+' : unread;
      chatBadge.style.display = 'flex';
    }
  }

  socket.on('chat-message', appendChatMsg);

  socket.on('chat-history', (messages) => {
    chatMessages.innerHTML = '';
    messages.forEach(appendChatMsg);
  });

  // Request history after joining
  socket.on('room-joined', () => {
    socket.emit('get-chat-history');
  });
  socket.on('room-created', () => {
    socket.emit('get-chat-history');
  });

  if (typeof SFX !== 'undefined') {
    socket.on('chat-message', () => { if (!chatOpen) SFX.chat(); });
  }
})();

// ═══════════════════════════════════════════
//  AUTH SOCKET INTEGRATION
// ═══════════════════════════════════════════
if (typeof Auth !== 'undefined' && Auth.getToken()) {
  Auth.authSocket(socket);
}

// ═══════════════════════════════════════════
//  TOURNAMENT
// ═══════════════════════════════════════════
(() => {
  const tournModal = document.getElementById('tournament-modal');
  if (!tournModal) return;
  const tournClose = document.getElementById('tournament-modal-close');
  const tournCreate = document.getElementById('tournament-create-btn');
  const tournGameList = document.getElementById('tournament-game-list');
  let activeTournament = null;

  // Host can open tournament modal from lobby
  const tournBtn = document.getElementById('tournament-btn');
  if (tournBtn) {
    tournBtn.addEventListener('click', () => {
      tournModal.style.display = 'flex';
    });
  }

  tournClose.addEventListener('click', () => { tournModal.style.display = 'none'; });
  tournModal.addEventListener('click', (e) => {
    if (e.target === tournModal) tournModal.style.display = 'none';
  });

  tournCreate.addEventListener('click', () => {
    const name = document.getElementById('tournament-name').value.trim() || 'Tournament';
    const checked = tournGameList.querySelectorAll('input:checked');
    const games = Array.from(checked).map(c => c.value);
    if (games.length < 2) {
      showToast('Pick at least 2 games for a tournament', 'error');
      return;
    }
    socket.emit('create-tournament', { name, games });
    tournModal.style.display = 'none';
  });

  socket.on('tournament-started', (data) => {
    activeTournament = data;
    showTournamentBar(data);
    showToast(`🏆 Tournament "${data.name}" started!`);
  });

  socket.on('tournament-next', (data) => {
    activeTournament = data;
    updateTournamentBar(data);
  });

  socket.on('tournament-standings', (data) => {
    showTournamentStandings(data);
  });

  socket.on('tournament-ended', (data) => {
    removeTournamentBar();
    activeTournament = null;
    showTournamentStandings(data);
    showToast('🏆 Tournament complete!');
  });

  function showTournamentBar(data) {
    removeTournamentBar();
    const bar = document.createElement('div');
    bar.id = 'tournament-bar';
    bar.className = 'tournament-bar';
    bar.innerHTML = `
      <span class="t-name">🏆 ${escapeHtml(data.name)}</span>
      <span class="t-progress">Game ${data.currentIndex + 1} of ${data.games.length}</span>
      <button class="t-standings-btn" id="t-standings-btn">Standings</button>
    `;
    document.body.prepend(bar);
    document.getElementById('t-standings-btn').addEventListener('click', () => {
      socket.emit('tournament-standings');
    });
  }

  function updateTournamentBar(data) {
    const bar = document.getElementById('tournament-bar');
    if (!bar) return showTournamentBar(data);
    const prog = bar.querySelector('.t-progress');
    if (prog) prog.textContent = `Game ${data.currentIndex + 1} of ${data.games.length}`;
  }

  function removeTournamentBar() {
    const bar = document.getElementById('tournament-bar');
    if (bar) bar.remove();
  }

  function showTournamentStandings(data) {
    // Re-use or create a modal for standings
    let overlay = document.getElementById('standings-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'standings-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    const standingsHtml = (data.standings || [])
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((s, i) => `<tr class="${i < 3 ? 'top-' + (i + 1) : ''}"><td>${i + 1}</td><td>${escapeHtml(s.playerName)}</td><td>${s.totalScore}</td></tr>`)
      .join('');

    overlay.innerHTML = `
      <div class="modal-card tournament-standings">
        <button class="modal-close" onclick="this.closest('.modal-overlay').style.display='none'">&times;</button>
        <h3>🏆 ${escapeHtml(data.name || 'Tournament')} Standings</h3>
        <table class="leaderboard-table">
          <thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead>
          <tbody>${standingsHtml || '<tr><td colspan="3" style="text-align:center;color:var(--text-dim)">No scores yet</td></tr>'}</tbody>
        </table>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  }
})();
