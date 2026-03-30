// ─── TRUTH OR DRINK SERVER LOGIC ───
const QUESTIONS = require('../data/truthordrink.json');

const ROUND_TIME = 30;
const TRUTH_POINTS = 150;
const DRINK_POINTS = 50;

function init(room, settings) {
  const rounds = Math.min((settings && settings.rounds) || 10, QUESTIONS.length);
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, rounds);
  const players = room.players.filter(p => !p.isSpectator);
  const playerOrder = players.map(p => p.id).sort(() => Math.random() - 0.5);

  room.gameState = {
    questions: shuffled,
    currentRound: 0,
    totalRounds: rounds,
    answers: {},
    playerOrder,
    roundTime: (settings && settings.timeLimit) || ROUND_TIME
  };
}

function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;

  gs.answers = {};

  // The "hot seat" player rotates
  const hotSeatId = gs.playerOrder[gs.currentRound % gs.playerOrder.length];
  const hotSeatPlayer = room.players.find(p => p.id === hotSeatId);

  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    question: gs.questions[gs.currentRound],
    hotSeatId,
    hotSeatName: hotSeatPlayer ? hotSeatPlayer.name : 'Unknown',
    timeLimit: gs.roundTime
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.answers[playerId] !== undefined) return null;

  const hotSeatId = gs.playerOrder[gs.currentRound % gs.playerOrder.length];

  if (playerId === hotSeatId) {
    // Hot seat player chooses truth or drink
    if (answer !== 'truth' && answer !== 'drink') return null;
    gs.answers[playerId] = answer;
    return { chose: answer };
  } else {
    // Other players vote on whether they believe the truth
    if (answer !== 'believe' && answer !== 'doubt') return null;
    gs.answers[playerId] = answer;
    return { voted: true };
  }
}

function getRoundResults(room) {
  const gs = room.gameState;
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const hotSeatId = gs.playerOrder[gs.currentRound % gs.playerOrder.length];
  const hotSeatPlayer = room.players.find(p => p.id === hotSeatId);
  const hotSeatAnswer = gs.answers[hotSeatId] || 'drink'; // default to drink if no answer

  // Hot seat player gets points
  const hotSeatPoints = hotSeatAnswer === 'truth' ? TRUTH_POINTS : DRINK_POINTS;
  if (hotSeatPlayer) hotSeatPlayer.score += hotSeatPoints;

  const playerResults = activePlayers.map(p => {
    const isHotSeat = p.id === hotSeatId;
    return {
      id: p.id,
      name: p.name,
      isHotSeat,
      answer: gs.answers[p.id] || 'none',
      points: isHotSeat ? hotSeatPoints : 0,
      totalScore: p.score
    };
  });

  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  const believers = Object.entries(gs.answers).filter(([id, a]) => id !== hotSeatId && a === 'believe').length;
  const doubters = Object.entries(gs.answers).filter(([id, a]) => id !== hotSeatId && a === 'doubt').length;

  return {
    question: gs.questions[gs.currentRound],
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    hotSeatName: hotSeatPlayer ? hotSeatPlayer.name : 'Unknown',
    hotSeatAnswer,
    believers,
    doubters,
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
    gameType: 'truthordrink'
  };
}

module.exports = { init, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
