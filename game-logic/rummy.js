// ─── RUMMY SERVER LOGIC ───
// Classic Rummy: 2-6 players, draw/discard, form sets and runs to go out.

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

function valueRank(v) {
  // A=1, 2=2...10=10, J=11, Q=12, K=13
  const idx = VALUES.indexOf(v);
  return idx + 1;
}

function cardPoints(v) {
  if (v === 'A') return 1;
  if (['J', 'Q', 'K'].includes(v)) return 10;
  return parseInt(v);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value, symbol: SUIT_SYMBOLS[suit], id: `${value}_${suit}` });
    }
  }
  return shuffle(deck);
}

function init(room) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const numPlayers = Math.min(activePlayers.length, 6);
  if (numPlayers < 2) return;

  const deck = createDeck();
  const handSize = numPlayers <= 2 ? 10 : 7;
  const playerOrder = activePlayers.slice(0, numPlayers).map(p => p.id);

  const hands = {};
  const melds = {};
  for (const p of playerOrder) {
    hands[p] = deck.splice(0, handSize);
    melds[p] = [];
  }

  // Discard pile starts with one card
  const discardPile = [deck.pop()];

  room.gameState = {
    deck,
    discardPile,
    hands,
    melds, // each player's laid-down melds: array of arrays
    playerOrder,
    playerNames: {},
    playerAvatars: {},
    currentPlayerIndex: 0,
    phase: 'draw', // draw, discard, finished
    hasDrawn: false,
    roundOver: false,
    winner: null,
    lastAction: null,
    turnCount: 0
  };

  for (const p of activePlayers.slice(0, numPlayers)) {
    room.gameState.playerNames[p.id] = p.name;
    room.gameState.playerAvatars[p.id] = p.avatar || '🃏';
  }
}

function drawFromDeck(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'draw') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;
  if (gs.hasDrawn) return null;

  // Reshuffle discard if deck empty
  if (gs.deck.length === 0) {
    if (gs.discardPile.length <= 1) return null;
    const topDiscard = gs.discardPile.pop();
    gs.deck = shuffle(gs.discardPile);
    gs.discardPile = [topDiscard];
  }

  const card = gs.deck.pop();
  gs.hands[playerId].push(card);
  gs.hasDrawn = true;
  gs.phase = 'discard';
  gs.lastAction = { type: 'draw-deck', player: playerId };
  return { success: true };
}

function drawFromDiscard(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'draw') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;
  if (gs.hasDrawn) return null;
  if (gs.discardPile.length === 0) return null;

  const card = gs.discardPile.pop();
  gs.hands[playerId].push(card);
  gs.hasDrawn = true;
  gs.phase = 'discard';
  gs.lastAction = { type: 'draw-discard', player: playerId, card };
  return { success: true };
}

function discard(room, playerId, cardId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'discard') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;

  const hand = gs.hands[playerId];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return null;

  const card = hand.splice(cardIndex, 1)[0];
  gs.discardPile.push(card);
  gs.lastAction = { type: 'discard', player: playerId, card };

  // Check if player is out (empty hand)
  if (hand.length === 0) {
    gs.phase = 'finished';
    gs.winner = playerId;
    // Score: other players get penalty points for cards in hand
    const winPlayer = room.players.find(p => p.id === playerId);
    if (winPlayer) winPlayer.score = (winPlayer.score || 0) + 1;
    calculateScores(room);
    return { success: true, gameOver: true };
  }

  // Next turn
  gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
  gs.hasDrawn = false;
  gs.phase = 'draw';
  gs.turnCount++;
  return { success: true };
}

function layMeld(room, playerId, cardIds) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'discard') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;
  if (!cardIds || cardIds.length < 3) return null;

  const hand = gs.hands[playerId];
  const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
  if (cards.length !== cardIds.length) return null;

  // Validate: must be a valid set or run
  if (!isValidMeld(cards)) return null;

  // Remove from hand
  for (const card of cards) {
    const idx = hand.findIndex(c => c.id === card.id);
    if (idx !== -1) hand.splice(idx, 1);
  }

  gs.melds[playerId].push(cards);
  gs.lastAction = { type: 'meld', player: playerId, count: cards.length };
  return { success: true };
}

function layOff(room, playerId, cardId, targetPlayerId, meldIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'discard') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;

  const hand = gs.hands[playerId];
  const cardIdx = hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return null;

  const targetMelds = gs.melds[targetPlayerId];
  if (!targetMelds || meldIndex < 0 || meldIndex >= targetMelds.length) return null;

  const meld = targetMelds[meldIndex];
  const card = hand[cardIdx];

  // Check if adding this card to the meld keeps it valid
  const testMeld = [...meld, card];
  if (!isValidMeld(testMeld)) return null;

  hand.splice(cardIdx, 1);
  meld.push(card);
  gs.lastAction = { type: 'layoff', player: playerId };
  return { success: true };
}

function isValidMeld(cards) {
  if (cards.length < 3) return false;
  return isValidSet(cards) || isValidRun(cards);
}

function isValidSet(cards) {
  // All same value, different suits
  const value = cards[0].value;
  const suits = new Set(cards.map(c => c.suit));
  return cards.every(c => c.value === value) && suits.size === cards.length;
}

function isValidRun(cards) {
  // All same suit, consecutive values
  const suit = cards[0].suit;
  if (!cards.every(c => c.suit === suit)) return false;

  const ranks = cards.map(c => valueRank(c.value)).sort((a, b) => a - b);

  // Check consecutive
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) {
      // Allow A-2-3 wrap (A=1)
      // Don't allow Q-K-A wrap
      return false;
    }
  }
  return true;
}

function calculateScores(room) {
  const gs = room.gameState;
  for (const pid of gs.playerOrder) {
    if (pid === gs.winner) continue;
    const hand = gs.hands[pid];
    const penalty = hand.reduce((sum, c) => sum + cardPoints(c.value), 0);
    const player = room.players.find(p => p.id === pid);
    if (player) player.score = (player.score || 0) - penalty;
  }
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];

  return {
    phase: gs.phase,
    myHand: gs.hands[playerId] || [],
    melds: gs.melds,
    discardTop: gs.discardPile.length > 0 ? gs.discardPile[gs.discardPile.length - 1] : null,
    deckCount: gs.deck.length,
    isMyTurn: currentPlayerId === playerId,
    currentPlayerId,
    hasDrawn: gs.hasDrawn,
    players: gs.playerOrder.map(id => ({
      id,
      name: gs.playerNames[id],
      avatar: gs.playerAvatars[id],
      cardCount: (gs.hands[id] || []).length,
      meldCount: (gs.melds[id] || []).length,
      isCurrentTurn: id === currentPlayerId
    })),
    lastAction: gs.lastAction,
    winner: gs.winner,
    // On game over, show everyone's hands
    allHands: gs.phase === 'finished' ? gs.hands : null,
    turnCount: gs.turnCount
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [], gameType: 'rummy' };

  const sorted = [...room.players]
    .filter(p => gs.playerOrder.includes(p.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}th`,
      name: p.name,
      score: p.score || 0,
      isHost: p.isHost
    })),
    gameType: 'rummy'
  };
}

module.exports = { init, drawFromDeck, drawFromDiscard, discard, layMeld, layOff, getPlayerView, getResults };
