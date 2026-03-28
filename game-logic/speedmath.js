const PROBLEMS_PER_ROUND = 10;
const PROBLEM_TIME = 12;
const BASE_POINTS = 500;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateProblem(difficulty) {
  const ops = ['+', '-', '×'];
  let a, b, op, answer;

  if (difficulty <= 3) {
    op = ops[randInt(0, 1)];
    a = randInt(2, 20);
    b = randInt(2, 20);
  } else if (difficulty <= 6) {
    op = ops[randInt(0, 2)];
    if (op === '×') {
      a = randInt(2, 12);
      b = randInt(2, 12);
    } else {
      a = randInt(10, 99);
      b = randInt(10, 99);
    }
  } else {
    op = ops[randInt(0, 2)];
    if (op === '×') {
      a = randInt(3, 15);
      b = randInt(3, 20);
    } else {
      a = randInt(50, 200);
      b = randInt(50, 200);
    }
  }

  if (op === '+') answer = a + b;
  else if (op === '-') { if (a < b) [a, b] = [b, a]; answer = a - b; }
  else answer = a * b;

  return { equation: `${a} ${op} ${b}`, answer };
}

function init(room, settings) {
  const rounds = (settings && settings.rounds) || PROBLEMS_PER_ROUND;
  const time = (settings && settings.timeLimit) || PROBLEM_TIME;
  const problems = [];
  for (let i = 0; i < rounds; i++) {
    problems.push(generateProblem(i + 1));
  }

  room.gameState = {
    problems,
    currentProblem: 0,
    answers: {},
    correctOrder: [],
    problemStartTime: null,
    roundScores: {},
    problemTime: time
  };
}

function getCurrentProblem(room) {
  const gs = room.gameState;
  if (!gs || gs.currentProblem >= gs.problems.length) return null;

  const p = gs.problems[gs.currentProblem];
  gs.answers = {};
  gs.correctOrder = [];
  gs.roundScores = {};
  gs.problemStartTime = Date.now();

  return {
    problemNumber: gs.currentProblem + 1,
    totalProblems: gs.problems.length,
    equation: p.equation,
    timeLimit: gs.problemTime
  };
}

function handleAnswer(room, playerId, guess) {
  const gs = room.gameState;
  if (!gs || gs.answers[playerId]) return null;

  const elapsed = (Date.now() - gs.problemStartTime) / 1000;
  if (elapsed > gs.problemTime + 1) return null;

  const p = gs.problems[gs.currentProblem];
  const parsedGuess = parseInt(guess, 10);
  const isCorrect = parsedGuess === p.answer;

  let points = 0;
  if (isCorrect) {
    const position = gs.correctOrder.length;
    points = Math.max(BASE_POINTS - (position * 100), 100);
    gs.correctOrder.push(playerId);

    const player = room.players.find(pl => pl.id === playerId);
    if (player) player.score += points;
  }

  gs.answers[playerId] = { guess: parsedGuess, isCorrect, points };
  gs.roundScores[playerId] = points;

  return { isCorrect, points };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const p = gs.problems[gs.currentProblem];

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
    correctAnswer: p.answer.toString(),
    equation: p.equation,
    problemNumber: gs.currentProblem + 1,
    totalProblems: gs.problems.length,
    players: playerResults
  };
}

function nextRound(room) {
  room.gameState.currentProblem++;
  return room.gameState.currentProblem < room.gameState.problems.length;
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

module.exports = { init, getCurrentProblem, handleAnswer, getRoundResults, nextRound, getResults };
