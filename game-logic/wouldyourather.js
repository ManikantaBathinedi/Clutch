// ─── WOULD YOU RATHER SERVER LOGIC ───
// Two options presented, everyone votes, majority wins points.

const QUESTIONS = [
  ['Be able to fly', 'Be able to turn invisible'],
  ['Live in the past', 'Live in the future'],
  ['Have unlimited money', 'Have unlimited knowledge'],
  ['Be the funniest person', 'Be the smartest person'],
  ['Always be 10 minutes late', 'Always be 20 minutes early'],
  ['Have no internet', 'Have no air conditioning/heating'],
  ['Speak every language', 'Play every instrument'],
  ['Live without music', 'Live without movies'],
  ['Be able to teleport', 'Be able to read minds'],
  ['Never use social media again', 'Never watch TV again'],
  ['Have a rewind button for your life', 'Have a pause button for your life'],
  ['Be famous but hated', 'Be unknown but loved'],
  ['Always have to say what you think', 'Never speak again'],
  ['Live in a treehouse', 'Live in a submarine'],
  ['Have super strength', 'Have super speed'],
  ['Be a dragon', 'Have a dragon'],
  ['Know how you will die', 'Know when you will die'],
  ['Only eat pizza forever', 'Never eat pizza again'],
  ['Have a personal chef', 'Have a personal chauffeur'],
  ['Live on the beach', 'Live in the mountains'],
  ['Be able to talk to animals', 'Speak all human languages'],
  ['Have X-ray vision', 'Have super hearing'],
  ['Win the lottery', 'Live twice as long'],
  ['Be a kid again', 'Be an adult forever'],
  ['Travel to space', 'Travel to the deepest ocean'],
  ['Give up breakfast', 'Give up dinner'],
  ['Always feel cold', 'Always feel hot'],
  ['Have more time', 'Have more money'],
  ['Be the hero', 'Be the villain'],
  ['Control fire', 'Control water'],
  ['Never age physically', 'Never age mentally'],
  ['Have a photographic memory', 'Never need sleep'],
  ['Live in Harry Potter world', 'Live in Star Wars world'],
  ['Be the best player on a losing team', 'Be the worst player on a winning team'],
  ['Have free Wi-Fi everywhere', 'Have free coffee everywhere'],
  ['Only whisper', 'Only shout'],
  ['Explore space', 'Explore the deep ocean'],
  ['Be locked in a library', 'Be locked in a theme park'],
  ['Never feel pain', 'Never feel sadness'],
  ['Have a flying carpet', 'Have a personal robot']
];

const ROUND_TIME = 15;
const MAJORITY_POINTS = 200;
const MINORITY_POINTS = 50;

function init(room, settings) {
  const rounds = Math.min((settings && settings.rounds) || 10, QUESTIONS.length);
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, rounds);

  room.gameState = {
    questions: shuffled,
    currentRound: 0,
    totalRounds: rounds,
    votes: {},
    roundScores: {},
    roundTime: (settings && settings.timeLimit) || ROUND_TIME,
    roundStartTime: null
  };
}

function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.questions.length) return null;

  gs.votes = {};
  gs.roundScores = {};
  gs.roundStartTime = Date.now();

  const q = gs.questions[gs.currentRound];
  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    optionA: q[0],
    optionB: q[1],
    timeLimit: gs.roundTime
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.votes[playerId] !== undefined) return null;
  if (answer !== 'A' && answer !== 'B') return null;

  gs.votes[playerId] = answer;
  return { voted: true };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const q = gs.questions[gs.currentRound];
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const totalVotes = Object.keys(gs.votes).length;
  const votesA = Object.values(gs.votes).filter(v => v === 'A').length;
  const votesB = totalVotes - votesA;
  const majority = votesA >= votesB ? 'A' : 'B';
  const pctA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 0;
  const pctB = 100 - pctA;

  // Award points
  const playerResults = activePlayers.map(p => {
    const vote = gs.votes[p.id];
    let points = 0;
    if (vote) {
      points = vote === majority ? MAJORITY_POINTS : MINORITY_POINTS;
      p.score += points;
    }
    gs.roundScores[p.id] = points;
    return {
      id: p.id,
      name: p.name,
      vote,
      points,
      totalScore: p.score,
      inMajority: vote === majority
    };
  });

  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    optionA: q[0],
    optionB: q[1],
    votesA,
    votesB,
    pctA,
    pctB,
    majority,
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
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
    gameType: 'wouldyourather'
  };
}

module.exports = { init, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
