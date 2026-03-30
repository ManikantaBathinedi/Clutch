// ─── MOST LIKELY TO SERVER LOGIC ───
const QUESTIONS = require('../data/mostlikelyto.json');

const ROUND_TIME = 20;
const VOTED_POINTS = 100; // points per vote received (person drinks)

function init(room, settings) {
  const rounds = Math.min((settings && settings.rounds) || 10, QUESTIONS.length);
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, rounds);

  room.gameState = {
    questions: shuffled,
    currentRound: 0,
    totalRounds: rounds,
    votes: {},
    roundTime: (settings && settings.timeLimit) || ROUND_TIME
  };
}

function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;

  gs.votes = {};

  const players = room.players.filter(p => !p.isSpectator).map(p => ({
    id: p.id,
    name: p.name
  }));

  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    question: gs.questions[gs.currentRound],
    players,
    timeLimit: gs.roundTime
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.votes[playerId]) return null;

  // answer is the ID of the player they're voting for
  const target = room.players.find(p => p.id === answer && !p.isSpectator);
  if (!target) return null;

  gs.votes[playerId] = answer;
  return { voted: true };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const activePlayers = room.players.filter(p => !p.isSpectator);

  // Count votes per player
  const voteCounts = {};
  activePlayers.forEach(p => { voteCounts[p.id] = 0; });
  Object.values(gs.votes).forEach(targetId => {
    if (voteCounts[targetId] !== undefined) voteCounts[targetId]++;
  });

  // Find max votes
  const maxVotes = Math.max(...Object.values(voteCounts), 0);

  // Award points (person with most votes "drinks" = gets points for fun)
  const playerResults = activePlayers.map(p => {
    const votes = voteCounts[p.id] || 0;
    const points = votes * VOTED_POINTS;
    p.score += points;
    return {
      id: p.id,
      name: p.name,
      votesReceived: votes,
      points,
      totalScore: p.score,
      isMostVoted: votes === maxVotes && maxVotes > 0
    };
  });

  playerResults.sort((a, b) => b.votesReceived - a.votesReceived);

  // Who voted for whom
  const voteDetails = Object.entries(gs.votes).map(([voterId, targetId]) => {
    const voter = room.players.find(p => p.id === voterId);
    const target = room.players.find(p => p.id === targetId);
    return { voterName: voter ? voter.name : '?', targetName: target ? target.name : '?' };
  });

  return {
    question: gs.questions[gs.currentRound],
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    players: playerResults,
    voteDetails
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
    gameType: 'mostlikelyto'
  };
}

module.exports = { init, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
