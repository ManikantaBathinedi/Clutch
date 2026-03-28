const DRAW_TIME = 80;
const CHOOSE_TIME = 15;
const MAX_GUESSER_POINTS = 500;
const MIN_GUESSER_POINTS = 50;

const WORDS = [
  'sun', 'cat', 'dog', 'tree', 'house', 'car', 'fish', 'bird', 'moon', 'star',
  'flower', 'heart', 'cloud', 'rain', 'snow', 'fire', 'boat', 'train', 'pizza',
  'cake', 'apple', 'banana', 'guitar', 'piano', 'clock', 'crown', 'robot',
  'rocket', 'spider', 'snake', 'dragon', 'castle', 'bridge', 'mountain',
  'rainbow', 'umbrella', 'airplane', 'bicycle', 'elephant', 'penguin',
  'snowman', 'butterfly', 'dinosaur', 'mermaid', 'volcano', 'tornado',
  'sandwich', 'balloon', 'camera', 'trophy',
  'beach', 'pirate', 'wizard', 'ninja', 'zombie', 'unicorn', 'lighthouse',
  'hammer', 'sword', 'shield', 'treasure', 'island', 'sunset', 'campfire',
  'ghost', 'vampire', 'werewolf', 'angel', 'devil', 'mushroom', 'cactus',
  'whale', 'octopus', 'dolphin', 'seahorse', 'jellyfish', 'lobster',
  'hamburger', 'hotdog', 'popcorn', 'donut', 'icecream', 'watermelon',
  'basketball', 'football', 'tennis', 'bowling', 'skateboard', 'surfing',
  'telescope', 'microscope', 'magnet', 'battery', 'lightbulb', 'computer',
  'headphones', 'microphone', 'television', 'keyboard', 'mouse', 'printer',
  'backpack', 'suitcase', 'envelope', 'scissors', 'candle', 'glasses'
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getDashedWord(gs) {
  return gs.currentWord.split('').map((ch, i) => {
    if (ch === ' ') return '  ';
    if (gs.revealedLetters.includes(i)) return ch;
    return '_';
  }).join(' ');
}

function init(room, settings) {
  const turnOrder = shuffle(room.players.map(p => p.id));

  room.gameState = {
    turnOrder,
    currentTurn: 0,
    drawerId: null,
    currentWord: null,
    wordChoices: null,
    answers: {},
    correctOrder: [],
    turnStartTime: null,
    roundScores: {},
    drawTime: (settings && settings.timeLimit) || DRAW_TIME,
    chooseTime: CHOOSE_TIME,
    revealedLetters: [],
    guessLog: [],
    allGuessedCorrect: false,
    phase: 'choosing', // 'choosing' | 'drawing'
    hintTimers: [],
    usedWords: []
  };
}

// Phase 1: Give drawer 3 word choices
function getWordChoices(room) {
  const gs = room.gameState;
  if (!gs || gs.currentTurn >= gs.turnOrder.length) return null;

  gs.drawerId = gs.turnOrder[gs.currentTurn];
  gs.phase = 'choosing';
  gs.answers = {};
  gs.correctOrder = [];
  gs.roundScores = {};
  gs.revealedLetters = [];
  gs.guessLog = [];
  gs.allGuessedCorrect = false;

  // Pick 3 unused words
  const available = WORDS.filter(w => !gs.usedWords.includes(w));
  const shuffled = shuffle(available.length >= 3 ? available : WORDS);
  gs.wordChoices = shuffled.slice(0, 3);

  const drawer = room.players.find(p => p.id === gs.drawerId);

  return {
    drawerId: gs.drawerId,
    drawerName: drawer ? drawer.name : 'Unknown',
    words: gs.wordChoices,
    turnNumber: gs.currentTurn + 1,
    totalTurns: gs.turnOrder.length,
    timeLimit: gs.chooseTime
  };
}

// Phase 2: Drawer picked a word, start the round
function chooseWord(room, playerId, wordIndex) {
  const gs = room.gameState;
  if (!gs || playerId !== gs.drawerId) return null;
  if (!gs.wordChoices || wordIndex < 0 || wordIndex >= gs.wordChoices.length) return null;

  gs.currentWord = gs.wordChoices[wordIndex];
  gs.usedWords.push(gs.currentWord);
  gs.wordChoices = null;
  gs.turnStartTime = Date.now();
  gs.phase = 'drawing';

  const drawer = room.players.find(p => p.id === gs.drawerId);

  return {
    turnNumber: gs.currentTurn + 1,
    totalTurns: gs.turnOrder.length,
    drawerId: gs.drawerId,
    drawerName: drawer ? drawer.name : 'Unknown',
    word: gs.currentWord,
    wordLength: gs.currentWord.length,
    dashedWord: getDashedWord(gs),
    timeLimit: gs.drawTime
  };
}

// Auto-choose first word if drawer didn't pick in time
function autoChooseWord(room) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'choosing' || !gs.wordChoices) return null;
  return chooseWord(room, gs.drawerId, 0);
}

// Reveal a letter hint
function revealLetter(room) {
  const gs = room.gameState;
  if (!gs || !gs.currentWord || gs.phase !== 'drawing') return null;

  const unrevealed = [];
  for (let i = 0; i < gs.currentWord.length; i++) {
    if (gs.currentWord[i] !== ' ' && !gs.revealedLetters.includes(i)) {
      unrevealed.push(i);
    }
  }

  if (unrevealed.length <= 1) return null;

  const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  gs.revealedLetters.push(idx);

  return { dashedWord: getDashedWord(gs) };
}

function handleGuess(room, playerId, guess) {
  const gs = room.gameState;
  if (!gs || playerId === gs.drawerId) return null;
  if (gs.answers[playerId]?.isCorrect) return null;
  if (gs.phase !== 'drawing') return null;

  const elapsed = (Date.now() - gs.turnStartTime) / 1000;
  if (elapsed > gs.drawTime + 1) return null;

  const player = room.players.find(p => p.id === playerId);
  const playerName = player ? player.name : 'Unknown';
  const normalizedGuess = guess.toLowerCase().trim();
  const normalizedWord = gs.currentWord.toLowerCase();

  const isCorrect = normalizedGuess === normalizedWord;
  const isClose = !isCorrect && levenshtein(normalizedGuess, normalizedWord) <= 2 && normalizedGuess.length >= 2;

  let points = 0;
  if (isCorrect) {
    // Guesser points: time-based — faster guess = more points
    const timeRatio = Math.max(0, 1 - (elapsed / gs.drawTime));
    points = Math.round(MIN_GUESSER_POINTS + (MAX_GUESSER_POINTS - MIN_GUESSER_POINTS) * timeRatio);
    gs.correctOrder.push(playerId);

    if (player) player.score += points;

    // Drawer gets points for each correct guesser (scales with how many guess it)
    const totalGuessers = room.players.filter(p => p.id !== gs.drawerId).length;
    const drawerPointsPerGuess = Math.round(MAX_GUESSER_POINTS / Math.max(totalGuessers, 1));
    const drawer = room.players.find(p => p.id === gs.drawerId);
    if (drawer) {
      drawer.score += drawerPointsPerGuess;
      gs.roundScores[gs.drawerId] = (gs.roundScores[gs.drawerId] || 0) + drawerPointsPerGuess;
    }

    // Check if all guessers got it right
    const guessers = room.players.filter(p => p.id !== gs.drawerId);
    if (gs.correctOrder.length >= guessers.length) {
      gs.allGuessedCorrect = true;
    }
  }

  gs.answers[playerId] = { guess, isCorrect, points };
  if (points > 0) gs.roundScores[playerId] = points;

  // Chat message entry
  const chatEntry = {
    playerId,
    playerName,
    message: isCorrect ? `${playerName} guessed the word!` : guess,
    isCorrect,
    isClose,
    isSystem: isCorrect
  };

  gs.guessLog.push(chatEntry);

  return {
    isCorrect,
    isClose,
    points,
    playerName,
    chatEntry,
    allGuessedCorrect: gs.allGuessedCorrect
  };
}

function getRoundResults(room) {
  const gs = room.gameState;

  const playerResults = room.players.map(p => ({
    id: p.id,
    name: p.name,
    totalScore: p.score,
    roundPoints: gs.roundScores[p.id] || 0,
    answered: gs.answers[p.id] !== undefined,
    isCorrect: gs.answers[p.id]?.isCorrect || false,
    isDrawer: p.id === gs.drawerId
  }));

  playerResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    word: gs.currentWord,
    turnNumber: gs.currentTurn + 1,
    totalTurns: gs.turnOrder.length,
    players: playerResults
  };
}

function nextRound(room) {
  room.gameState.currentTurn++;
  return room.gameState.currentTurn < room.gameState.turnOrder.length;
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

module.exports = { init, getWordChoices, chooseWord, autoChooseWord, revealLetter, handleGuess, getRoundResults, nextRound, getResults };
