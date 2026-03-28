// Color Clash — Server-side game logic (UNO clone)

const COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_HEX = { red: '#e74c3c', blue: '#3867d6', green: '#27ae60', yellow: '#f7b731' };
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTIONS = ['skip', 'reverse', 'draw2'];
const HAND_SIZE = 7;

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
  let id = 0;
  // Number cards: one 0 per color, two of 1-9 per color
  for (const color of COLORS) {
    deck.push({ id: id++, color, value: '0', type: 'number' });
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: id++, color, value: String(n), type: 'number' });
      deck.push({ id: id++, color, value: String(n), type: 'number' });
    }
    // Action cards: two each per color
    for (const action of ACTIONS) {
      deck.push({ id: id++, color, value: action, type: 'action' });
      deck.push({ id: id++, color, value: action, type: 'action' });
    }
  }
  // Wild cards: 4 each
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ id: id++, color: 'wild', value: 'wild4', type: 'wild' });
  }
  return shuffle(deck);
}

function cardPoints(card) {
  if (card.type === 'number') return parseInt(card.value);
  if (card.type === 'action') return 20;
  return 50; // wild cards
}

function cardLabel(card) {
  if (card.value === 'skip') return '⊘';
  if (card.value === 'reverse') return '⟲';
  if (card.value === 'draw2') return '+2';
  if (card.value === 'wild') return 'W';
  if (card.value === 'wild4') return '+4';
  return card.value;
}

function init(room) {
  const deck = createDeck();
  const hands = {};
  const playerOrder = room.players.map(p => p.id);

  for (const pid of playerOrder) {
    hands[pid] = deck.splice(0, HAND_SIZE);
  }

  // Find first number card for discard
  let firstCard;
  let idx = deck.findIndex(c => c.type === 'number');
  if (idx === -1) idx = 0;
  firstCard = deck.splice(idx, 1)[0];

  room.gameState = {
    deck,
    hands,
    discard: [firstCard],
    playerOrder,
    currentPlayerIndex: 0,
    direction: 1, // 1 = clockwise, -1 = counter
    currentColor: firstCard.color,
    currentValue: firstCard.value,
    winner: null,
    phase: 'playing',
    mustPickColor: false,
    pendingDraw: 0, // stacked +2/+4
    calledUno: {},   // track who called uno
    lastAction: null // for animation cues
  };
}

function canPlay(card, gs) {
  // If there are pending draws, only +2 can stack on +2, +4 can stack on +4
  if (gs.pendingDraw > 0) {
    if (gs.currentValue === 'draw2' && card.value === 'draw2') return true;
    if (gs.currentValue === 'wild4' && card.value === 'wild4') return true;
    return false;
  }
  if (card.type === 'wild') return true;
  if (card.color === gs.currentColor) return true;
  if (card.value === gs.currentValue && card.type !== 'wild') return true;
  return false;
}

function getPlayerState(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];
  const isMyTurn = playerId === currentPlayerId;

  return {
    hand: gs.hands[playerId] || [],
    topCard: gs.discard[gs.discard.length - 1],
    currentColor: gs.currentColor,
    currentValue: gs.currentValue,
    isMyTurn,
    direction: gs.direction,
    currentPlayer: room.players.find(p => p.id === currentPlayerId)?.name || 'Unknown',
    playerOrder: gs.playerOrder.map(id => ({
      id,
      name: room.players.find(p => p.id === id)?.name || 'Unknown',
      cardCount: (gs.hands[id] || []).length,
      isCurrent: id === currentPlayerId,
      calledUno: gs.calledUno[id] || false
    })),
    phase: gs.phase,
    winner: gs.winner ? room.players.find(p => p.id === gs.winner)?.name : null,
    mustPickColor: gs.mustPickColor && playerId === currentPlayerId,
    pendingDraw: gs.pendingDraw,
    deckCount: gs.deck.length,
    lastAction: gs.lastAction
  };
}

function playCard(room, playerId, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];
  if (playerId !== currentPlayerId) return null;
  if (gs.mustPickColor) return null;

  const hand = gs.hands[playerId];
  if (!hand || cardIndex < 0 || cardIndex >= hand.length) return null;

  const card = hand[cardIndex];
  if (!canPlay(card, gs)) return null;

  // Remove from hand
  hand.splice(cardIndex, 1);
  gs.discard.push(card);
  // Only reset calledUno if player still has more than 1 card
  if (hand.length > 1) gs.calledUno[playerId] = false;

  // Reset last action
  gs.lastAction = { type: 'play', card, player: room.players.find(p => p.id === playerId)?.name };

  // Check for win
  if (hand.length === 0) {
    gs.winner = playerId;
    gs.phase = 'over';

    let totalPoints = 0;
    for (const pid of gs.playerOrder) {
      if (pid === playerId) continue;
      totalPoints += (gs.hands[pid] || []).reduce((sum, c) => sum + cardPoints(c), 0);
    }
    const winner = room.players.find(p => p.id === playerId);
    if (winner) winner.score += totalPoints;

    gs.lastAction = { type: 'win', player: winner?.name, points: totalPoints };
    return { action: 'win', playerId, winnerName: winner?.name, points: totalPoints };
  }

  // Handle card effects
  if (card.type === 'wild') {
    gs.mustPickColor = true;
    gs.currentValue = card.value;
    if (card.value === 'wild4') {
      gs.pendingDraw += 4;
    }
    return { action: 'pick-color', card };
  }

  gs.currentColor = card.color;
  gs.currentValue = card.value;

  if (card.value === 'skip') {
    advanceTurn(gs); // skip the next player
    gs.lastAction.type = 'skip';
    advanceTurn(gs);
    return { action: 'played', card };
  }

  if (card.value === 'reverse') {
    gs.direction *= -1;
    gs.lastAction.type = 'reverse';
    if (gs.playerOrder.length === 2) {
      // In 2-player, reverse acts like skip
      advanceTurn(gs);
    }
    advanceTurn(gs);
    return { action: 'played', card };
  }

  if (card.value === 'draw2') {
    gs.pendingDraw += 2;
    advanceTurn(gs);
    return { action: 'played', card };
  }

  // Normal number card
  advanceTurn(gs);
  return { action: 'played', card };
}

function pickColor(room, playerId, color) {
  const gs = room.gameState;
  if (!gs || !gs.mustPickColor) return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];
  if (playerId !== currentPlayerId) return null;
  if (!COLORS.includes(color)) return null;

  gs.currentColor = color;
  gs.mustPickColor = false;

  advanceTurn(gs);
  return { action: 'color-picked', color };
}

function drawCards(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];
  if (playerId !== currentPlayerId) return null;
  if (gs.mustPickColor) return null;

  const count = gs.pendingDraw > 0 ? gs.pendingDraw : 1;
  const drawn = [];

  for (let i = 0; i < count; i++) {
    reshuffleDeckIfNeeded(gs);
    if (gs.deck.length === 0) break;
    const card = gs.deck.shift();
    gs.hands[playerId].push(card);
    drawn.push(card);
  }

  gs.pendingDraw = 0;
  gs.lastAction = { type: 'draw', count: drawn.length, player: room.players.find(p => p.id === playerId)?.name };

  // If drew penalty cards, turn passes. If drew 1 voluntarily, also pass turn.
  advanceTurn(gs);
  return { action: 'drew', count: drawn.length, cards: drawn };
}

function callUno(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const hand = gs.hands[playerId];
  if (!hand || hand.length > 2) return null; // can call when at 2 or 1 cards

  gs.calledUno[playerId] = true;
  return { action: 'uno', player: room.players.find(p => p.id === playerId)?.name };
}

function catchUno(room, playerId, targetId) {
  const gs = room.gameState;
  if (!gs) return null;

  // Can catch someone who has 1 card and didn't call uno
  const targetHand = gs.hands[targetId];
  if (!targetHand || targetHand.length !== 1 || gs.calledUno[targetId]) return null;

  // Penalty: draw 2 cards
  for (let i = 0; i < 2; i++) {
    reshuffleDeckIfNeeded(gs);
    if (gs.deck.length > 0) {
      targetHand.push(gs.deck.shift());
    }
  }
  gs.calledUno[targetId] = true; // prevent double catch

  return {
    action: 'caught',
    catcher: room.players.find(p => p.id === playerId)?.name,
    target: room.players.find(p => p.id === targetId)?.name
  };
}

function reshuffleDeckIfNeeded(gs) {
  if (gs.deck.length === 0 && gs.discard.length > 1) {
    const topCard = gs.discard.pop();
    gs.deck = shuffle(gs.discard);
    gs.discard = [topCard];
  }
}

function advanceTurn(gs) {
  gs.currentPlayerIndex = (gs.currentPlayerIndex + gs.direction + gs.playerOrder.length) % gs.playerOrder.length;
}

function getResults(room) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score
    })),
    winner: room.gameState?.winner ? room.players.find(p => p.id === room.gameState.winner)?.name : null
  };
}

module.exports = { init, getPlayerState, playCard, pickColor, drawCards, callUno, catchUno, getResults };
