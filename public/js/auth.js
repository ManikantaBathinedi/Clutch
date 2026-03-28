// ═══════════════════════════════════════
// AUTH MODULE — Login/Register/Session
// ═══════════════════════════════════════

const Auth = (function () {
  const TOKEN_KEY = 'clutch-auth-token';
  const USER_KEY = 'clutch-user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function isLoggedIn() { return !!getToken(); }

  async function api(url, method, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function register(username, password, displayName, avatar) {
    const data = await api('/api/auth/register', 'POST', { username, password, displayName, avatar });
    setSession(data.token, { userId: data.userId, displayName: data.displayName, avatar: data.avatar, username });
    return data;
  }

  async function login(username, password) {
    const data = await api('/api/auth/login', 'POST', { username, password });
    setSession(data.token, { userId: data.userId, displayName: data.displayName, avatar: data.avatar, username: data.username });
    return data;
  }

  async function logout() {
    try { await api('/api/auth/logout', 'POST'); } catch {}
    clearSession();
  }

  async function validate() {
    if (!getToken()) return null;
    try {
      const data = await api('/api/auth/me', 'GET');
      const user = { userId: data.user_id, displayName: data.display_name, avatar: data.avatar, username: data.username };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      clearSession();
      return null;
    }
  }

  async function updateProfile(displayName, avatar) {
    const data = await api('/api/auth/profile', 'PUT', { displayName, avatar });
    const user = getUser();
    if (displayName) user.displayName = displayName;
    if (avatar) user.avatar = avatar;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return data;
  }

  async function getHistory() { return api('/api/history', 'GET'); }
  async function getLeaderboard(game) { return api('/api/leaderboard?game=' + (game || 'all'), 'GET'); }
  async function getProfilePage(username) { return api('/api/profile/' + encodeURIComponent(username), 'GET'); }

  // Auth socket integration
  function authSocket(socket) {
    const token = getToken();
    if (token) socket.emit('auth-socket', { token });
  }

  return {
    getToken, getUser, isLoggedIn,
    register, login, logout, validate, updateProfile,
    getHistory, getLeaderboard, getProfilePage,
    authSocket, clearSession
  };
})();
