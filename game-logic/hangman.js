// Hangman — Server-side game logic
const fs = require('fs');
const path = require('path');

const wordsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'hangman-words.json'), 'utf8')
);

const ROUNDS = 8;
const GUESS_TIME = 60; // seconds per word
const MAX_WRONG = 6;   // head, body, left arm, right arm, left leg, right leg

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getCategories() {
  return Object.keys(wordsData);
}

function init(room, category, settings) {
  let pool;
  if (category && category !== 'all') {
    pool = wordsData[category] || [];
  } else {
    pool = [];
    for (const cat of Object.keys(wordsData)) {
      pool.push(...wordsData[cat]);
    }
  }

  const rounds = (settings && settings.rounds) || ROUNDS;
  const time = (settings && settings.timeLimit) || GUESS_TIME;
  const words = shuffle(pool).slice(0, rounds);

  room.gameState = {
    words,
    currentRound: 0,
    totalRounds: words.length,
    timeLimit: time,
    // Per-round state
    word: null,
    guessedLetters: [],
    wrongCount: 0,
    revealedWord: [],
    roundOver: false,
    roundResult: null, // 'solved' | 'hanged' | 'timeout'
    // Per-player tracking
    playerGuesses: {},  // playerId -> Set of letters guessed
    playerScores: {},   // playerId -> total score
    roundScorer: null,  // who solved it (first correct full reveal)
    timer: null
  };

  room.players.forEach(p => {
    room.gameState.playerScores[p.id] = 0;
  });

  startRound(room);
}

function startRound(room) {
  const gs = room.gameState;
  if (gs.currentRound >= gs.totalRounds) return;

  const word = gs.words[gs.currentRound].toLowerCase();
  gs.word = word;
  gs.guessedLetters = [];
  gs.wrongCount = 0;
  gs.revealedWord = word.split('').map(() => '_');
  gs.roundOver = false;
  gs.roundResult = null;
  gs.roundScorer = null;
  gs.playerGuesses = {};
  room.players.forEach(p => { gs.playerGuesses[p.id] = new Set(); });
}

function getCurrentState(room) {
  const gs = room.gameState;
  return {
    revealedWord: gs.revealedWord,
    guessedLetters: gs.guessedLetters,
    wrongCount: gs.wrongCount,
    maxWrong: MAX_WRONG,
    currentRound: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    timeLimit: gs.timeLimit,
    roundOver: gs.roundOver,
    roundResult: gs.roundResult,
    word: gs.roundOver ? gs.word : undefined,
    roundScorer: gs.roundScorer,
    scores: getScoreboard(room)
  };
}

function handleGuess(room, playerId, letter) {
  const gs = room.gameState;
  if (!gs || gs.roundOver) return null;

  letter = (typeof letter === 'string') ? letter.toLowerCase().trim() : '';
  if (letter.length !== 1 || !/[a-z]/.test(letter)) return null;

  // Already guessed globally
  if (gs.guessedLetters.includes(letter)) return null;

  // Track who guessed
  if (!gs.playerGuesses[playerId]) gs.playerGuesses[playerId] = new Set();
  gs.playerGuesses[playerId].add(letter);

  gs.guessedLetters.push(letter);

  const word = gs.word;
  if (word.includes(letter)) {
    // Reveal matching letters
    for (let i = 0; i < word.length; i++) {
      if (word[i] === letter) gs.revealedWord[i] = letter;
    }

    // Count occurrences for scoring
    const occurrences = word.split('').filter(c => c === letter).length;
    gs.playerScores[playerId] = (gs.playerScores[playerId] || 0) + (occurrences * 50);
    const player = room.players.find(p => p.id === playerId);
    if (player) player.score += occurrences * 50;

    // Check if word fully revealed
    if (!gs.revealedWord.includes('_')) {
      gs.roundOver = true;
      gs.roundResult = 'solved';
      const solver = room.players.find(p => p.id === playerId);
      gs.roundScorer = solver ? solver.name : 'Unknown';
      // Bonus for solver
      gs.playerScores[playerId] = (gs.playerScores[playerId] || 0) + 200;
      if (solver) solver.score += 200;
      return { action: 'solved', letter, correct: true };
    }

    return { action: 'correct', letter, correct: true };
  } else {
    gs.wrongCount++;
    // Penalty for wrong guess
    gs.playerScores[playerId] = (gs.playerScores[playerId] || 0) - 25;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.score = Math.max(0, player.score - 25);

    if (gs.wrongCount >= MAX_WRONG) {
      gs.roundOver = true;
      gs.roundResult = 'hanged';
      return { action: 'hanged', letter, correct: false };
    }

    return { action: 'wrong', letter, correct: false };
  }
}

function timeOut(room) {
  const gs = room.gameState;
  if (!gs || gs.roundOver) return null;
  gs.roundOver = true;
  gs.roundResult = 'timeout';
  return { action: 'timeout' };
}

function nextRound(room) {
  const gs = room.gameState;
  if (!gs) return null;
  gs.currentRound++;
  if (gs.currentRound >= gs.totalRounds) {
    return { action: 'gameOver' };
  }
  startRound(room);
  return { action: 'nextRound' };
}

function getScoreboard(room) {
  const gs = room.gameState;
  return room.players
    .map(p => ({ name: p.name, score: gs.playerScores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);
}

function getResults(room) {
  return {
    players: room.players
      .map(p => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score)
  };
}

module.exports = { init, getCategories, getCurrentState, handleGuess, timeOut, nextRound, getResults };
