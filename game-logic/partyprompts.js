// ─── PILOCO SERVER LOGIC ───
const promptData = require('../data/partyprompts.json');

const ROUND_TIME = 10;

function init(room, settings) {
  const rounds = (settings && settings.rounds) || 15;
  const players = room.players.filter(p => !p.isSpectator);
  const playerNames = players.map(p => p.name);

  // Build a shuffled prompt list from all categories
  const allPrompts = [];

  promptData.everyone.forEach(p => allPrompts.push({ type: 'everyone', text: p }));

  promptData.targeted.forEach(p => {
    const name = playerNames[Math.floor(Math.random() * playerNames.length)];
    allPrompts.push({ type: 'targeted', text: p.replace('{player}', name) });
  });

  promptData.challenges.forEach(p => {
    const name = playerNames[Math.floor(Math.random() * playerNames.length)];
    allPrompts.push({ type: 'challenge', text: p.replace('{player}', name) });
  });

  if (playerNames.length >= 2) {
    promptData.versus.forEach(p => {
      const shuffled = [...playerNames].sort(() => Math.random() - 0.5);
      allPrompts.push({
        type: 'versus',
        text: p.replace('{player1}', shuffled[0]).replace('{player2}', shuffled[1])
      });
    });
  }

  promptData.rules.forEach(p => allPrompts.push({ type: 'rule', text: p }));

  // Shuffle and pick
  const shuffled = allPrompts.sort(() => Math.random() - 0.5).slice(0, rounds);

  room.gameState = {
    prompts: shuffled,
    currentRound: 0,
    totalRounds: shuffled.length,
    roundTime: (settings && settings.timeLimit) || ROUND_TIME,
    acknowledged: {}
  };
}

function getCurrentPrompt(room) {
  const gs = room.gameState;
  if (!gs || gs.currentRound >= gs.totalRounds) return null;

  gs.acknowledged = {};

  const prompt = gs.prompts[gs.currentRound];
  return {
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds,
    prompt: prompt.text,
    type: prompt.type,
    timeLimit: gs.roundTime
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.acknowledged[playerId]) return null;
  gs.acknowledged[playerId] = true;
  return { voted: true };
}

function getRoundResults(room) {
  const gs = room.gameState;
  return {
    prompt: gs.prompts[gs.currentRound].text,
    type: gs.prompts[gs.currentRound].type,
    questionNumber: gs.currentRound + 1,
    totalQuestions: gs.totalRounds
  };
}

function nextRound(room) {
  room.gameState.currentRound++;
  return room.gameState.currentRound < room.gameState.totalRounds;
}

function getResults(room) {
  return {
    players: room.players.filter(p => !p.isSpectator).map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: 0,
      isHost: p.isHost
    })),
    gameType: 'partyprompts'
  };
}

module.exports = { init, getCurrentQuestion: getCurrentPrompt, handleAnswer, getRoundResults, nextRound, getResults };
