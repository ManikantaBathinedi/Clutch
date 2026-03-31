// ─── TYPING RACE SERVER LOGIC ───
const wordData = require('../data/typing-words.json');

const ROUND_TIME = 30; // seconds per round
const ROUNDS = 3;

function pickWords(difficulty, count) {
  let pool;
  if (difficulty === 'easy') pool = wordData.common;
  else if (difficulty === 'hard') pool = wordData.hard;
  else pool = wordData.medium;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickQuote() {
  // Combine quotes + all sentence categories for massive variety
  let allSentences = [...wordData.quotes];
  if (wordData.sentences) {
    Object.values(wordData.sentences).forEach(arr => {
      if (Array.isArray(arr)) allSentences = allSentences.concat(arr);
    });
  }
  return allSentences[Math.floor(Math.random() * allSentences.length)];
}

function generatePrompt(mode, difficulty) {
  if (mode === 'quote') {
    const quote = pickQuote();
    return { text: quote, words: quote.split(' ') };
  }
  // words mode — generate a string of random words
  const words = pickWords(difficulty, 25);
  return { text: words.join(' '), words };
}

function init(room, settings) {
  const rounds = (settings && settings.rounds) || ROUNDS;
  const timeLimit = (settings && settings.timeLimit) || ROUND_TIME;
  const mode = (settings && settings.mode) || 'words'; // 'words' or 'quote'
  const difficulty = (settings && settings.difficulty) || 'medium';

  const prompts = [];
  for (let i = 0; i < rounds; i++) {
    prompts.push(generatePrompt(mode, difficulty));
  }

  room.gameState = {
    prompts,
    currentRound: 0,
    roundStartTime: null,
    playerProgress: {},   // { playerId: { typed, wpm, accuracy, charsCorrect, charsTotal, finished, finishTime } }
    roundScores: {},
    timeLimit,
    mode,
    difficulty
  };

  // Reset player scores
  room.players.forEach(p => { if (!p.isSpectator) p.score = 0; });
}

function getCurrentPrompt(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.prompts.length) return null;

  const prompt = gs.prompts[gs.currentRound];
  gs.playerProgress = {};
  gs.roundScores = {};
  gs.roundStartTime = Date.now();

  // Init progress for all active players
  room.players.forEach(p => {
    if (!p.isSpectator) {
      gs.playerProgress[p.id] = {
        typed: '',
        wpm: 0,
        accuracy: 100,
        charsCorrect: 0,
        charsTotal: 0,
        wordsTyped: 0,
        finished: false,
        finishTime: null
      };
    }
  });

  return {
    roundNumber: gs.currentRound + 1,
    totalRounds: gs.prompts.length,
    text: prompt.text,
    wordCount: prompt.words.length,
    timeLimit: gs.timeLimit,
    players: room.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id,
      name: p.name,
      progress: 0,
      wpm: 0
    }))
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs) return null;

  const progress = gs.playerProgress[playerId];
  if (!progress) return null;

  const prompt = gs.prompts[gs.currentRound];
  const elapsed = (Date.now() - gs.roundStartTime) / 1000;

  if (elapsed > gs.timeLimit + 2) return null; // grace period

  // answer is the full typed text so far
  const typed = typeof answer === 'string' ? answer : '';
  const targetText = prompt.text;

  // Calculate accuracy: compare char by char
  let correct = 0;
  const len = Math.min(typed.length, targetText.length);
  for (let i = 0; i < len; i++) {
    if (typed[i] === targetText[i]) correct++;
  }

  const accuracy = typed.length > 0 ? Math.round((correct / typed.length) * 100) : 100;
  const wordsTyped = typed.trim().split(/\s+/).filter(w => w.length > 0).length;

  // WPM = (characters / 5) / minutes
  const minutes = Math.max(elapsed / 60, 0.01);
  const wpm = Math.round((correct / 5) / minutes);

  // Progress as percentage of target text
  const progressPct = Math.min(Math.round((typed.length / targetText.length) * 100), 100);

  // Check if finished (typed the full text correctly)
  const finished = typed.length >= targetText.length;

  progress.typed = typed;
  progress.wpm = wpm;
  progress.accuracy = accuracy;
  progress.charsCorrect = correct;
  progress.charsTotal = typed.length;
  progress.wordsTyped = wordsTyped;

  if (finished && !progress.finished) {
    progress.finished = true;
    progress.finishTime = elapsed;

    // Award points: base + speed bonus + accuracy bonus
    const speedBonus = Math.max(0, Math.round((gs.timeLimit - elapsed) * 10));
    const accuracyBonus = Math.round(accuracy * 2);
    const points = 100 + speedBonus + accuracyBonus;
    progress.points = points;
    gs.roundScores[playerId] = points;

    const player = room.players.find(p => p.id === playerId);
    if (player) player.score += points;
  }

  // Return progress update (broadcast to all)
  return {
    playerId,
    progress: progressPct,
    wpm,
    accuracy,
    wordsTyped,
    finished,
    finishTime: progress.finishTime
  };
}

function getRoundResults(room) {
  const gs = room.gameState;
  const prompt = gs.prompts[gs.currentRound];

  // Calculate final WPM/accuracy for players who didn't finish
  const elapsed = (Date.now() - gs.roundStartTime) / 1000;
  const minutes = Math.max(elapsed / 60, 0.01);

  Object.keys(gs.playerProgress).forEach(pid => {
    const prog = gs.playerProgress[pid];
    if (!prog.finished) {
      // Award partial points based on progress
      const points = Math.round((prog.charsCorrect / Math.max(prompt.text.length, 1)) * 100) + Math.round(prog.accuracy);
      gs.roundScores[pid] = points;
      prog.points = points;
      const player = room.players.find(p => p.id === pid);
      if (player) player.score += points;
    }
  });

  const playerResults = room.players.filter(p => !p.isSpectator).map(pl => {
    const prog = gs.playerProgress[pl.id] || {};
    return {
      id: pl.id,
      name: pl.name,
      wpm: prog.wpm || 0,
      accuracy: prog.accuracy || 0,
      wordsTyped: prog.wordsTyped || 0,
      finished: prog.finished || false,
      finishTime: prog.finishTime,
      roundPoints: gs.roundScores[pl.id] || 0,
      totalScore: pl.score
    };
  });

  playerResults.sort((a, b) => b.wpm - a.wpm);

  return {
    roundNumber: gs.currentRound + 1,
    totalRounds: gs.prompts.length,
    text: prompt.text,
    players: playerResults
  };
}

function nextRound(room) {
  room.gameState.currentRound++;
  return room.gameState.currentRound < room.gameState.prompts.length;
}

function getResults(room) {
  const sorted = [...room.players].filter(p => !p.isSpectator).sort((a, b) => b.score - a.score);

  // Calculate overall stats
  const gs = room.gameState;
  const stats = sorted.map(p => {
    const allWpm = [];
    const allAcc = [];
    // We don't store per-round history, use last known progress
    const prog = gs.playerProgress[p.id];
    if (prog) {
      allWpm.push(prog.wpm);
      allAcc.push(prog.accuracy);
    }
    return {
      avgWpm: allWpm.length ? Math.round(allWpm.reduce((a, b) => a + b, 0) / allWpm.length) : 0,
      avgAccuracy: allAcc.length ? Math.round(allAcc.reduce((a, b) => a + b, 0) / allAcc.length) : 0
    };
  });

  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score,
      avgWpm: stats[i].avgWpm,
      avgAccuracy: stats[i].avgAccuracy
    })),
    gameType: 'typingrace'
  };
}

module.exports = { init, getCurrentPrompt, handleAnswer, getRoundResults, nextRound, getResults };
