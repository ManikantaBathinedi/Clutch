// ─── HOW WELL DO YOU KNOW ME — SERVER LOGIC ───
// Both players answer the same question about each other. Score points for matching answers.

const questionsData = require('../data/knowme-questions.json');

const ROUND_TIME = 30;

function init(room, settings) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  if (activePlayers.length < 2) return;

  const rounds = Math.min((settings && settings.rounds) || 10, questionsData.length);
  const shuffled = [...questionsData].sort(() => Math.random() - 0.5).slice(0, rounds);

  // Pair up players (first two active players)
  const p1 = activePlayers[0];
  const p2 = activePlayers[1];

  room.gameState = {
    questions: shuffled,
    currentRound: 0,
    totalRounds: rounds,
    player1: p1.id,
    player2: p2.id,
    player1Name: p1.name,
    player2Name: p2.name,
    // Phase: 'answer' (both type answers) -> 'reveal' (see if they match)
    phase: 'answer',
    answers: {},       // { playerId: answer }
    roundTime: (settings && settings.timeLimit) || ROUND_TIME,
    roundHistory: []   // track each round result
  };
}

function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;

  gs.answers = {};
  gs.phase = 'answer';

  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    question: gs.questions[gs.currentRound],
    timeLimit: gs.roundTime,
    player1Name: gs.player1Name,
    player2Name: gs.player2Name,
    phase: 'answer'
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'answer') return null;
  if (gs.answers[playerId] !== undefined) return null;
  if (playerId !== gs.player1 && playerId !== gs.player2) return null;

  const trimmed = (typeof answer === 'string') ? answer.trim().substring(0, 200) : '';
  if (!trimmed) return null;

  gs.answers[playerId] = trimmed;

  // Check if both answered
  const bothAnswered = gs.answers[gs.player1] && gs.answers[gs.player2];
  return { voted: true, bothAnswered };
}

function getRoundResults(room) {
  const gs = room.gameState;
  gs.phase = 'reveal';

  const a1 = gs.answers[gs.player1] || '(no answer)';
  const a2 = gs.answers[gs.player2] || '(no answer)';

  // Simple matching: normalize and compare
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isMatch = norm(a1) === norm(a2) && norm(a1).length > 0;

  // Award points for matching
  const points = isMatch ? 500 : 0;
  if (isMatch) {
    const p1 = room.players.find(p => p.id === gs.player1);
    const p2 = room.players.find(p => p.id === gs.player2);
    if (p1) p1.score += points;
    if (p2) p2.score += points;
  }

  gs.roundHistory.push({ question: gs.questions[gs.currentRound], a1, a2, isMatch });

  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    question: gs.questions[gs.currentRound],
    answer1: a1,
    answer2: a2,
    player1Name: gs.player1Name,
    player2Name: gs.player2Name,
    isMatch,
    points,
    matchCount: gs.roundHistory.filter(r => r.isMatch).length,
    totalAsked: gs.roundHistory.length
  };
}

function nextRound(room) {
  room.gameState.currentRound++;
  return room.gameState.currentRound < room.gameState.totalRounds;
}

function getResults(room) {
  const gs = room.gameState;
  const matchCount = gs.roundHistory.filter(r => r.isMatch).length;
  const totalRounds = gs.roundHistory.length || gs.totalRounds;
  const pct = totalRounds > 0 ? Math.round((matchCount / totalRounds) * 100) : 0;

  const sorted = [...room.players].filter(p => !p.isSpectator).sort((a, b) => b.score - a.score);
  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score,
      isHost: p.isHost
    })),
    matchCount,
    totalRounds,
    compatibility: pct,
    gameType: 'knowme'
  };
}

module.exports = { init, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
