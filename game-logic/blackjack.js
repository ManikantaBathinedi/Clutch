// Blackjack — Server-side game logic

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
const STARTING_CHIPS = 1000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck(numDecks) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value, symbol: SUIT_SYMBOLS[suit], color: SUIT_COLORS[suit] });
      }
    }
  }
  return shuffle(deck);
}

function cardValue(card) {
  if (['J', 'Q', 'K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value);
}

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card);
    if (card.value === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function init(room) {
  const deck = createDeck(4); // 4-deck shoe
  const playerStates = {};

  for (const p of room.players) {
    playerStates[p.id] = {
      chips: STARTING_CHIPS,
      bet: 0,
      hand: [],
      status: 'betting', // betting -> playing -> standing -> busted -> resolved
      result: null,
      payout: 0
    };
  }

  room.gameState = {
    deck,
    dealer: { hand: [], total: 0 },
    playerStates,
    playerOrder: room.players.map(p => p.id),
    phase: 'betting', // betting -> dealing -> playing -> dealer -> resolved
    currentPlayerIndex: -1,
    roundNumber: 1
  };
}

function placeBet(room, playerId, amount) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'betting') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || ps.status !== 'betting') return null;

  const bet = Math.min(Math.max(Math.floor(amount), 10), ps.chips);
  if (bet <= 0) return null;

  ps.bet = bet;
  ps.chips -= bet;
  ps.status = 'ready';

  // Check if all players have bet
  const allReady = gs.playerOrder.every(id => gs.playerStates[id].status === 'ready');
  if (allReady) {
    return dealCards(room);
  }

  return { action: 'bet-placed', playerId, bet };
}

function dealCards(room) {
  const gs = room.gameState;

  // Deal 2 cards to each player and dealer
  for (let round = 0; round < 2; round++) {
    for (const pid of gs.playerOrder) {
      gs.playerStates[pid].hand.push(drawCard(gs));
      gs.playerStates[pid].status = 'playing';
    }
    gs.dealer.hand.push(drawCard(gs));
  }

  gs.dealer.total = handTotal(gs.dealer.hand);
  gs.phase = 'playing';
  gs.currentPlayerIndex = 0;

  // Check for natural blackjacks
  for (const pid of gs.playerOrder) {
    const ps = gs.playerStates[pid];
    const total = handTotal(ps.hand);
    if (total === 21) {
      ps.status = 'standing'; // natural 21
    }
  }

  // Skip to first non-standing player
  skipStanding(gs);

  return { action: 'dealt' };
}

function drawCard(gs) {
  if (gs.deck.length === 0) {
    gs.deck = createDeck(4);
  }
  return gs.deck.shift();
}

function hit(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;

  const currentPid = gs.playerOrder[gs.currentPlayerIndex];
  if (playerId !== currentPid) return null;

  const ps = gs.playerStates[playerId];
  if (ps.status !== 'playing') return null;

  const card = drawCard(gs);
  ps.hand.push(card);
  const total = handTotal(ps.hand);

  if (total > 21) {
    ps.status = 'busted';
    ps.result = 'bust';
    return advanceOrDealerTurn(room);
  }

  if (total === 21) {
    ps.status = 'standing';
    return advanceOrDealerTurn(room);
  }

  return { action: 'hit', card, total };
}

function stand(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;

  const currentPid = gs.playerOrder[gs.currentPlayerIndex];
  if (playerId !== currentPid) return null;

  gs.playerStates[playerId].status = 'standing';
  return advanceOrDealerTurn(room);
}

function doubleDown(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return null;

  const currentPid = gs.playerOrder[gs.currentPlayerIndex];
  if (playerId !== currentPid) return null;

  const ps = gs.playerStates[playerId];
  if (ps.status !== 'playing' || ps.hand.length !== 2) return null;

  // Double the bet
  const extraBet = Math.min(ps.bet, ps.chips);
  ps.chips -= extraBet;
  ps.bet += extraBet;

  // Draw one card and stand
  const card = drawCard(gs);
  ps.hand.push(card);
  const total = handTotal(ps.hand);

  if (total > 21) {
    ps.status = 'busted';
    ps.result = 'bust';
  } else {
    ps.status = 'standing';
  }

  return advanceOrDealerTurn(room);
}

function skipStanding(gs) {
  while (gs.currentPlayerIndex < gs.playerOrder.length) {
    const pid = gs.playerOrder[gs.currentPlayerIndex];
    if (gs.playerStates[pid].status === 'playing') break;
    gs.currentPlayerIndex++;
  }
}

function advanceOrDealerTurn(room) {
  const gs = room.gameState;
  gs.currentPlayerIndex++;
  skipStanding(gs);

  if (gs.currentPlayerIndex >= gs.playerOrder.length) {
    return dealerPlay(room);
  }

  return { action: 'next-player', currentPlayer: gs.playerOrder[gs.currentPlayerIndex] };
}

function dealerPlay(room) {
  const gs = room.gameState;
  gs.phase = 'dealer';

  // Check if all players busted
  const allBusted = gs.playerOrder.every(id => gs.playerStates[id].status === 'busted');

  if (!allBusted) {
    // Dealer hits until 17+
    while (handTotal(gs.dealer.hand) < 17) {
      gs.dealer.hand.push(drawCard(gs));
    }
  }

  gs.dealer.total = handTotal(gs.dealer.hand);
  const dealerBust = gs.dealer.total > 21;

  // Resolve all players
  for (const pid of gs.playerOrder) {
    const ps = gs.playerStates[pid];
    if (ps.status === 'busted') {
      ps.result = 'bust';
      ps.payout = 0;
      continue;
    }

    const playerTotal = handTotal(ps.hand);
    const isBlackjack = ps.hand.length === 2 && playerTotal === 21;

    if (dealerBust) {
      ps.result = isBlackjack ? 'blackjack' : 'win';
    } else if (playerTotal > gs.dealer.total) {
      ps.result = isBlackjack ? 'blackjack' : 'win';
    } else if (playerTotal === gs.dealer.total) {
      ps.result = 'push';
    } else {
      ps.result = 'lose';
    }

    // Calculate payout
    if (ps.result === 'blackjack') {
      ps.payout = Math.floor(ps.bet * 2.5);
    } else if (ps.result === 'win') {
      ps.payout = ps.bet * 2;
    } else if (ps.result === 'push') {
      ps.payout = ps.bet;
    } else {
      ps.payout = 0;
    }

    ps.chips += ps.payout;
    ps.status = 'resolved';

    // Update session score
    const player = room.players.find(p => p.id === pid);
    if (player && ps.result === 'win') player.score += ps.bet;
    if (player && ps.result === 'blackjack') player.score += Math.floor(ps.bet * 1.5);
  }

  gs.phase = 'resolved';
  return { action: 'resolved' };
}

function newRound(room) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'resolved') return null;

  // Reset for new round
  gs.dealer = { hand: [], total: 0 };
  gs.phase = 'betting';
  gs.currentPlayerIndex = -1;
  gs.roundNumber++;

  for (const pid of gs.playerOrder) {
    const ps = gs.playerStates[pid];
    ps.hand = [];
    ps.bet = 0;
    ps.status = 'betting';
    ps.result = null;
    ps.payout = 0;
    if (ps.chips <= 0) ps.chips = 100; // min buy-back
  }

  // Reshuffle if deck is low
  if (gs.deck.length < 60) {
    gs.deck = createDeck(4);
  }

  return { action: 'new-round', roundNumber: gs.roundNumber };
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPid = gs.currentPlayerIndex >= 0 && gs.currentPlayerIndex < gs.playerOrder.length
    ? gs.playerOrder[gs.currentPlayerIndex] : null;

  return {
    phase: gs.phase,
    roundNumber: gs.roundNumber,
    dealer: {
      hand: gs.phase === 'betting' || gs.phase === 'dealing'
        ? []
        : gs.phase === 'playing'
          ? [gs.dealer.hand[0], { hidden: true }]
          : gs.dealer.hand,
      total: gs.phase === 'resolved' || gs.phase === 'dealer' ? gs.dealer.total : null
    },
    me: gs.playerStates[playerId] || null,
    myTotal: gs.playerStates[playerId] ? handTotal(gs.playerStates[playerId].hand) : 0,
    isMyTurn: playerId === currentPid,
    players: gs.playerOrder.map(id => {
      const ps = gs.playerStates[id];
      return {
        name: room.players.find(p => p.id === id)?.name || 'Unknown',
        cardCount: ps.hand.length,
        bet: ps.bet,
        status: ps.status,
        result: ps.result,
        chips: ps.chips,
        isCurrent: id === currentPid,
        isMe: id === playerId,
        hand: (gs.phase === 'resolved' || id === playerId) ? ps.hand : null,
        total: (gs.phase === 'resolved' || id === playerId) ? handTotal(ps.hand) : null
      };
    })
  };
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

module.exports = { init, placeBet, hit, stand, doubleDown, newRound, getPlayerView, getResults };
