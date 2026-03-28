const fs = require('fs');
const path = require('path');

const puzzlesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'emoji-puzzles.json'), 'utf8')
);

const PUZZLES_PER_ROUND = 8;
const PUZZLE_TIME = 25;
const BASE_POINTS = 500;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get available categories
function getCategories() {
  return Object.keys(puzzlesData);
}

function init(room, category, settings) {
  let pool;
  if (category && category !== 'all') {
    pool = puzzlesData[category] || [];
  } else {
    pool = [];
    for (const cat of Object.keys(puzzlesData)) {
      pool.push(...puzzlesData[cat]);
    }
  }
  const rounds = (settings && settings.rounds) || PUZZLES_PER_ROUND;
  const time = (settings && settings.timeLimit) || PUZZLE_TIME;
  const puzzles = shuffle(pool).slice(0, rounds);
  room.gameState = {
    puzzles,
    currentPuzzle: 0,
    answers: {},
    correctOrder: [],
    puzzleStartTime: null,
    roundScores: {},
    puzzleTime: time
  };
}

function getCurrentPuzzle(room) {
  const gs = room.gameState;
  if (!gs || gs.currentPuzzle >= gs.puzzles.length) return null;

  const p = gs.puzzles[gs.currentPuzzle];
  gs.answers = {};
  gs.correctOrder = [];
  gs.roundScores = {};
  gs.puzzleStartTime = Date.now();

  return {
    puzzleNumber: gs.currentPuzzle + 1,
    totalPuzzles: gs.puzzles.length,
    emojis: p.emojis,
    hint: p.hint,
    timeLimit: gs.puzzleTime
  };
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function handleAnswer(room, playerId, guess) {
  const gs = room.gameState;
  if (!gs || gs.answers[playerId]) return null;

  const elapsed = (Date.now() - gs.puzzleStartTime) / 1000;
  if (elapsed > gs.puzzleTime + 1) return null;

  const p = gs.puzzles[gs.currentPuzzle];
  const isCorrect = normalize(guess) === normalize(p.answer);

  let points = 0;
  if (isCorrect) {
    const position = gs.correctOrder.length;
    points = Math.max(BASE_POINTS - (position * 100), 100);
    gs.correctOrder.push(playerId);

    const player = room.players.find(pl => pl.id === playerId);
    if (player) player.score += points;
  }

  gs.answers[playerId] = { guess, isCorrect, points };
  gs.roundScores[playerId] = points;

  return { isCorrect, points };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const p = gs.puzzles[gs.currentPuzzle];

  const playerResults = room.players.map(pl => ({
    id: pl.id,
    name: pl.name,
    totalScore: pl.score,
    roundPoints: gs.roundScores[pl.id] || 0,
    answered: gs.answers[pl.id] !== undefined,
    isCorrect: gs.answers[pl.id]?.isCorrect || false
  }));

  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    correctAnswer: p.answer,
    emojis: p.emojis,
    puzzleNumber: gs.currentPuzzle + 1,
    totalPuzzles: gs.puzzles.length,
    players: playerResults
  };
}

function nextRound(room) {
  room.gameState.currentPuzzle++;
  return room.gameState.currentPuzzle < room.gameState.puzzles.length;
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

module.exports = { init, getCategories, getCurrentPuzzle, handleAnswer, getRoundResults, nextRound, getResults };
