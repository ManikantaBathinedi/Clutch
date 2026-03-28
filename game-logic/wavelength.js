// ─── WAVELENGTH SERVER LOGIC ───
// Clue-giver sees where a target sits on a spectrum, gives a clue.
// Other players guess the position. Points for accuracy.

const SPECTRUMS = [
  ['Hot', 'Cold'],
  ['Underrated', 'Overrated'],
  ['Good', 'Evil'],
  ['Round', 'Pointy'],
  ['Scary', 'Not Scary'],
  ['Normal', 'Weird'],
  ['Boring', 'Exciting'],
  ['Cheap', 'Expensive'],
  ['Useless', 'Useful'],
  ['Easy', 'Hard'],
  ['Old', 'Young'],
  ['Smelly', 'Fragrant'],
  ['Loud', 'Quiet'],
  ['Fast', 'Slow'],
  ['Big', 'Small'],
  ['Common', 'Rare'],
  ['Beautiful', 'Ugly'],
  ['Simple', 'Complex'],
  ['Healthy', 'Unhealthy'],
  ['Brave', 'Cowardly'],
  ['Funny', 'Serious'],
  ['Tasty', 'Disgusting'],
  ['Modern', 'Ancient'],
  ['Strong', 'Weak'],
  ['Wet', 'Dry'],
  ['Natural', 'Artificial'],
  ['Famous', 'Unknown'],
  ['Necessary', 'Unnecessary'],
  ['Innocent', 'Guilty'],
  ['Safe', 'Dangerous'],
  ['Real', 'Fictional'],
  ['Relaxing', 'Stressful'],
  ['High Quality', 'Low Quality'],
  ['Mainstream', 'Niche'],
  ['Loved', 'Hated'],
  ['Ethical', 'Unethical']
];

const CLUE_TIME = 30;
const GUESS_TIME = 30;
const BASE_POINTS = 500;
const CLUE_GIVER_BONUS = 100; // per close guess

function init(room, settings) {
  const rounds = (settings && settings.rounds) || 8;

  // Shuffle spectrums
  const shuffled = [...SPECTRUMS].sort(() => Math.random() - 0.5).slice(0, rounds);

  // Create clue-giver order
  const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
  const giverOrder = [];
  for (let i = 0; i < rounds; i++) {
    giverOrder.push(playerIds[i % playerIds.length]);
  }

  room.gameState = {
    spectrums: shuffled,
    currentRound: 0,
    totalRounds: rounds,
    giverOrder,
    target: 0,         // 0–100
    clue: null,
    guesses: {},       // { playerId: number 0-100 }
    roundScores: {},
    phase: 'clue',     // clue, guess, reveal
    phaseStartTime: null,
    clueTime: CLUE_TIME,
    guessTime: GUESS_TIME
  };
  setupRound(room);
}

function setupRound(room) {
  const gs = room.gameState;
  // Random target position
  gs.target = Math.floor(Math.random() * 81) + 10; // 10–90 to avoid extremes
  gs.clue = null;
  gs.guesses = {};
  gs.roundScores = {};
  gs.phase = 'clue';
  gs.phaseStartTime = Date.now();
}

function getClueGiverView(room) {
  const gs = room.gameState;
  const spectrum = gs.spectrums[gs.currentRound];
  return {
    round: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    leftLabel: spectrum[0],
    rightLabel: spectrum[1],
    target: gs.target,
    phase: 'clue',
    isClueGiver: true,
    timeLimit: gs.clueTime,
    phaseStartTime: gs.phaseStartTime
  };
}

function getGuesserView(room) {
  const gs = room.gameState;
  const spectrum = gs.spectrums[gs.currentRound];
  const giverId = gs.giverOrder[gs.currentRound];
  const giver = room.players.find(p => p.id === giverId);
  return {
    round: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    leftLabel: spectrum[0],
    rightLabel: spectrum[1],
    clue: gs.clue,
    clueGiverName: giver?.name || '?',
    phase: gs.phase,
    isClueGiver: false,
    timeLimit: gs.phase === 'clue' ? gs.clueTime : gs.guessTime,
    phaseStartTime: gs.phaseStartTime,
    hasGuessed: false // set per-player in server
  };
}

function submitClue(room, playerId, clue) {
  const gs = room.gameState;
  if (playerId !== gs.giverOrder[gs.currentRound]) return null;
  if (gs.phase !== 'clue') return null;
  if (typeof clue !== 'string' || clue.trim().length === 0 || clue.trim().length > 50) return null;

  gs.clue = clue.trim();
  gs.phase = 'guess';
  gs.phaseStartTime = Date.now();
  return { clue: gs.clue };
}

function submitGuess(room, playerId, guess) {
  const gs = room.gameState;
  if (gs.phase !== 'guess') return null;
  if (playerId === gs.giverOrder[gs.currentRound]) return null; // clue giver can't guess
  if (gs.guesses[playerId] !== undefined) return null; // already guessed

  const clampedGuess = Math.max(0, Math.min(100, Math.round(Number(guess))));
  if (isNaN(clampedGuess)) return null;

  gs.guesses[playerId] = clampedGuess;
  return { guessed: true };
}

function getRevealData(room) {
  const gs = room.gameState;
  const spectrum = gs.spectrums[gs.currentRound];
  const giverId = gs.giverOrder[gs.currentRound];
  const giver = room.players.find(p => p.id === giverId);

  // Calculate scores
  gs.roundScores = {};
  let giverBonus = 0;

  const guessResults = room.players.filter(p => !p.isSpectator && p.id !== giverId).map(p => {
    const guess = gs.guesses[p.id];
    let points = 0;
    let distance = 100;

    if (guess !== undefined) {
      distance = Math.abs(guess - gs.target);
      if (distance <= 5) points = BASE_POINTS;
      else if (distance <= 10) points = 400;
      else if (distance <= 15) points = 300;
      else if (distance <= 25) points = 150;
      else if (distance <= 35) points = 50;
      // else 0

      if (points > 0) giverBonus += CLUE_GIVER_BONUS;
    }

    gs.roundScores[p.id] = points;
    p.score += points;

    return {
      id: p.id,
      name: p.name,
      guess: guess !== undefined ? guess : null,
      distance,
      points,
      totalScore: p.score
    };
  });

  // Award clue giver bonus
  gs.roundScores[giverId] = giverBonus;
  if (giver) giver.score += giverBonus;

  guessResults.push({
    id: giverId,
    name: giver?.name || '?',
    guess: null,
    distance: null,
    points: giverBonus,
    totalScore: giver?.score || 0,
    isClueGiver: true
  });

  guessResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    round: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    leftLabel: spectrum[0],
    rightLabel: spectrum[1],
    target: gs.target,
    clue: gs.clue,
    clueGiverName: giver?.name || '?',
    players: guessResults,
    phase: 'reveal'
  };
}

function nextRound(room) {
  const gs = room.gameState;
  gs.currentRound++;
  if (gs.currentRound >= gs.totalRounds) return false;
  setupRound(room);
  return true;
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
    gameType: 'wavelength'
  };
}

module.exports = { init, getClueGiverView, getGuesserView, submitClue, submitGuess, getRevealData, nextRound, getResults };
