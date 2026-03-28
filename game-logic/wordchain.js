// ─── WORD CHAIN SERVER LOGIC ───
// Players chain words: each must start with the last letter of the previous word.
// Miss your turn or repeat a word, you're eliminated.

const STARTING_WORDS = [
  'Apple', 'Elephant', 'Tiger', 'Rainbow', 'Mountain',
  'Ocean', 'Guitar', 'Robot', 'Castle', 'Dragon',
  'Planet', 'Thunder', 'Jungle', 'Eagle', 'Sunset'
];

// Simple word validation — basic English dictionary-like check.
// In production you'd use a proper dictionary API.
const VALID_WORD_PATTERN = /^[a-zA-Z]{3,}$/;

const TURN_TIME = 10; // seconds per turn
const POINTS_SURVIVE = 100;
const POINTS_PER_LETTER = 10;

function init(room, settings) {
  const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
  const startWord = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];

  room.gameState = {
    currentWord: startWord,
    usedWords: new Set([startWord.toLowerCase()]),
    turnOrder: [...playerIds].sort(() => Math.random() - 0.5),
    currentTurnIndex: 0,
    eliminated: new Set(),
    turnStartTime: null,
    turnTime: (settings && settings.timeLimit) || TURN_TIME,
    roundNumber: 0,
    wordsPlayed: [{ word: startWord, playerId: null, playerName: 'Start' }],
    lastLetter: startWord.charAt(startWord.length - 1).toLowerCase()
  };
}

function getCurrentState(room) {
  const gs = room.gameState;
  if (!gs) return null;

  const alivePlayers = gs.turnOrder.filter(id => !gs.eliminated.has(id));
  if (alivePlayers.length <= 1) {
    return { gameOver: true };
  }

  const currentPlayerId = getActivePlayer(gs);
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  gs.turnStartTime = Date.now();
  gs.roundNumber++;

  return {
    currentWord: gs.currentWord,
    lastLetter: gs.lastLetter,
    currentPlayerId,
    currentPlayerName: currentPlayer?.name || '?',
    timeLimit: gs.turnTime,
    turnStartTime: gs.turnStartTime,
    roundNumber: gs.roundNumber,
    players: room.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      eliminated: gs.eliminated.has(p.id)
    })),
    recentWords: gs.wordsPlayed.slice(-8)
  };
}

function getActivePlayer(gs) {
  const alive = gs.turnOrder.filter(id => !gs.eliminated.has(id));
  if (alive.length === 0) return null;
  return alive[gs.currentTurnIndex % alive.length];
}

function handleWord(room, playerId, word) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPlayerId = getActivePlayer(gs);
  if (playerId !== currentPlayerId) return null;
  if (gs.eliminated.has(playerId)) return null;

  const cleaned = (typeof word === 'string') ? word.trim().toLowerCase() : '';
  const player = room.players.find(p => p.id === playerId);

  // Validate word
  if (!VALID_WORD_PATTERN.test(cleaned)) {
    return eliminatePlayer(room, playerId, 'invalid', cleaned);
  }

  // Must start with the last letter
  if (cleaned.charAt(0) !== gs.lastLetter) {
    return eliminatePlayer(room, playerId, 'wrong_letter', cleaned);
  }

  // Must not be already used
  if (gs.usedWords.has(cleaned)) {
    return eliminatePlayer(room, playerId, 'duplicate', cleaned);
  }

  // Valid word!
  gs.usedWords.add(cleaned);
  gs.currentWord = cleaned;
  gs.lastLetter = cleaned.charAt(cleaned.length - 1);
  gs.wordsPlayed.push({ word: cleaned, playerId, playerName: player?.name || '?' });

  // Award points
  const points = POINTS_SURVIVE + (cleaned.length * POINTS_PER_LETTER);
  if (player) player.score += points;

  // Advance turn
  advanceTurn(gs);

  const alive = gs.turnOrder.filter(id => !gs.eliminated.has(id));
  if (alive.length <= 1) {
    // Award winner bonus
    if (alive.length === 1) {
      const winner = room.players.find(p => p.id === alive[0]);
      if (winner) winner.score += 500;
    }
    return { valid: true, word: cleaned, points, gameOver: true };
  }

  return { valid: true, word: cleaned, points, gameOver: false };
}

function eliminatePlayer(room, playerId, reason, word) {
  const gs = room.gameState;
  gs.eliminated.add(playerId);
  const player = room.players.find(p => p.id === playerId);

  advanceTurn(gs);

  const alive = gs.turnOrder.filter(id => !gs.eliminated.has(id));
  if (alive.length <= 1) {
    if (alive.length === 1) {
      const winner = room.players.find(p => p.id === alive[0]);
      if (winner) winner.score += 500;
    }
    return { valid: false, eliminated: true, playerId, playerName: player?.name, reason, word, gameOver: true };
  }

  return { valid: false, eliminated: true, playerId, playerName: player?.name, reason, word, gameOver: false };
}

function handleTimeout(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;
  const currentPlayerId = getActivePlayer(gs);
  if (playerId !== currentPlayerId) return null;
  return eliminatePlayer(room, playerId, 'timeout', '');
}

function advanceTurn(gs) {
  const alive = gs.turnOrder.filter(id => !gs.eliminated.has(id));
  if (alive.length === 0) return;
  gs.currentTurnIndex = (gs.currentTurnIndex + 1) % alive.length;
}

function getResults(room) {
  const sorted = [...room.players].filter(p => !p.isSpectator).sort((a, b) => b.score - a.score);
  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score,
      isHost: p.isHost
    })),
    totalWords: room.gameState.wordsPlayed.length,
    gameType: 'wordchain'
  };
}

module.exports = { init, getCurrentState, handleWord, handleTimeout, getResults };
