// ─── IMPOSTER SERVER LOGIC ───
// One player is the imposter and only gets a vague clue.
// Others get the actual word and must describe it each round.
// Players vote to find the imposter. Imposter can try to guess the word.

const WORDS = require('../data/imposter-words.json');

const POINTS_VILLAGERS_WIN = 200;
const POINTS_IMPOSTER_SURVIVES = 300;
const POINTS_IMPOSTER_GUESSES_WORD = 500;
const DESCRIBE_TIME = 30; // seconds per player to describe

function getCategories() {
  return Object.keys(WORDS).map(c => c.toLowerCase());
}

function init(room, settings) {
  const rounds = (settings && settings.rounds) || 3;
  const votingRounds = (settings && settings.votingRounds) || 2;
  const selectedCategory = (settings && settings.category) || 'all';
  room.gameState = {
    currentRound: 0,
    totalRounds: rounds,
    votingRoundsPerWord: votingRounds,
    currentVotingRound: 0,
    word: null,
    clue: null,
    category: null,
    imposterId: null,
    descriptions: {},       // playerId -> string (current voting round only)
    allDescriptions: [],    // all descriptions across voting rounds
    descriptionOrder: [],   // order players describe
    currentDescriberIndex: 0,
    votes: {},
    voteInProgress: false,
    phase: 'describing',    // describing, voting, vote-reveal, imposter-guess, reveal
    roundOver: false,
    voteResults: null,
    imposterGuess: null,
    describeTime: DESCRIBE_TIME,
    selectedCategory: selectedCategory
  };
  setupRound(room);
}

function setupRound(room) {
  const gs = room.gameState;
  gs.currentRound++;
  gs.currentVotingRound = 0;

  // Pick category based on selection
  const allCategories = Object.keys(WORDS);
  let category;
  if (gs.selectedCategory && gs.selectedCategory !== 'all') {
    category = allCategories.find(c => c.toLowerCase() === gs.selectedCategory.toLowerCase()) || allCategories[Math.floor(Math.random() * allCategories.length)];
  } else {
    category = allCategories[Math.floor(Math.random() * allCategories.length)];
  }
  const wordList = WORDS[category];
  const entry = wordList[Math.floor(Math.random() * wordList.length)];

  gs.word = entry.word;
  gs.clue = entry.clue;
  gs.category = category;

  // Pick a random imposter
  const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
  gs.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];

  // Start first voting round
  gs.allDescriptions = [];
  gs.voteResults = null;
  gs.imposterGuess = null;
  gs.roundOver = false;
  startVotingRound(room);
}

function startVotingRound(room) {
  const gs = room.gameState;
  gs.currentVotingRound++;

  const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
  gs.descriptionOrder = [...playerIds].sort(() => Math.random() - 0.5);
  gs.currentDescriberIndex = 0;
  gs.descriptions = {};
  gs.votes = {};
  gs.voteInProgress = false;
  gs.phase = 'describing';
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const isImposter = playerId === gs.imposterId;
  const currentDescriber = gs.descriptionOrder[gs.currentDescriberIndex];

  // Build descriptions list (only show descriptions that have been submitted)
  const descList = [];
  for (let i = 0; i < gs.descriptionOrder.length; i++) {
    const pid = gs.descriptionOrder[i];
    if (gs.descriptions[pid] !== undefined) {
      const player = room.players.find(p => p.id === pid);
      descList.push({
        id: pid,
        name: player ? player.name : '?',
        avatar: player ? player.avatar : '😎',
        description: gs.descriptions[pid]
      });
    }
  }

  return {
    round: gs.currentRound,
    totalRounds: gs.totalRounds,
    votingRound: gs.currentVotingRound,
    totalVotingRounds: gs.votingRoundsPerWord,
    word: isImposter ? null : gs.word,
    clue: gs.clue,
    category: gs.category,
    isImposter,
    phase: gs.phase,
    currentDescriberId: currentDescriber,
    currentDescriberName: room.players.find(p => p.id === currentDescriber)?.name || '?',
    isMyTurn: playerId === currentDescriber && gs.phase === 'describing',
    descriptions: descList,
    allDescriptions: gs.allDescriptions || [],
    players: room.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar
    })),
    voteInProgress: gs.voteInProgress,
    votes: gs.voteInProgress ? Object.keys(gs.votes).length : 0,
    totalVoters: room.players.filter(p => !p.isSpectator).length,
    hasDescribed: !!gs.descriptions[playerId],
    allDescribed: Object.keys(gs.descriptions).length >= gs.descriptionOrder.length,
    roundOver: gs.roundOver,
    voteResults: gs.voteResults,
    imposterGuess: gs.imposterGuess,
    describeTime: gs.describeTime
  };
}

function submitDescription(room, playerId, description) {
  const gs = room.gameState;
  if (gs.phase !== 'describing' || gs.roundOver) return null;

  const currentDescriber = gs.descriptionOrder[gs.currentDescriberIndex];
  if (playerId !== currentDescriber) return null;
  if (gs.descriptions[playerId] !== undefined) return null;

  // Sanitize description
  const desc = (typeof description === 'string') ? description.trim().substring(0, 100) : '';
  if (!desc) return null;

  gs.descriptions[playerId] = desc;
  
  // Also add to allDescriptions for history
  const player = room.players.find(p => p.id === playerId);
  gs.allDescriptions.push({
    id: playerId,
    name: player ? player.name : '?',
    avatar: player ? player.avatar : '😎',
    description: desc,
    votingRound: gs.currentVotingRound
  });
  
  gs.currentDescriberIndex++;

  // Check if all players have described
  if (gs.currentDescriberIndex >= gs.descriptionOrder.length) {
    gs.phase = 'voting';
    gs.voteInProgress = true;
  }

  return { advanced: true, allDone: gs.phase === 'voting' };
}

function skipDescription(room) {
  const gs = room.gameState;
  if (gs.phase !== 'describing' || gs.roundOver) return null;

  const currentDescriber = gs.descriptionOrder[gs.currentDescriberIndex];
  gs.descriptions[currentDescriber] = '(skipped)';
  gs.currentDescriberIndex++;

  if (gs.currentDescriberIndex >= gs.descriptionOrder.length) {
    gs.phase = 'voting';
    gs.voteInProgress = true;
  }

  return { advanced: true, allDone: gs.phase === 'voting' };
}

function castVote(room, playerId, targetId) {
  const gs = room.gameState;
  if (gs.phase !== 'voting' || !gs.voteInProgress) return null;
  if (gs.votes[playerId] !== undefined) return null;
  const player = room.players.find(p => p.id === playerId && !p.isSpectator);
  if (!player) return null;

  // Allow skip votes
  if (targetId === '__skip__') {
    gs.votes[playerId] = '__skip__';
  } else {
    const target = room.players.find(p => p.id === targetId && !p.isSpectator);
    if (!target) return null;
    gs.votes[playerId] = targetId;
  }

  const activePlayers = room.players.filter(p => !p.isSpectator);
  const totalVotes = Object.keys(gs.votes).length;
  if (totalVotes < activePlayers.length) {
    return { waiting: true, votesIn: totalVotes, total: activePlayers.length };
  }

  // All votes in — tally (skip votes don't count toward any player)
  const tally = {};
  let skipCount = 0;
  Object.values(gs.votes).forEach(tid => {
    if (tid === '__skip__') {
      skipCount++;
    } else {
      tally[tid] = (tally[tid] || 0) + 1;
    }
  });

  const totalVoters = activePlayers.length;
  const majorityThreshold = Math.floor(totalVoters / 2) + 1; // >50%

  // Check if skip votes are majority
  const skippedRound = skipCount >= majorityThreshold;

  // Find max voted
  let maxVotes = 0;
  let maxId = null;
  let tie = false;
  Object.entries(tally).forEach(([tid, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      maxId = tid;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  // No majority: if skipped, all-skip, tie, or top vote didn't reach >50%
  const noMajority = skippedRound || maxVotes === 0 || tie || maxVotes < majorityThreshold;

  gs.voteInProgress = false;
  const votedPlayer = room.players.find(p => p.id === maxId);

  const result = {
    resolved: true,
    tally,
    skipCount,
    votedOutId: noMajority ? null : maxId,
    votedOutName: noMajority ? null : (votedPlayer ? votedPlayer.name : '?'),
    tie: tie || noMajority,
    skippedRound
  };

  if (noMajority) {
    // No majority or skipped — check if more voting rounds remain
    result.imposterSurvives = true;
    result.imposterName = room.players.find(p => p.id === gs.imposterId)?.name;
    result.imposterId = gs.imposterId;

    if (gs.currentVotingRound < gs.votingRoundsPerWord) {
      // More voting rounds left — show vote-reveal, then start next describe+vote cycle
      result.moreRounds = true;
      result.votingRoundsLeft = gs.votingRoundsPerWord - gs.currentVotingRound;
      gs.phase = 'vote-reveal';
      gs.voteResults = result;
      return { resolved: true, result };
    } else {
      // All voting rounds exhausted — imposter survives, round over
      result.word = gs.word;
      const imposterPlayer = room.players.find(p => p.id === gs.imposterId);
      if (imposterPlayer) imposterPlayer.score += POINTS_IMPOSTER_SURVIVES;
      gs.roundOver = true;
      gs.phase = 'reveal';
    }
  } else if (maxId === gs.imposterId) {
    // Caught the imposter! But imposter gets a chance to guess the word
    // Note: imposter is NOT ejected — they still play next rounds
    result.caughtImposter = true;
    result.imposterName = votedPlayer ? votedPlayer.name : '?';
    result.imposterId = gs.imposterId;
    // Don't end round yet — imposter gets to guess
    gs.phase = 'imposter-guess';
    gs.voteResults = result;
    return { resolved: true, imposterCaught: true, awaitingGuess: true, result };
  } else {
    // Wrong person — imposter wins points but NO one is ejected
    result.imposterWins = true;
    result.wrongTarget = true;
    result.imposterName = room.players.find(p => p.id === gs.imposterId)?.name;
    result.imposterId = gs.imposterId;

    if (gs.currentVotingRound < gs.votingRoundsPerWord) {
      // More voting rounds left — show result, then next cycle
      result.moreRounds = true;
      result.votingRoundsLeft = gs.votingRoundsPerWord - gs.currentVotingRound;
      gs.phase = 'vote-reveal';
      gs.voteResults = result;
      return { resolved: true, result };
    } else {
      // All voting rounds exhausted
      result.word = gs.word;
      const imposterPlayer = room.players.find(p => p.id === gs.imposterId);
      if (imposterPlayer) imposterPlayer.score += POINTS_IMPOSTER_SURVIVES;
      gs.roundOver = true;
      gs.phase = 'reveal';
    }
  }

  gs.voteResults = result;
  return { resolved: true, result };
}

function imposterGuessWord(room, playerId, guess) {
  const gs = room.gameState;
  if (gs.phase !== 'imposter-guess' || playerId !== gs.imposterId) return null;

  const normalizedGuess = guess.trim().toLowerCase();
  const normalizedWord = gs.word.toLowerCase();
  const correct = normalizedGuess === normalizedWord;

  const result = {
    imposterId: gs.imposterId,
    imposterName: room.players.find(p => p.id === gs.imposterId)?.name,
    guess: guess.trim(),
    word: gs.word,
    correct
  };

  if (correct) {
    // Imposter guessed the word — imposter wins big
    const imposterPlayer = room.players.find(p => p.id === gs.imposterId);
    if (imposterPlayer) imposterPlayer.score += POINTS_IMPOSTER_GUESSES_WORD;
  } else {
    // Imposter failed to guess — villagers win
    room.players.forEach(p => {
      if (!p.isSpectator && p.id !== gs.imposterId) {
        p.score += POINTS_VILLAGERS_WIN;
      }
    });
  }

  gs.imposterGuess = result;
  gs.roundOver = true;
  gs.phase = 'reveal';
  gs.voteResults = gs.voteResults || {};
  gs.voteResults.word = gs.word;
  return result;
}

function continueVotingRound(room) {
  const gs = room.gameState;
  if (gs.phase !== 'vote-reveal') return false;
  startVotingRound(room);
  return true;
}

function nextRound(room) {
  const gs = room.gameState;
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
    gameType: 'imposter'
  };
}

module.exports = { init, getCategories, getPlayerView, submitDescription, skipDescription, castVote, imposterGuessWord, continueVotingRound, nextRound, getResults };
