// ─── NEVER HAVE I EVER SERVER LOGIC ───
const STATEMENTS = require('../data/neverhaveiever.json');

const ROUND_TIME = 15;
const DRINK_POINTS = 100;

function init(room, settings) {
  const rounds = Math.min((settings && settings.rounds) || 10, STATEMENTS.length);
  const shuffled = [...STATEMENTS].sort(() => Math.random() - 0.5).slice(0, rounds);

  room.gameState = {
    statements: shuffled,
    currentRound: 0,
    totalRounds: rounds,
    answers: {},
    roundTime: (settings && settings.timeLimit) || ROUND_TIME
  };
}

function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;

  gs.answers = {};

  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    statement: gs.statements[gs.currentRound],
    timeLimit: gs.roundTime
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.answers[playerId] !== undefined) return null;
  if (answer !== 'have' && answer !== 'havenot') return null;

  gs.answers[playerId] = answer;
  return { voted: true };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const activePlayers = room.players.filter(p => !p.isSpectator);

  const haveCount = Object.values(gs.answers).filter(a => a === 'have').length;
  const haveNotCount = Object.values(gs.answers).filter(a => a === 'havenot').length;
  const totalAnswered = haveCount + haveNotCount;

  const playerResults = activePlayers.map(p => {
    const answer = gs.answers[p.id];
    const points = answer === 'have' ? DRINK_POINTS : 0;
    p.score += points;
    return {
      id: p.id,
      name: p.name,
      answer: answer || 'none',
      drinks: answer === 'have',
      points,
      totalScore: p.score
    };
  });

  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    statement: gs.statements[gs.currentRound],
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    haveCount,
    haveNotCount,
    players: playerResults
  };
}

function nextRound(room) {
  room.gameState.currentRound++;
  return room.gameState.currentRound < room.gameState.totalRounds;
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
    gameType: 'neverhaveiever'
  };
}

module.exports = { init, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
