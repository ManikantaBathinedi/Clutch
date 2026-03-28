// ─── JUST ONE SERVER LOGIC ───
// Co-op word guessing: everyone writes a clue, duplicates removed, guesser tries to guess.

const WORDS = [
  'Volcano', 'Penguin', 'Guitar', 'Diamond', 'Telescope', 'Pirate', 'Tornado',
  'Chocolate', 'Unicorn', 'Submarine', 'Lightning', 'Pyramid', 'Dinosaur',
  'Waterfall', 'Robot', 'Cactus', 'Astronaut', 'Octopus', 'Rainbow', 'Castle',
  'Treasure', 'Butterfly', 'Dragon', 'Magnet', 'Popcorn', 'Glacier', 'Fireworks',
  'Skeleton', 'Compass', 'Avalanche', 'Jellyfish', 'Phantom', 'Satellite',
  'Bamboo', 'Eclipse', 'Carnival', 'Fossil', 'Labyrinth', 'Typewriter',
  'Parachute', 'Snowflake', 'Chameleon', 'Anchor', 'Blueprint', 'Gondola',
  'Kaleidoscope', 'Marathon', 'Origami', 'Trampoline', 'Whistle', 'Zodiac',
  'Igloo', 'Lantern', 'Oasis', 'Sandstorm', 'Mosaic', 'Harmonica',
  'Bonsai', 'Mirage', 'Hologram', 'Catapult', 'Safari', 'Constellation',
  'Quicksand', 'Blizzard', 'Metronome', 'Sphinx', 'Archipelago', 'Pendulum',
  'Silhouette', 'Trapeze', 'Mermaid', 'Thunder', 'Labyrinth', 'Kaleidoscope'
];

const CLUE_TIME = 30;
const GUESS_TIME = 30;
const POINTS_CORRECT = 300;

function init(room, settings) {
  const rounds = (settings && settings.rounds) || 8;
  const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
  const guesserOrder = [];
  for (let i = 0; i < rounds; i++) {
    guesserOrder.push(playerIds[i % playerIds.length]);
  }

  const shuffledWords = [...WORDS].sort(() => Math.random() - 0.5).slice(0, rounds);

  room.gameState = {
    words: shuffledWords,
    currentRound: 0,
    totalRounds: rounds,
    guesserOrder,
    clues: {},         // { playerId: clueText }
    filteredClues: [],
    guess: null,
    phase: 'clue',     // clue, review, guess, reveal
    phaseStartTime: null,
    clueTime: CLUE_TIME,
    guessTime: GUESS_TIME,
    teamScore: 0,
    roundResults: []
  };
  setupRound(room);
}

function setupRound(room) {
  const gs = room.gameState;
  gs.clues = {};
  gs.filteredClues = [];
  gs.guess = null;
  gs.phase = 'clue';
  gs.phaseStartTime = Date.now();
}

function getGuesserView(room) {
  const gs = room.gameState;
  const guesserId = gs.guesserOrder[gs.currentRound];
  const guesser = room.players.find(p => p.id === guesserId);
  return {
    round: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    guesserId,
    guesserName: guesser?.name || '?',
    phase: gs.phase,
    phaseStartTime: gs.phaseStartTime,
    clueTime: gs.clueTime,
    guessTime: gs.guessTime,
    teamScore: gs.teamScore,
    // Guesser sees clues only in guess phase
    clues: gs.phase === 'guess' ? gs.filteredClues : [],
    totalClues: Object.keys(gs.clues).length,
    totalClueGivers: room.players.filter(p => !p.isSpectator && p.id !== guesserId).length
  };
}

function getClueGiverView(room, playerId) {
  const gs = room.gameState;
  const guesserId = gs.guesserOrder[gs.currentRound];
  const guesser = room.players.find(p => p.id === guesserId);
  return {
    round: gs.currentRound + 1,
    totalRounds: gs.totalRounds,
    word: gs.words[gs.currentRound],
    guesserId,
    guesserName: guesser?.name || '?',
    phase: gs.phase,
    phaseStartTime: gs.phaseStartTime,
    clueTime: gs.clueTime,
    guessTime: gs.guessTime,
    teamScore: gs.teamScore,
    hasSubmitted: gs.clues[playerId] !== undefined,
    totalClues: Object.keys(gs.clues).length,
    totalClueGivers: room.players.filter(p => !p.isSpectator && p.id !== guesserId).length,
    // In review phase, show all clues with dupes marked
    allClues: gs.phase === 'review' ? getCluesWithDupes(room) : [],
    filteredClues: gs.phase === 'guess' || gs.phase === 'reveal' ? gs.filteredClues : []
  };
}

function submitClue(room, playerId, clue) {
  const gs = room.gameState;
  if (gs.phase !== 'clue') return null;
  if (playerId === gs.guesserOrder[gs.currentRound]) return null;
  if (gs.clues[playerId] !== undefined) return null;
  if (typeof clue !== 'string' || clue.trim().length === 0 || clue.trim().length > 30) return null;

  // Validate: single word (no spaces)
  const cleaned = clue.trim().replace(/\s+/g, '');
  gs.clues[playerId] = cleaned;

  return { submitted: true };
}

function getCluesWithDupes(room) {
  const gs = room.gameState;
  const cluePairs = Object.entries(gs.clues);
  const normalized = cluePairs.map(([id, c]) => [id, c.toLowerCase()]);
  return cluePairs.map(([id, clue]) => {
    const norm = clue.toLowerCase();
    const isDuplicate = normalized.filter(([, c]) => c === norm).length > 1;
    const player = room.players.find(p => p.id === id);
    return { playerId: id, playerName: player?.name || '?', clue, isDuplicate };
  });
}

function filterClues(room) {
  const gs = room.gameState;
  const cluesWithDupes = getCluesWithDupes(room);
  gs.filteredClues = cluesWithDupes.filter(c => !c.isDuplicate).map(c => c.clue);
  gs.phase = 'guess';
  gs.phaseStartTime = Date.now();
  return gs.filteredClues;
}

function submitGuess(room, playerId, guess) {
  const gs = room.gameState;
  if (gs.phase !== 'guess') return null;
  if (playerId !== gs.guesserOrder[gs.currentRound]) return null;
  if (typeof guess !== 'string' || guess.trim().length === 0) return null;

  const word = gs.words[gs.currentRound];
  const correct = guess.trim().toLowerCase() === word.toLowerCase();

  gs.guess = { text: guess.trim(), correct };
  gs.phase = 'reveal';

  if (correct) {
    gs.teamScore += POINTS_CORRECT;
    // Give points to all non-spectators
    room.players.forEach(p => {
      if (!p.isSpectator) p.score += POINTS_CORRECT;
    });
  }

  gs.roundResults.push({
    round: gs.currentRound + 1,
    word,
    clues: gs.filteredClues,
    guess: guess.trim(),
    correct
  });

  return {
    word,
    guess: guess.trim(),
    correct,
    teamScore: gs.teamScore
  };
}

function skipGuess(room) {
  const gs = room.gameState;
  if (gs.phase !== 'guess') return null;
  const word = gs.words[gs.currentRound];
  gs.guess = { text: '(skipped)', correct: false };
  gs.phase = 'reveal';
  gs.roundResults.push({ round: gs.currentRound + 1, word, clues: gs.filteredClues, guess: '(skipped)', correct: false });
  return { word, guess: '(skipped)', correct: false, teamScore: gs.teamScore };
}

function nextRound(room) {
  const gs = room.gameState;
  gs.currentRound++;
  if (gs.currentRound >= gs.totalRounds) return false;
  setupRound(room);
  return true;
}

function getResults(room) {
  const gs = room.gameState;
  const sorted = [...room.players].filter(p => !p.isSpectator).sort((a, b) => b.score - a.score);
  const correctCount = gs.roundResults.filter(r => r.correct).length;
  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score,
      isHost: p.isHost
    })),
    teamScore: gs.teamScore,
    correctCount,
    totalRounds: gs.totalRounds,
    roundResults: gs.roundResults,
    gameType: 'justone'
  };
}

module.exports = { init, getGuesserView, getClueGiverView, submitClue, filterClues, submitGuess, skipGuess, nextRound, getResults };
