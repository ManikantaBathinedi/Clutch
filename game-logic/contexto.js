// ─── CONTEXTO SERVER LOGIC ───
const puzzleData = require('../data/contexto-data.json');

const DEFAULT_ROUNDS = 3;
const DEFAULT_TIME_LIMIT = 90; // seconds per round
const MAX_HINTS = 3;

function init(room, settings) {
  const rounds = Math.max(1, (settings && settings.rounds) || DEFAULT_ROUNDS);
  const timeLimit = (settings && settings.timeLimit) || DEFAULT_TIME_LIMIT;

  // Pick random puzzles for each round
  const shuffled = [...puzzleData.puzzles].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(rounds, shuffled.length));

  // Build rank lookup Maps for fast guessing
  const puzzles = selected.map(p => {
    const rankMap = new Map();
    p.ranked.forEach((word, idx) => rankMap.set(word, idx + 1));
    return {
      secret: p.secret,
      rankMap,
      rankedList: p.ranked,
      totalWords: p.ranked.length,
      hintWords: p.hints || p.ranked // pre-filtered common words for hints
    };
  });

  room.gameState = {
    puzzles,
    currentRound: 0,
    totalRounds: puzzles.length,
    timeLimit,
    roundStartTime: null,
    playerGuesses: {},
    playerBestRank: {},
    playerFound: {},
    hintsUsed: {}
  };

  room.players.forEach(p => { if (!p.isSpectator) p.score = 0; });
}

function resetRoundState(room) {
  const gs = room.gameState;
  const puzzle = gs.puzzles[gs.currentRound];
  gs.roundStartTime = Date.now();
  gs.playerGuesses = {};
  gs.playerBestRank = {};
  gs.playerFound = {};
  gs.hintsUsed = {};

  room.players.forEach(p => {
    if (!p.isSpectator) {
      gs.playerGuesses[p.id] = [];
      gs.playerBestRank[p.id] = puzzle.totalWords + 1;
      gs.playerFound[p.id] = false;
      gs.hintsUsed[p.id] = 0;
    }
  });
}

function getCurrentPrompt(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;

  const puzzle = gs.puzzles[gs.currentRound];
  resetRoundState(room);

  return {
    roundNumber: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    totalWords: puzzle.totalWords,
    timeLimit: gs.timeLimit,
    gameType: 'contexto',
    players: room.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id,
      name: p.name,
      guessCount: 0,
      bestRank: puzzle.totalWords + 1,
      found: false
    }))
  };
}

function handleGuess(room, playerId, word) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;
  if (gs.playerFound[playerId]) return null;

  const puzzle = gs.puzzles[gs.currentRound];
  const guess = (typeof word === 'string') ? word.toLowerCase().trim() : '';
  if (!guess) return null;

  // Check time limit (allow 2s grace)
  const elapsed = (Date.now() - gs.roundStartTime) / 1000;
  if (elapsed > gs.timeLimit + 2) return null;

  const playerGuesses = gs.playerGuesses[playerId] || [];

  // Check duplicate
  if (playerGuesses.some(g => g.word === guess)) {
    return { type: 'duplicate', word: guess };
  }

  // Check if it's the secret word
  if (guess === puzzle.secret) {
    playerGuesses.push({ word: guess, rank: 0 });
    gs.playerGuesses[playerId] = playerGuesses;
    gs.playerBestRank[playerId] = 0;
    gs.playerFound[playerId] = true;

    // Score: base + guess bonus + time bonus - hint penalty
    const guessCount = playerGuesses.length;
    const hintPenalty = (gs.hintsUsed[playerId] || 0) * 200;
    const guessBonus = Math.max(0, 500 - guessCount * 10);
    const timeBonus = Math.max(0, Math.round((gs.timeLimit - elapsed) * 5));
    const points = Math.max(100, 1000 + guessBonus + timeBonus - hintPenalty);

    const player = room.players.find(p => p.id === playerId);
    if (player) player.score += points;

    return {
      type: 'found',
      word: guess,
      rank: 0,
      points,
      totalGuesses: playerGuesses.length,
      bestRank: 0
    };
  }

  // Look up rank in pre-computed data
  const rank = puzzle.rankMap.get(guess);
  if (rank === undefined) {
    // Word not in ranked list — check if it looks like a valid English word
    if (!/^[a-z]{2,20}$/.test(guess)) {
      return { type: 'unknown', word: guess };
    }
    // Give unranked words a consistent "far" rank
    const farRank = puzzle.totalWords + 1;
    playerGuesses.push({ word: guess, rank: farRank });
    gs.playerGuesses[playerId] = playerGuesses;
    return {
      type: 'far',
      word: guess,
      rank: farRank,
      totalWords: puzzle.totalWords,
      totalGuesses: playerGuesses.length,
      bestRank: gs.playerBestRank[playerId]
    };
  }

  playerGuesses.push({ word: guess, rank });
  gs.playerGuesses[playerId] = playerGuesses;

  if (rank < gs.playerBestRank[playerId]) {
    gs.playerBestRank[playerId] = rank;
  }

  return {
    type: 'ranked',
    word: guess,
    rank,
    totalWords: puzzle.totalWords,
    totalGuesses: playerGuesses.length,
    bestRank: gs.playerBestRank[playerId]
  };
}

function getHint(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;
  if (gs.playerFound[playerId]) return null;

  const puzzle = gs.puzzles[gs.currentRound];
  const hintsUsed = gs.hintsUsed[playerId] || 0;
  if (hintsUsed >= MAX_HINTS) return null;

  const playerGuesses = gs.playerGuesses[playerId] || [];
  const guessedWords = new Set(playerGuesses.map(g => g.word));

  // Each hint reveals a recognizable word — picked from the pre-filtered common hints list
  const hintWords = puzzle.hintWords;
  const hintCount = hintWords.length;
  if (hintCount === 0) return null;

  // Hint 1: mid-range word, Hint 2: closer word, Hint 3: very close word
  let minIdx, maxIdx;
  if (hintsUsed === 0) { minIdx = Math.floor(hintCount * 0.4); maxIdx = hintCount - 1; }
  else if (hintsUsed === 1) { minIdx = Math.floor(hintCount * 0.15); maxIdx = Math.floor(hintCount * 0.4); }
  else { minIdx = 0; maxIdx = Math.max(1, Math.floor(hintCount * 0.15)); }

  // Find a hint word in the range that hasn't been guessed
  const candidates = [];
  for (let i = minIdx; i <= maxIdx; i++) {
    const w = hintWords[i];
    if (w && !guessedWords.has(w)) {
      const rank = puzzle.rankMap.get(w);
      if (rank) candidates.push({ word: w, rank });
    }
  }

  if (candidates.length === 0) return null;

  const hint = candidates[Math.floor(Math.random() * candidates.length)];
  gs.hintsUsed[playerId] = hintsUsed + 1;

  return {
    type: 'hint',
    word: hint.word,
    rank: hint.rank,
    totalWords: puzzle.totalWords,
    hintsUsed: hintsUsed + 1,
    hintsRemaining: MAX_HINTS - hintsUsed - 1,
    totalGuesses: playerGuesses.length,
    bestRank: gs.playerBestRank[playerId]
  };
}

function allPlayersFound(room) {
  const gs = room.gameState;
  const activePlayers = room.players.filter(p => !p.isSpectator);
  return activePlayers.every(p => gs.playerFound[p.id]);
}

function getRoundResults(room) {
  const gs = room.gameState;
  if (!gs) return null;
  const puzzle = gs.puzzles[gs.currentRound];

  // Award proximity points to players who didn't find the answer
  room.players.filter(p => !p.isSpectator).forEach(p => {
    if (!gs.playerFound[p.id]) {
      const bestRank = gs.playerBestRank[p.id];
      const hintPenalty = (gs.hintsUsed[p.id] || 0) * 200;
      const proximityScore = Math.max(0, Math.round(500 * (1 - bestRank / puzzle.totalWords)));
      const points = Math.max(10, proximityScore - hintPenalty);
      p.score += points;
    }
  });

  const playerResults = room.players.filter(p => !p.isSpectator).map(p => {
    const guesses = gs.playerGuesses[p.id] || [];
    const bestRank = gs.playerBestRank[p.id];
    return {
      id: p.id,
      name: p.name,
      guessCount: guesses.length,
      bestRank,
      found: gs.playerFound[p.id],
      totalScore: p.score
    };
  });

  // Sort: found players first (by fewer guesses), then by best rank
  playerResults.sort((a, b) => {
    if (a.found && !b.found) return -1;
    if (!a.found && b.found) return 1;
    if (a.found && b.found) return a.guessCount - b.guessCount;
    return a.bestRank - b.bestRank;
  });

  return {
    roundNumber: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    secret: puzzle.secret,
    players: playerResults,
    gameType: 'contexto'
  };
}

function nextRound(room) {
  const gs = room.gameState;
  gs.currentRound++;
  return gs.currentRound < gs.totalRounds;
}

function getResults(room) {
  const sorted = [...room.players]
    .filter(p => !p.isSpectator)
    .sort((a, b) => b.score - a.score);

  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score
    })),
    gameType: 'contexto'
  };
}

module.exports = { init, getCurrentPrompt, handleGuess, getHint, allPlayersFound, getRoundResults, nextRound, getResults };
