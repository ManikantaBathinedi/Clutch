// Texas Hold'em Poker — Server-side game logic

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

const HAND_RANKS = {
  'Royal Flush': 10,
  'Straight Flush': 9,
  'Four of a Kind': 8,
  'Full House': 7,
  'Flush': 6,
  'Straight': 5,
  'Three of a Kind': 4,
  'Two Pair': 3,
  'One Pair': 2,
  'High Card': 1
};

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
      deck.push({ suit, value, symbol: SUIT_SYMBOLS[suit], color: SUIT_COLORS[suit] });
    }
  }
  return shuffle(deck);
}

function valueRank(v) {
  return VALUES.indexOf(v);
}

// ─── HAND EVALUATION ───

function evaluateHand(cards) {
  // Get best 5-card hand from 7 cards
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const result = rankHand(combo);
    if (!best || compareHandResult(result, best) > 0) {
      best = result;
    }
  }
  return best;
}

function getCombinations(arr, k) {
  const results = [];
  function combine(start, combo) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  combine(0, []);
  return results;
}

function rankHand(five) {
  const vals = five.map(c => valueRank(c.value)).sort((a, b) => b - a);
  const suits = five.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(vals);

  // Count values
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let name, rank;

  if (isFlush && isStraight) {
    if (vals[0] === 12 && vals[1] === 11) {
      name = 'Royal Flush'; rank = 10;
    } else {
      name = 'Straight Flush'; rank = 9;
    }
  } else if (groups[0][1] === 4) {
    name = 'Four of a Kind'; rank = 8;
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    name = 'Full House'; rank = 7;
  } else if (isFlush) {
    name = 'Flush'; rank = 6;
  } else if (isStraight) {
    name = 'Straight'; rank = 5;
  } else if (groups[0][1] === 3) {
    name = 'Three of a Kind'; rank = 4;
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    name = 'Two Pair'; rank = 3;
  } else if (groups[0][1] === 2) {
    name = 'One Pair'; rank = 2;
  } else {
    name = 'High Card'; rank = 1;
  }

  // Kickers for tiebreaking
  const kickers = getSortedKickers(groups);

  return { name, rank, kickers, cards: five };
}

function checkStraight(vals) {
  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  if (uniq.length < 5) return false;
  // Normal straight
  if (uniq[0] - uniq[4] === 4) return true;
  // Ace-low straight (A-2-3-4-5)
  if (uniq[0] === 12 && uniq[1] === 3 && uniq[2] === 2 && uniq[3] === 1 && uniq[4] === 0) return true;
  return false;
}

function getSortedKickers(groups) {
  // Sort by count desc, then value desc
  return groups.sort((a, b) => b[1] - a[1] || parseInt(b[0]) - parseInt(a[0]))
    .map(g => parseInt(g[0]));
}

function compareHandResult(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

// ─── GAME LOGIC ───

function init(room) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  if (activePlayers.length < 2) {
    // Set a minimal gameState so clients get a "waiting" view instead of loading forever
    room.gameState = {
      playerStates: {},
      playerOrder: [],
      phase: 'waiting',
      community: [],
      pot: 0,
      currentBet: 0,
      minRaise: BIG_BLIND,
      roundNumber: 0,
      dealerIndex: 0,
      actionIndex: -1,
      winners: null,
      error: 'Need at least 2 players for Poker'
    };
    return;
  }

  const playerStates = {};
  const playerOrder = activePlayers.map(p => p.id);

  for (const p of activePlayers) {
    playerStates[p.id] = {
      chips: STARTING_CHIPS,
      hand: [],
      currentBet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      sittingOut: false
    };
  }

  room.gameState = {
    playerStates,
    playerOrder,
    dealerIndex: 0,
    community: [],
    deck: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    phase: 'pre-flop',  // pre-flop, flop, turn, river, showdown
    actionIndex: -1,
    lastRaiseIndex: -1,
    minRaise: BIG_BLIND,
    roundNumber: 1,
    lastAction: null,
    winners: null
  };

  startHand(room);
}

function startHand(room) {
  const gs = room.gameState;
  const order = gs.playerOrder;
  const n = order.length;

  // Reset per-hand state
  gs.deck = createDeck();
  gs.community = [];
  gs.pot = 0;
  gs.sidePots = [];
  gs.currentBet = 0;
  gs.phase = 'pre-flop';
  gs.winners = null;
  gs.lastAction = null;
  gs.minRaise = BIG_BLIND;

  // Find active (not sitting out) players
  const activePlayers = order.filter(id => !gs.playerStates[id].sittingOut && gs.playerStates[id].chips > 0);
  if (activePlayers.length < 2) {
    gs.phase = 'waiting';
    return;
  }

  // Reset player hand states
  for (const id of order) {
    const ps = gs.playerStates[id];
    ps.hand = [];
    ps.currentBet = 0;
    ps.totalBet = 0;
    ps.folded = false;
    ps.allIn = false;
    if (ps.chips <= 0) ps.sittingOut = true;
  }

  // Advance dealer
  gs.dealerIndex = (gs.dealerIndex + 1) % n;
  while (gs.playerStates[order[gs.dealerIndex]].sittingOut) {
    gs.dealerIndex = (gs.dealerIndex + 1) % n;
  }

  // Post blinds
  const sbIdx = nextActiveIndex(gs, gs.dealerIndex);
  const bbIdx = nextActiveIndex(gs, sbIdx);
  const sbId = order[sbIdx];
  const bbId = order[bbIdx];

  postBet(gs, sbId, Math.min(SMALL_BLIND, gs.playerStates[sbId].chips));
  postBet(gs, bbId, Math.min(BIG_BLIND, gs.playerStates[bbId].chips));
  gs.currentBet = BIG_BLIND;

  // Deal 2 cards to each active player
  for (const id of order) {
    if (!gs.playerStates[id].sittingOut && !gs.playerStates[id].folded) {
      gs.playerStates[id].hand.push(gs.deck.pop(), gs.deck.pop());
    }
  }

  // First action is after big blind
  gs.actionIndex = nextActiveIndex(gs, bbIdx);
  gs.lastRaiseIndex = bbIdx;
}

function nextActiveIndex(gs, fromIdx) {
  const order = gs.playerOrder;
  const n = order.length;
  let idx = (fromIdx + 1) % n;
  let safety = 0;
  while (safety++ < n) {
    const ps = gs.playerStates[order[idx]];
    if (!ps.sittingOut && !ps.folded && !ps.allIn) return idx;
    idx = (idx + 1) % n;
  }
  return -1;
}

function postBet(gs, playerId, amount) {
  const ps = gs.playerStates[playerId];
  const actual = Math.min(amount, ps.chips);
  ps.chips -= actual;
  ps.currentBet += actual;
  ps.totalBet += actual;
  gs.pot += actual;
  if (ps.chips === 0) ps.allIn = true;
}

function getActiveCount(gs) {
  return gs.playerOrder.filter(id => {
    const ps = gs.playerStates[id];
    return !ps.sittingOut && !ps.folded;
  }).length;
}

function getActionableCount(gs) {
  return gs.playerOrder.filter(id => {
    const ps = gs.playerStates[id];
    return !ps.sittingOut && !ps.folded && !ps.allIn;
  }).length;
}

// ─── PLAYER ACTIONS ───

function fold(room, playerId) {
  const gs = room.gameState;
  if (!isPlayerTurn(gs, playerId)) return null;

  gs.playerStates[playerId].folded = true;
  gs.lastAction = { type: 'fold', player: playerId };

  // Check win by all-fold
  const active = gs.playerOrder.filter(id => !gs.playerStates[id].folded && !gs.playerStates[id].sittingOut);
  if (active.length === 1) {
    awardPot(gs, [active[0]]);
    gs.phase = 'showdown';
    return true;
  }

  advanceAction(gs);
  return true;
}

function check(room, playerId) {
  const gs = room.gameState;
  if (!isPlayerTurn(gs, playerId)) return null;
  const ps = gs.playerStates[playerId];
  if (ps.currentBet < gs.currentBet) return null; // Must call, can't check

  gs.lastAction = { type: 'check', player: playerId };
  advanceAction(gs);
  return true;
}

function call(room, playerId) {
  const gs = room.gameState;
  if (!isPlayerTurn(gs, playerId)) return null;
  const ps = gs.playerStates[playerId];

  const toCall = gs.currentBet - ps.currentBet;
  if (toCall <= 0) return null;

  postBet(gs, playerId, toCall);
  gs.lastAction = { type: 'call', player: playerId, amount: Math.min(toCall, ps.chips + toCall) };
  advanceAction(gs);
  return true;
}

function raise(room, playerId, amount) {
  const gs = room.gameState;
  if (!isPlayerTurn(gs, playerId)) return null;
  const ps = gs.playerStates[playerId];

  amount = Math.floor(amount);
  const toCall = gs.currentBet - ps.currentBet;
  const raiseAmount = amount - toCall;

  // Validate raise amount
  if (raiseAmount < gs.minRaise && amount < ps.chips) return null;
  if (amount <= 0 || amount > ps.chips) return null;

  postBet(gs, playerId, amount);
  gs.currentBet = ps.currentBet;
  gs.minRaise = Math.max(gs.minRaise, raiseAmount);
  gs.lastRaiseIndex = gs.actionIndex;
  gs.lastAction = { type: 'raise', player: playerId, amount, total: ps.currentBet };
  advanceAction(gs);
  return true;
}

function allIn(room, playerId) {
  const gs = room.gameState;
  if (!isPlayerTurn(gs, playerId)) return null;
  const ps = gs.playerStates[playerId];

  const amount = ps.chips;
  if (amount <= 0) return null;

  const prevBet = ps.currentBet;
  postBet(gs, playerId, amount);
  if (ps.currentBet > gs.currentBet) {
    gs.minRaise = Math.max(gs.minRaise, ps.currentBet - gs.currentBet);
    gs.currentBet = ps.currentBet;
    gs.lastRaiseIndex = gs.actionIndex;
  }
  gs.lastAction = { type: 'all-in', player: playerId, amount };
  advanceAction(gs);
  return true;
}

function isPlayerTurn(gs, playerId) {
  if (gs.phase === 'showdown' || gs.phase === 'waiting') return false;
  return gs.playerOrder[gs.actionIndex] === playerId;
}

function advanceAction(gs) {
  const next = nextActiveIndex(gs, gs.actionIndex);

  // If no one can act or back to last raiser, advance phase
  if (next === -1 || next === gs.lastRaiseIndex || getActionableCount(gs) <= 1) {
    // Check if everyone has matched or all-in
    const needAction = gs.playerOrder.some(id => {
      const ps = gs.playerStates[id];
      return !ps.sittingOut && !ps.folded && !ps.allIn && ps.currentBet < gs.currentBet;
    });

    if (!needAction || getActionableCount(gs) === 0) {
      advancePhase(gs);
      return;
    }
  }

  gs.actionIndex = next;
}

function advancePhase(gs) {
  // Reset bets for new round
  for (const id of gs.playerOrder) {
    gs.playerStates[id].currentBet = 0;
  }
  gs.currentBet = 0;
  gs.minRaise = BIG_BLIND;

  const activeCount = getActiveCount(gs);

  if (gs.phase === 'pre-flop') {
    gs.phase = 'flop';
    gs.deck.pop(); // Burn card
    gs.community.push(gs.deck.pop(), gs.deck.pop(), gs.deck.pop());
  } else if (gs.phase === 'flop') {
    gs.phase = 'turn';
    gs.deck.pop(); // Burn
    gs.community.push(gs.deck.pop());
  } else if (gs.phase === 'turn') {
    gs.phase = 'river';
    gs.deck.pop(); // Burn
    gs.community.push(gs.deck.pop());
  } else if (gs.phase === 'river') {
    gs.phase = 'showdown';
    resolveShowdown(gs);
    return;
  }

  // If only one active (non-folded), go to showdown
  if (activeCount <= 1) {
    gs.phase = 'showdown';
    const winner = gs.playerOrder.find(id => !gs.playerStates[id].folded && !gs.playerStates[id].sittingOut);
    if (winner) awardPot(gs, [winner]);
    return;
  }

  // If all active are all-in, deal remaining cards
  if (getActionableCount(gs) <= 1) {
    // Deal remaining community cards
    while (gs.community.length < 5) {
      gs.deck.pop(); // burn
      gs.community.push(gs.deck.pop());
    }
    gs.phase = 'showdown';
    resolveShowdown(gs);
    return;
  }

  // Set action to first active player after dealer
  gs.actionIndex = nextActiveIndex(gs, gs.dealerIndex);
  gs.lastRaiseIndex = gs.actionIndex;
}

function resolveShowdown(gs) {
  const activePlayers = gs.playerOrder.filter(id =>
    !gs.playerStates[id].folded && !gs.playerStates[id].sittingOut
  );

  // Evaluate hands
  const hands = [];
  for (const id of activePlayers) {
    const allCards = [...gs.playerStates[id].hand, ...gs.community];
    const best = evaluateHand(allCards);
    hands.push({ id, hand: best });
  }

  // Sort by hand strength descending
  hands.sort((a, b) => compareHandResult(b.hand, a.hand));

  // Find winners (could be tie)
  const winners = [hands[0]];
  for (let i = 1; i < hands.length; i++) {
    if (compareHandResult(hands[i].hand, hands[0].hand) === 0) {
      winners.push(hands[i]);
    } else break;
  }

  const winnerIds = winners.map(w => w.id);
  awardPot(gs, winnerIds);

  // Store hand results for display
  gs.winners = winners.map(w => ({
    id: w.id,
    handName: w.hand.name,
    cards: w.hand.cards
  }));

  gs.handResults = hands.map(h => ({
    id: h.id,
    handName: h.hand.name
  }));
}

function awardPot(gs, winnerIds) {
  const share = Math.floor(gs.pot / winnerIds.length);
  const remainder = gs.pot % winnerIds.length;
  for (let i = 0; i < winnerIds.length; i++) {
    gs.playerStates[winnerIds[i]].chips += share + (i === 0 ? remainder : 0);
  }
  gs.pot = 0;
}

function newHand(room) {
  const gs = room.gameState;

  // Check if game is over (only one player with chips)
  const playersWithChips = gs.playerOrder.filter(id => gs.playerStates[id].chips > 0);
  if (playersWithChips.length <= 1) {
    gs.phase = 'finished';
    return true;
  }

  gs.roundNumber++;
  startHand(room);
  return true;
}

// ─── VIEWS ───

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;
  const ps = gs.playerStates[playerId];
  const currentPlayerId = gs.phase !== 'showdown' && gs.phase !== 'waiting' && gs.phase !== 'finished'
    ? gs.playerOrder[gs.actionIndex] : null;

  const players = gs.playerOrder.map(id => {
    const s = gs.playerStates[id];
    const p = room.players.find(pl => pl.id === id);
    const showCards = gs.phase === 'showdown' && !s.folded;
    return {
      id,
      name: p ? p.name : '?',
      avatar: p ? p.avatar : '👤',
      chips: s.chips,
      currentBet: s.currentBet,
      totalBet: s.totalBet,
      folded: s.folded,
      allIn: s.allIn,
      sittingOut: s.sittingOut,
      hand: (id === playerId || showCards) ? s.hand : s.hand.map(() => ({ hidden: true })),
      isDealer: gs.playerOrder[gs.dealerIndex] === id
    };
  });

  const toCall = ps ? Math.max(0, gs.currentBet - ps.currentBet) : 0;

  return {
    phase: gs.phase,
    pot: gs.pot,
    community: gs.community,
    players,
    currentPlayerId,
    isMyTurn: currentPlayerId === playerId,
    myChips: ps ? ps.chips : 0,
    myBet: ps ? ps.currentBet : 0,
    toCall,
    minRaise: gs.minRaise,
    lastAction: gs.lastAction,
    winners: gs.winners,
    handResults: gs.handResults || null,
    roundNumber: gs.roundNumber,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    error: gs.error || null
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { scores: [], winnerId: null };
  const scores = [];
  let maxChips = 0;
  let winnerId = null;

  for (const id of gs.playerOrder) {
    const ps = gs.playerStates[id];
    const p = room.players.find(pl => pl.id === id);
    if (ps.chips > maxChips) {
      maxChips = ps.chips;
      winnerId = id;
    }
    scores.push({
      id,
      name: p ? p.name : '?',
      avatar: p ? p.avatar : '👤',
      score: ps.chips,
      stat: `${ps.chips} chips`
    });
  }

  scores.sort((a, b) => b.score - a.score);
  return { scores, winnerId };
}

module.exports = { init, fold, check, call, raise, allIn, newHand, getPlayerView, getResults };
