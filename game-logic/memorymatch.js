// Memory Match — Server-side game logic
// Players take turns flipping two cards to find matching pairs

const GRID_SIZES = { small: 16, medium: 24, large: 36 };
const EMOJIS = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔',
  '🦄','🐝','🦋','🐌','🐙','🦀','🐠','🐳','🦈','🐊','🦕','🐉','🌵','🌻','🍄','🌈',
  '🍎','🍊','🍋','🍇','🍉','🍓','🥑','🌽','🍕','🍩','🧁','🍦','🎸','🎯','🎲','🚀'
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
  const pairCount = (settings && settings.pairs) || 12;
  const totalCards = pairCount * 2;

  // Pick random emojis and duplicate for pairs
  const selectedEmojis = shuffle(EMOJIS).slice(0, pairCount);
  const cards = shuffle([...selectedEmojis, ...selectedEmojis]);

  const playerOrder = shuffle(room.players.map(p => p.id));

  room.gameState = {
    cards,           // array of emoji strings
    flipped: [],     // indices of currently flipped (max 2)
    matched: [],     // indices of matched cards
    currentPlayer: 0,// index into playerOrder
    playerOrder,
    scores: {},      // playerId -> pairs found
    totalPairs: pairCount,
    phase: 'playing', // 'playing' | 'over'
    flipLock: false   // prevent rapid clicks during mismatch delay
  };

  room.players.forEach(p => { room.gameState.scores[p.id] = 0; });
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  // Build card view — only show flipped/matched cards
  const cardView = gs.cards.map((emoji, i) => {
    if (gs.matched.includes(i) || gs.flipped.includes(i)) {
      return { emoji, state: gs.matched.includes(i) ? 'matched' : 'flipped' };
    }
    return { emoji: null, state: 'hidden' };
  });

  const currentPlayerId = gs.playerOrder[gs.currentPlayer];
  const currentPlayerName = room.players.find(p => p.id === currentPlayerId)?.name || '?';

  return {
    cards: cardView,
    isMyTurn: playerId === currentPlayerId,
    currentPlayer: currentPlayerName,
    scores: getScoreboard(room),
    totalPairs: gs.totalPairs,
    matchedCount: gs.matched.length / 2,
    phase: gs.phase,
    flipLock: gs.flipLock
  };
}

function flipCard(room, playerId, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing' || gs.flipLock) return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayer];
  if (playerId !== currentPlayerId) return null;

  if (cardIndex < 0 || cardIndex >= gs.cards.length) return null;
  if (gs.matched.includes(cardIndex) || gs.flipped.includes(cardIndex)) return null;

  gs.flipped.push(cardIndex);

  if (gs.flipped.length === 1) {
    // First card flipped
    return { action: 'flip', cardIndex, emoji: gs.cards[cardIndex] };
  }

  if (gs.flipped.length === 2) {
    const [first, second] = gs.flipped;

    if (gs.cards[first] === gs.cards[second]) {
      // Match found!
      gs.matched.push(first, second);
      gs.scores[playerId] = (gs.scores[playerId] || 0) + 1;
      const player = room.players.find(p => p.id === playerId);
      if (player) player.score += 150;
      gs.flipped = [];

      // Check if all pairs found
      if (gs.matched.length === gs.cards.length) {
        gs.phase = 'over';
        return { action: 'gameOver', cardIndex, emoji: gs.cards[cardIndex], match: true };
      }

      // Same player goes again on a match
      return { action: 'match', cardIndex, emoji: gs.cards[cardIndex], match: true };
    } else {
      // Mismatch — lock, then hide after delay (client handles visual delay)
      gs.flipLock = true;
      return { action: 'mismatch', cardIndex, emoji: gs.cards[cardIndex], match: false, first, second };
    }
  }

  return null;
}

function hideMismatch(room) {
  const gs = room.gameState;
  if (!gs) return null;

  gs.flipped = [];
  gs.flipLock = false;

  // Advance to next player
  gs.currentPlayer = (gs.currentPlayer + 1) % gs.playerOrder.length;

  return { action: 'hidden' };
}

function getScoreboard(room) {
  const gs = room.gameState;
  return room.players
    .map(p => ({ name: p.name, pairs: gs.scores[p.id] || 0, score: p.score }))
    .sort((a, b) => b.pairs - a.pairs || b.score - a.score);
}

function getResults(room) {
  return {
    players: room.players
      .map(p => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score)
  };
}

module.exports = { init, getPlayerView, flipCard, hideMismatch, getResults };
