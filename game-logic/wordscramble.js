const fs = require('fs');
const path = require('path');

const wordsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'word-scramble.json'), 'utf8')
);

const WORDS_PER_ROUND = 10;
const WORD_TIME = 20;
const BASE_POINTS = 500;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scrambleWord(word) {
  let letters = word.split('');
  let scrambled;
  do {
    scrambled = shuffle(letters).join('');
  } while (scrambled === word);
  return scrambled;
}

// Get available categories
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
  const rounds = (settings && settings.rounds) || WORDS_PER_ROUND;
  const time = (settings && settings.timeLimit) || WORD_TIME;
  const words = shuffle(pool).slice(0, rounds);
  room.gameState = {
    words,
    currentWord: 0,
    answers: {},
    correctOrder: [],
    wordStartTime: null,
    roundScores: {},
    wordTime: time
  };
}

function getCurrentWord(room) {
  const gs = room.gameState;
  if (!gs || gs.currentWord >= gs.words.length) return null;

  const w = gs.words[gs.currentWord];
  gs.answers = {};
  gs.correctOrder = [];
  gs.roundScores = {};
  gs.wordStartTime = Date.now();

  return {
    wordNumber: gs.currentWord + 1,
    totalWords: gs.words.length,
    scrambled: scrambleWord(w.word).toUpperCase(),
    hint: w.hint,
    wordLength: w.word.length,
    timeLimit: gs.wordTime
  };
}

function handleAnswer(room, playerId, guess) {
  const gs = room.gameState;
  if (!gs || gs.answers[playerId]) return null;

  const elapsed = (Date.now() - gs.wordStartTime) / 1000;
  if (elapsed > gs.wordTime + 1) return null;

  const w = gs.words[gs.currentWord];
  const isCorrect = guess.toLowerCase().trim() === w.word.toLowerCase();

  let points = 0;
  if (isCorrect) {
    const position = gs.correctOrder.length;
    points = Math.max(BASE_POINTS - (position * 100), 100);
    gs.correctOrder.push(playerId);

    const player = room.players.find(p => p.id === playerId);
    if (player) player.score += points;
  }

  gs.answers[playerId] = { guess, isCorrect, points };
  gs.roundScores[playerId] = points;

  return { isCorrect, points };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const w = gs.words[gs.currentWord];

  const playerResults = room.players.map(p => ({
    id: p.id,
    name: p.name,
    totalScore: p.score,
    roundPoints: gs.roundScores[p.id] || 0,
    answered: gs.answers[p.id] !== undefined,
    isCorrect: gs.answers[p.id]?.isCorrect || false
  }));

  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    correctAnswer: w.word,
    wordNumber: gs.currentWord + 1,
    totalWords: gs.words.length,
    players: playerResults
  };
}

function nextRound(room) {
  const gs = room.gameState;
  gs.currentWord++;
  return gs.currentWord < gs.words.length;
}

function getResults(room) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score
    }))
  };
}

module.exports = { init, getCategories, getCurrentWord, handleAnswer, getRoundResults, nextRound, getResults };
