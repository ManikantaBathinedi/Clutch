const fs = require('fs');
const path = require('path');

// Load questions
const questionsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'trivia-questions.json'), 'utf8')
);

const QUESTION_TIME = 15; // seconds per question
const BASE_POINTS = 1000;
const QUESTIONS_PER_ROUND = 10;

// Shuffle array (Fisher-Yates)
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
  return Object.keys(questionsData);
}

// Pick questions, optionally filtered by category
function pickQuestions(count, category) {
  const allQuestions = [];
  const categories = (category && category !== 'all') ? [category] : Object.keys(questionsData);
  for (const cat of categories) {
    if (!questionsData[cat]) continue;
    for (const q of questionsData[cat]) {
      allQuestions.push({ ...q, category: cat });
    }
  }
  return shuffle(allQuestions).slice(0, count);
}

// Initialize trivia game state for a room
function init(room, category, settings) {
  const rounds = (settings && settings.rounds) || QUESTIONS_PER_ROUND;
  const time = (settings && settings.timeLimit) || QUESTION_TIME;
  const questions = pickQuestions(rounds, category);
  room.gameState = {
    questions,
    currentQuestion: 0,
    answers: {},       // { playerId: { answer, time } }
    questionStartTime: null,
    roundScores: {},   // points earned this round per player
    questionTime: time
  };
}

// Get the current question data to send to clients (no correct answer!)
function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs || gs.currentQuestion >= gs.questions.length) return null;

  const q = gs.questions[gs.currentQuestion];
  gs.answers = {};  // reset answers for new question
  gs.roundScores = {};
  gs.questionStartTime = Date.now();

  return {
    questionNumber: gs.currentQuestion + 1,
    totalQuestions: gs.questions.length,
    question: q.question,
    options: q.options,
    category: q.category,
    timeLimit: gs.questionTime
  };
}

// Handle a player's answer
function handleAnswer(room, playerId, answerIndex) {
  const gs = room.gameState;
  if (!gs || gs.answers[playerId] !== undefined) return null; // already answered

  const elapsed = (Date.now() - gs.questionStartTime) / 1000;
  if (elapsed > gs.questionTime + 1) return null; // too late (1s grace)

  const q = gs.questions[gs.currentQuestion];
  const isCorrect = answerIndex === q.correct;
  const timeLeft = Math.max(0, gs.questionTime - elapsed);

  // Score: faster = more points
  let points = 0;
  if (isCorrect) {
    points = Math.round(BASE_POINTS * (timeLeft / gs.questionTime));
    points = Math.max(points, 100); // minimum 100 for correct answer

    // Add to player's total
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.score += points;
    }
  }

  gs.answers[playerId] = { answer: answerIndex, time: elapsed, isCorrect, points };
  gs.roundScores[playerId] = points;

  return { isCorrect, points, correctAnswer: q.correct };
}

// Get round results (after all answered or timer expired)
function getRoundResults(room) {
  const gs = room.gameState;
  const q = gs.questions[gs.currentQuestion];

  // Build results
  const playerResults = room.players.map(p => ({
    id: p.id,
    name: p.name,
    totalScore: p.score,
    roundPoints: gs.roundScores[p.id] || 0,
    answered: gs.answers[p.id] !== undefined,
    isCorrect: gs.answers[p.id]?.isCorrect || false
  }));

  // Sort by total score
  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    correctAnswer: q.correct,
    correctText: q.options[q.correct],
    question: q.question,
    players: playerResults,
    questionNumber: gs.currentQuestion + 1,
    totalQuestions: gs.questions.length
  };
}

// Move to next question, returns true if there's a next question
function nextRound(room) {
  const gs = room.gameState;
  gs.currentQuestion++;
  return gs.currentQuestion < gs.questions.length;
}

// Get final results
function getResults(room) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return {
    players: sorted.map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score,
      isHost: p.isHost
    })),
    gameType: 'trivia'
  };
}

module.exports = { init, getCategories, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
