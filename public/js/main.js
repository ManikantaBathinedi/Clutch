const socket = io({ transports: ['websocket', 'polling'] });

// Elements
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const hostNameInput = document.getElementById('host-name');
const joinNameInput = document.getElementById('join-name');
const roomCodeInput = document.getElementById('room-code');
const toast = document.getElementById('toast');

// ─── CONNECTION STATE ───
const connBanner = document.getElementById('connection-banner');
const connText = document.getElementById('connection-text');
let wasConnected = false;

socket.on('connect', () => {
  if (wasConnected) {
    connBanner.classList.remove('visible', 'reconnecting');
    showToast('Reconnected', 'success');
  }
  wasConnected = true;
});

socket.on('disconnect', () => {
  connText.textContent = 'Connection lost — reconnecting\u2026';
  connBanner.classList.add('visible', 'reconnecting');
});

socket.on('reconnect_failed', () => {
  connText.textContent = 'Unable to connect to server';
  connBanner.classList.add('visible');
  connBanner.classList.remove('reconnecting');
});

// Avatar picker
const AVATAR_EMOJIS = ['😎','🤠','🥳','🧙','🦊','🐱','🐶','🐼','🦄','🐸','🤖','👻','🎃','🦋','🐙','🌟','🔥','💎','🎵','🍕'];
let hostAvatar = '😎';
let joinAvatar = '😎';

function initAvatarPicker(containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = AVATAR_EMOJIS.map((e, i) =>
    `<button class="avatar-option ${i === 0 ? 'selected' : ''}" data-emoji="${e}">${e}</button>`
  ).join('');
  container.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.avatar-option');
    if (!btn) return;
    container.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    onSelect(btn.dataset.emoji);
  });
}

initAvatarPicker('host-avatar-picker', (e) => { hostAvatar = e; });
initAvatarPicker('join-avatar-picker', (e) => { joinAvatar = e; });

// Auto-uppercase room code & limit to 6 chars
roomCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
});

// Auto-fill room code from invite link (?code=XYZ)
(function() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('code');
  if (inviteCode) {
    roomCodeInput.value = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
    joinNameInput.focus();
    // Clean URL without reload
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

// Enter key support
hostNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createBtn.click(); });
joinNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') roomCodeInput.focus(); });
roomCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

// ─── CREATE ROOM ───
let createTimeout;
createBtn.addEventListener('click', () => {
  const name = hostNameInput.value.trim();
  if (!name) {
    showToast('Enter your name first!', 'error');
    hostNameInput.focus();
    return;
  }
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  socket.emit('create-room', { hostName: name, avatar: hostAvatar });

  // Timeout recovery — re-enable after 6s if no response
  clearTimeout(createTimeout);
  createTimeout = setTimeout(() => {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Room';
    showToast('Server didn\u2019t respond \u2014 try again', 'error');
  }, 6000);
});

// ─── JOIN ROOM ───
let joinTimeout;
joinBtn.addEventListener('click', () => {
  const name = joinNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  if (!name) {
    showToast('Enter your name first!', 'error');
    joinNameInput.focus();
    return;
  }
  if (code.length !== 6) {
    showToast('Enter the 6-character room code', 'error');
    roomCodeInput.focus();
    return;
  }
  joinBtn.disabled = true;
  joinBtn.textContent = 'Joining...';
  socket.emit('join-room', { roomCode: code, playerName: name, avatar: joinAvatar });

  clearTimeout(joinTimeout);
  joinTimeout = setTimeout(() => {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Room';
    showToast('Server didn\u2019t respond \u2014 try again', 'error');
  }, 6000);
});

// ─── SOCKET EVENTS ───
socket.on('room-created', ({ roomCode }) => {
  clearTimeout(createTimeout);
  // Store info and redirect to lobby
  sessionStorage.setItem('roomCode', roomCode);
  sessionStorage.setItem('playerName', hostNameInput.value.trim());
  sessionStorage.setItem('playerAvatar', hostAvatar);
  sessionStorage.setItem('isHost', 'true');
  window.location.href = '/lobby.html';
});

socket.on('join-success', ({ roomCode }) => {
  clearTimeout(joinTimeout);
  sessionStorage.setItem('roomCode', roomCode);
  sessionStorage.setItem('playerName', joinNameInput.value.trim());
  sessionStorage.setItem('playerAvatar', joinAvatar);
  sessionStorage.setItem('isHost', 'false');
  window.location.href = '/lobby.html';
});

socket.on('join-error', ({ message }) => {
  clearTimeout(joinTimeout);
  showToast(message, 'error');
  joinBtn.disabled = false;
  joinBtn.textContent = 'Join Room';
});

// ─── TOAST ───
let toastTimer;
function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// ═══════════════════════════════════════
// AUTH UI
// ═══════════════════════════════════════

const authModal = document.getElementById('auth-modal');
const profileModal = document.getElementById('profile-modal');
const leaderboardModal = document.getElementById('leaderboard-modal');

function updateAuthUI() {
  const user = Auth.getUser();
  if (user) {
    document.getElementById('auth-guest').style.display = 'none';
    document.getElementById('auth-user').style.display = 'flex';
    document.getElementById('auth-avatar').textContent = user.avatar || '😎';
    document.getElementById('auth-display-name').textContent = user.displayName;
    hostNameInput.value = user.displayName;
    joinNameInput.value = user.displayName;
    hostAvatar = user.avatar || '😎';
    joinAvatar = user.avatar || '😎';
  } else {
    document.getElementById('auth-guest').style.display = 'flex';
    document.getElementById('auth-user').style.display = 'none';
  }
}

function openModal(modal) { modal.style.display = 'flex'; }
function closeModal(modal) { modal.style.display = 'none'; }

document.getElementById('login-btn-top').addEventListener('click', () => {
  document.getElementById('auth-login-form').style.display = 'block';
  document.getElementById('auth-register-form').style.display = 'none';
  openModal(authModal);
});
document.getElementById('register-btn-top').addEventListener('click', () => {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-register-form').style.display = 'block';
  openModal(authModal);
});
document.getElementById('auth-modal-close').addEventListener('click', () => closeModal(authModal));
document.getElementById('switch-to-register').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-register-form').style.display = 'block';
});
document.getElementById('switch-to-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('auth-login-form').style.display = 'block';
  document.getElementById('auth-register-form').style.display = 'none';
});

document.getElementById('login-submit').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    await Auth.login(username, password);
    closeModal(authModal);
    updateAuthUI();
    Auth.authSocket(socket);
    showToast('Logged in!', 'success');
  } catch (e) { errEl.textContent = e.message; }
});

let regAvatar = '😎';
initAvatarPicker('reg-avatar-picker', (e) => { regAvatar = e; });

document.getElementById('register-submit').addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const displayName = document.getElementById('reg-display-name').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  try {
    await Auth.register(username, password, displayName || username, regAvatar);
    closeModal(authModal);
    updateAuthUI();
    Auth.authSocket(socket);
    showToast('Account created!', 'success');
  } catch (e) { errEl.textContent = e.message; }
});

document.getElementById('logout-btn-top').addEventListener('click', async () => {
  await Auth.logout();
  updateAuthUI();
  showToast('Logged out', '');
});

document.getElementById('profile-btn-top').addEventListener('click', async () => {
  const user = Auth.getUser();
  if (!user) return;
  try {
    const profile = await Auth.getProfilePage(user.username);
    const el = document.getElementById('profile-content');
    const winRate = profile.games_played > 0 ? Math.round(profile.games_won / profile.games_played * 100) : 0;
    el.innerHTML = `
      <div class="profile-header">
        <span class="profile-avatar">${profile.avatar}</span>
        <div><h2>${profile.display_name}</h2><span class="profile-username">@${profile.username}</span></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${profile.games_played}</div><div class="stat-label">Games Played</div></div>
        <div class="stat-card"><div class="stat-number">${profile.games_won}</div><div class="stat-label">Games Won</div></div>
        <div class="stat-card"><div class="stat-number">${winRate}%</div><div class="stat-label">Win Rate</div></div>
        <div class="stat-card"><div class="stat-number">${profile.total_score}</div><div class="stat-label">Total Score</div></div>
      </div>
      <h3>Recent Games</h3>
      ${profile.history.length === 0 ? '<p class="muted">No games yet.</p>' :
        `<table class="history-table"><tr><th>Game</th><th>Score</th><th>Place</th><th>When</th></tr>
        ${profile.history.map(h => `<tr><td>${h.game_type}</td><td>${h.score}</td><td>${h.is_winner ? '🥇' : '#'+h.placement}</td><td>${new Date(h.played_at).toLocaleDateString()}</td></tr>`).join('')}</table>`}`;
    openModal(profileModal);
  } catch (e) { showToast('Error loading profile', 'error'); }
});
document.getElementById('profile-modal-close').addEventListener('click', () => closeModal(profileModal));

document.getElementById('leaderboard-btn-top').addEventListener('click', () => { loadLeaderboard('all'); openModal(leaderboardModal); });
document.getElementById('leaderboard-modal-close').addEventListener('click', () => closeModal(leaderboardModal));
document.getElementById('leaderboard-game-filter').addEventListener('change', (e) => loadLeaderboard(e.target.value));

async function loadLeaderboard(game) {
  try {
    const data = await Auth.getLeaderboard(game);
    const el = document.getElementById('leaderboard-content');
    if (data.length === 0) { el.innerHTML = '<p class="muted">No data yet. Play some games!</p>'; return; }
    el.innerHTML = `<table class="leaderboard-table"><tr><th>#</th><th>Player</th><th>Games</th><th>Wins</th><th>Score</th></tr>
      ${data.map((p, i) => `<tr${i < 3 ? ' class="top-'+(i+1)+'"' : ''}><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
      <td>${p.avatar} ${p.display_name}</td><td>${p.games}</td><td>${p.wins}</td><td>${p.total_score}</td></tr>`).join('')}</table>`;
  } catch { document.getElementById('leaderboard-content').innerHTML = '<p class="muted">Error loading.</p>'; }
}

[authModal, profileModal, leaderboardModal].forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
});

document.getElementById('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('login-submit').click(); });
document.getElementById('reg-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('register-submit').click(); });

(async function initAuth() {
  if (Auth.isLoggedIn()) {
    const user = await Auth.validate();
    if (user) Auth.authSocket(socket);
  }
  updateAuthUI();
})();
