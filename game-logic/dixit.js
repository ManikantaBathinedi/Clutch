// ─── DIXIT SERVER LOGIC ───
// Creative storytelling game: storyteller gives a clue for their card,
// others play cards to deceive, everyone votes. 3-8 players.
// Uses emoji-art "cards" instead of physical artwork.

const CARD_POOL = [
  '🌅🏔️🦅', '🌊🐋🌙', '🔥🦁👑', '❄️🏰✨', '🌺🦋🌈', '🎭🎪🃏', '🌍🚀🌟',
  '🍎🐍🌳', '🎵🦜🌴', '💎👁️🗝️', '🌸🐉🏯', '⚡🦊🌲', '🎨🖌️🌻', '🌙🐺🏚️',
  '🧊🐧❄️', '🌋🦎🔴', '🎪🤡🎈', '🏴‍☠️💀⚓', '🧙‍♂️📚✨', '🦄🌈💫', '🎃👻🕯️',
  '🌿🍄🐛', '🏛️🗡️⚔️', '🎸🤘🔊', '🍰🎂🎉', '🚂💨🏔️', '🌑🔭⭐', '🐙🌊🏝️',
  '🦅🏜️🌵', '🎩🐰🪄', '🌪️🏠👠', '💝🏹🎯', '🧪🧬🔬', '🎮👾🕹️', '📖🕯️🌙',
  '🐺🌕🪵', '🎻🌹💃', '🏆🥊💪', '🌊🧜‍♀️💎', '🦉🌙📜', '🎲🃏♠️', '🌸🗻🎐',
  '🐘🌍🌅', '🎬🎥⭐', '🔮🌀💜', '🚀👽🌌', '🏰🐉⚔️', '🎼🎹🌙', '🦁🌿👑',
  '🌊⛵🗺️', '🎭🖤🌹', '🦢💎👸', '🌲🏕️🔥', '🐝🌻☀️', '🎯🏹🛡️', '🌙🦇🏰',
  '🎪🎠🎡', '🌺🦩💕', '🗻❄️🏔️', '🦊🍂🍁', '🎨🌅🖼️', '🔱🌊👑', '🌸🎋🏮',
  '🦋💐🌈', '🐉🔥💎', '🏺🗝️🌙', '🎻🍷🕯️', '🦚🏛️💫', '🌍🌱🕊️', '🎸🌃🌟',
  '🐋🌊🎶', '🦅⛰️☁️', '🎭🎶🌹', '🧙‍♀️🌙⭐', '🏰💍👰', '🐺❄️🌲', '🎪🔮✨',
  '🌋💎🦎', '🦉📚🕯️', '🎹🌧️💙', '🏴‍☠️🏝️💰', '🌸🐈🏡', '🎠🎡🎢', '🦊🌙🍄',
  '🐙💜🌊', '🎬🎩✨', '🌲🐻🍯', '🦢❄️✨', '🎯🗡️⚡', '🌻☀️🐝', '🐉🏔️🌋',
  '🎭💀🌹', '🦋🌺🌴', '🔭🌌🛸', '🏛️📜⚖️', '🎵🌙🦜', '🌊🐚🏖️', '🦁🌅🏜️'
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function init(room, settings) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const numPlayers = Math.min(activePlayers.length, 8);
  if (numPlayers < 3) return;

  const targetScore = (settings && settings.targetScore) || 30;
  const cards = shuffle([...CARD_POOL]);
  const handSize = 6;
  const playerOrder = activePlayers.slice(0, numPlayers).map(p => p.id);
  const hands = {};
  const scores = {};
  const names = {};
  const avatars = {};

  for (const p of activePlayers.slice(0, numPlayers)) {
    hands[p.id] = cards.splice(0, handSize);
    scores[p.id] = 0;
    names[p.id] = p.name;
    avatars[p.id] = p.avatar || '🎨';
  }

  room.gameState = {
    deck: cards,
    hands,
    scores,
    names,
    avatars,
    playerOrder,
    storytellerIndex: 0,
    phase: 'storytelling', // storytelling, playing, voting, scoring, finished
    clue: null,
    storytellerCard: null,
    playedCards: [], // { playerId, card }
    votes: {}, // playerId -> index they voted for
    targetScore,
    round: 1,
    lastRoundScoring: null
  };
}

function submitClue(room, playerId, clue, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'storytelling') return null;
  if (gs.playerOrder[gs.storytellerIndex] !== playerId) return null;

  const hand = gs.hands[playerId];
  if (cardIndex < 0 || cardIndex >= hand.length) return null;
  if (!clue || typeof clue !== 'string' || clue.trim().length === 0) return null;

  gs.clue = clue.trim().substring(0, 100);
  gs.storytellerCard = hand.splice(cardIndex, 1)[0];
  gs.playedCards = [{ playerId, card: gs.storytellerCard }];
  gs.phase = 'playing';
  return { success: true };
}

function playCard(room, playerId, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;
  if (gs.playerOrder[gs.storytellerIndex] === playerId) return null; // storyteller already played

  // Already played?
  if (gs.playedCards.some(pc => pc.playerId === playerId)) return null;

  const hand = gs.hands[playerId];
  if (cardIndex < 0 || cardIndex >= hand.length) return null;

  const card = hand.splice(cardIndex, 1)[0];
  gs.playedCards.push({ playerId, card });

  // Check if all non-storyteller players have played
  const nonStorytellers = gs.playerOrder.filter(id => id !== gs.playerOrder[gs.storytellerIndex]);
  const allPlayed = nonStorytellers.every(id => gs.playedCards.some(pc => pc.playerId === id));

  if (allPlayed) {
    // Shuffle played cards for voting
    gs.playedCards = shuffle(gs.playedCards);
    gs.phase = 'voting';
  }

  return { success: true, allPlayed };
}

function vote(room, playerId, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'voting') return null;
  if (gs.playerOrder[gs.storytellerIndex] === playerId) return null; // storyteller can't vote
  if (gs.votes[playerId] !== undefined) return null; // already voted

  if (cardIndex < 0 || cardIndex >= gs.playedCards.length) return null;
  // Can't vote for own card
  if (gs.playedCards[cardIndex].playerId === playerId) return null;

  gs.votes[playerId] = cardIndex;

  // Check if all non-storyteller players have voted
  const nonStorytellers = gs.playerOrder.filter(id => id !== gs.playerOrder[gs.storytellerIndex]);
  const allVoted = nonStorytellers.every(id => gs.votes[id] !== undefined);

  if (allVoted) {
    calculateScoring(room);
    if (gs.phase !== 'finished') {
      gs.phase = 'scoring';
    }
  }

  return { success: true, allVoted };
}

function calculateScoring(room) {
  const gs = room.gameState;
  const storytellerId = gs.playerOrder[gs.storytellerIndex];
  const storytellerIdx = gs.playedCards.findIndex(pc => pc.playerId === storytellerId);
  const nonStorytellers = gs.playerOrder.filter(id => id !== storytellerId);

  // Count votes for storyteller's card
  const votesForStoryteller = nonStorytellers.filter(id => gs.votes[id] === storytellerIdx).length;

  const scoring = { storytellerId, votesForStoryteller, playerScores: {} };

  if (votesForStoryteller === 0 || votesForStoryteller === nonStorytellers.length) {
    // All or none guessed: storyteller gets 0, everyone else gets 2
    scoring.allOrNone = true;
    for (const id of nonStorytellers) {
      gs.scores[id] += 2;
      scoring.playerScores[id] = 2;
    }
    scoring.playerScores[storytellerId] = 0;
  } else {
    // Normal: storyteller gets 3, correct voters get 3
    gs.scores[storytellerId] += 3;
    scoring.playerScores[storytellerId] = 3;
    for (const id of nonStorytellers) {
      if (gs.votes[id] === storytellerIdx) {
        gs.scores[id] += 3;
        scoring.playerScores[id] = (scoring.playerScores[id] || 0) + 3;
      }
    }
  }

  // Bonus: each player gets 1 point per vote their card received (except storyteller)
  for (const id of nonStorytellers) {
    const myIdx = gs.playedCards.findIndex(pc => pc.playerId === id);
    const votesForMe = Object.values(gs.votes).filter(v => v === myIdx).length;
    if (votesForMe > 0) {
      gs.scores[id] += votesForMe;
      scoring.playerScores[id] = (scoring.playerScores[id] || 0) + votesForMe;
    }
  }

  gs.lastRoundScoring = scoring;

  // Update room player scores
  for (const id of gs.playerOrder) {
    const player = room?.players?.find(p => p.id === id);
    if (player) player.score = gs.scores[id];
  }

  // Check win
  for (const id of gs.playerOrder) {
    if (gs.scores[id] >= gs.targetScore) {
      gs.phase = 'finished';
      gs.winner = id;
      break;
    }
  }
}

function nextRound(room) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'scoring') return false;

  // Deal new cards
  for (const id of gs.playerOrder) {
    while (gs.hands[id].length < 6 && gs.deck.length > 0) {
      gs.hands[id].push(gs.deck.pop());
    }
    // If deck is empty, reshuffle used cards
    if (gs.hands[id].length < 6) {
      // Create new cards from pool, excluding cards in hands
      const inUse = new Set(gs.playerOrder.flatMap(pid => gs.hands[pid]));
      const fresh = CARD_POOL.filter(c => !inUse.has(c));
      gs.deck = shuffle(fresh);
      while (gs.hands[id].length < 6 && gs.deck.length > 0) {
        gs.hands[id].push(gs.deck.pop());
      }
    }
  }

  gs.storytellerIndex = (gs.storytellerIndex + 1) % gs.playerOrder.length;
  gs.clue = null;
  gs.storytellerCard = null;
  gs.playedCards = [];
  gs.votes = {};
  gs.phase = 'storytelling';
  gs.round++;
  gs.lastRoundScoring = null;

  return true;
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const storytellerId = gs.playerOrder[gs.storytellerIndex];
  const isStoryteller = playerId === storytellerId;

  return {
    phase: gs.phase,
    round: gs.round,
    clue: gs.clue,
    isStoryteller,
    storytellerName: gs.names[storytellerId],
    myHand: gs.hands[playerId] || [],
    // During voting, show shuffled cards (but hide who played what)
    playedCards: gs.phase === 'voting' || gs.phase === 'scoring'
      ? gs.playedCards.map((pc, i) => ({
          card: pc.card,
          index: i,
          // Only reveal owner during scoring
          playerId: gs.phase === 'scoring' ? pc.playerId : undefined,
          playerName: gs.phase === 'scoring' ? gs.names[pc.playerId] : undefined,
          isStorytellers: gs.phase === 'scoring' ? pc.playerId === storytellerId : undefined,
          votes: gs.phase === 'scoring'
            ? gs.playerOrder.filter(id => gs.votes[id] === i).map(id => gs.names[id])
            : undefined
        }))
      : [],
    hasPlayed: gs.playedCards.some(pc => pc.playerId === playerId),
    hasVoted: gs.votes[playerId] !== undefined,
    myPlayedCardIndex: (gs.phase === 'voting' && playerId !== storytellerId)
      ? gs.playedCards.findIndex(pc => pc.playerId === playerId) : -1,
    myVotedIndex: gs.votes[playerId] !== undefined ? gs.votes[playerId] : -1,
    players: gs.playerOrder.map(id => ({
      id,
      name: gs.names[id],
      avatar: gs.avatars[id],
      score: gs.scores[id],
      hasPlayed: gs.playedCards.some(pc => pc.playerId === id),
      hasVoted: gs.votes[id] !== undefined,
      isStoryteller: id === storytellerId
    })),
    targetScore: gs.targetScore,
    lastRoundScoring: gs.lastRoundScoring,
    winner: gs.winner
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [], gameType: 'dixit' };

  const sorted = gs.playerOrder
    .map(id => ({ id, score: gs.scores[id], name: gs.names[id] }))
    .sort((a, b) => b.score - a.score);

  return {
    players: sorted.map((p, i) => {
      const player = room.players.find(pl => pl.id === p.id);
      return {
        rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}th`,
        name: p.name,
        score: p.score,
        isHost: player ? player.isHost : false
      };
    }),
    gameType: 'dixit'
  };
}

module.exports = { init, submitClue, playCard, vote, nextRound, getPlayerView, getResults };
