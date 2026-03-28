// ─── COUP SERVER LOGIC ───
// Bluffing/deduction game: 2-6 players, 2 hidden role cards each.
// Use abilities (real or bluffed) to eliminate opponents.

const ROLES = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
const ROLE_ICONS = { Duke: '👑', Assassin: '🗡️', Captain: '⚓', Ambassador: '🤝', Contessa: '👸' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  // 3 copies of each role = 15 cards
  const deck = [];
  for (const role of ROLES) {
    for (let i = 0; i < 3; i++) deck.push(role);
  }
  return shuffle(deck);
}

function init(room) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const numPlayers = Math.min(activePlayers.length, 6);
  if (numPlayers < 2) return;

  const deck = createDeck();
  const playerOrder = activePlayers.slice(0, numPlayers).map(p => p.id);
  const playerStates = {};

  for (const id of playerOrder) {
    const p = activePlayers.find(pl => pl.id === id);
    playerStates[id] = {
      name: p.name,
      avatar: p.avatar || '😎',
      coins: 2,
      cards: [deck.pop(), deck.pop()],
      revealed: [false, false], // true = face up (dead)
      alive: true
    };
  }

  room.gameState = {
    deck,
    playerOrder,
    playerStates,
    currentPlayerIndex: 0,
    phase: 'action', // action, challenge, counteraction, counter-challenge, losing-card, exchange, finished
    pendingAction: null,
    pendingChallenge: null,
    pendingCounter: null,
    challengeResponders: [],
    counterResponders: [],
    winner: null,
    actionLog: [],
    lastEvent: null
  };
}

function getAliveCards(ps) {
  return ps.cards.filter((_, i) => !ps.revealed[i]);
}

function isAlive(ps) {
  return ps.cards.some((_, i) => !ps.revealed[i]);
}

function countAlive(gs) {
  return gs.playerOrder.filter(id => isAlive(gs.playerStates[id])).length;
}

function nextAliveTurn(gs) {
  let idx = gs.currentPlayerIndex;
  for (let i = 0; i < gs.playerOrder.length; i++) {
    idx = (idx + 1) % gs.playerOrder.length;
    if (isAlive(gs.playerStates[gs.playerOrder[idx]])) {
      gs.currentPlayerIndex = idx;
      return;
    }
  }
}

function checkWin(gs) {
  const alive = gs.playerOrder.filter(id => isAlive(gs.playerStates[id]));
  if (alive.length === 1) {
    gs.phase = 'finished';
    gs.winner = alive[0];
    return true;
  }
  return false;
}

// Actions a player can take
function takeAction(room, playerId, action, targetId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'action') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;
  if (!isAlive(gs.playerStates[playerId])) return null;

  const ps = gs.playerStates[playerId];
  const validActions = ['income', 'foreign-aid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'];
  if (!validActions.includes(action)) return null;

  // Forced coup at 10+ coins
  if (ps.coins >= 10 && action !== 'coup') return null;

  // Income: take 1 coin (cannot be blocked/challenged)
  if (action === 'income') {
    ps.coins += 1;
    gs.actionLog.push({ player: ps.name, action: 'Income', detail: '+1 coin' });
    gs.lastEvent = { type: 'action', player: playerId, action: 'income' };
    nextAliveTurn(gs);
    gs.phase = 'action';
    checkWin(gs);
    return { success: true, resolved: true };
  }

  // Coup: pay 7, target loses a card
  if (action === 'coup') {
    if (ps.coins < 7) return null;
    if (!targetId || !gs.playerStates[targetId] || !isAlive(gs.playerStates[targetId])) return null;
    ps.coins -= 7;
    gs.pendingAction = { type: 'coup', actor: playerId, target: targetId };
    gs.phase = 'losing-card';
    gs.actionLog.push({ player: ps.name, action: 'Coup', detail: `against ${gs.playerStates[targetId].name}` });
    gs.lastEvent = { type: 'coup', player: playerId, target: targetId };
    return { success: true, awaitingLoseCard: targetId };
  }

  // Foreign Aid: take 2 coins (can be blocked by Duke)
  if (action === 'foreign-aid') {
    gs.pendingAction = { type: 'foreign-aid', actor: playerId };
    gs.phase = 'counteraction';
    gs.counterResponders = gs.playerOrder.filter(id => id !== playerId && isAlive(gs.playerStates[id]));
    gs.actionLog.push({ player: ps.name, action: 'Foreign Aid', detail: 'requesting 2 coins' });
    gs.lastEvent = { type: 'action', player: playerId, action: 'foreign-aid' };
    return { success: true, awaitingCounter: true };
  }

  // Tax (Duke): take 3 coins
  if (action === 'tax') {
    gs.pendingAction = { type: 'tax', actor: playerId, claimedRole: 'Duke' };
    gs.phase = 'challenge';
    gs.challengeResponders = gs.playerOrder.filter(id => id !== playerId && isAlive(gs.playerStates[id]));
    gs.actionLog.push({ player: ps.name, action: 'Tax (Duke)', detail: 'claiming 3 coins' });
    gs.lastEvent = { type: 'action', player: playerId, action: 'tax' };
    return { success: true, awaitingChallenge: true };
  }

  // Assassinate (Assassin): pay 3, target loses card (can be challenged or blocked by Contessa)
  if (action === 'assassinate') {
    if (ps.coins < 3) return null;
    if (!targetId || !gs.playerStates[targetId] || !isAlive(gs.playerStates[targetId])) return null;
    ps.coins -= 3;
    gs.pendingAction = { type: 'assassinate', actor: playerId, target: targetId, claimedRole: 'Assassin' };
    gs.phase = 'challenge';
    gs.challengeResponders = gs.playerOrder.filter(id => id !== playerId && isAlive(gs.playerStates[id]));
    gs.actionLog.push({ player: ps.name, action: 'Assassinate', detail: `targeting ${gs.playerStates[targetId].name}` });
    gs.lastEvent = { type: 'action', player: playerId, action: 'assassinate', target: targetId };
    return { success: true, awaitingChallenge: true };
  }

  // Steal (Captain): take 2 coins from target
  if (action === 'steal') {
    if (!targetId || !gs.playerStates[targetId] || !isAlive(gs.playerStates[targetId])) return null;
    gs.pendingAction = { type: 'steal', actor: playerId, target: targetId, claimedRole: 'Captain' };
    gs.phase = 'challenge';
    gs.challengeResponders = gs.playerOrder.filter(id => id !== playerId && isAlive(gs.playerStates[id]));
    gs.actionLog.push({ player: ps.name, action: 'Steal (Captain)', detail: `from ${gs.playerStates[targetId].name}` });
    gs.lastEvent = { type: 'action', player: playerId, action: 'steal', target: targetId };
    return { success: true, awaitingChallenge: true };
  }

  // Exchange (Ambassador): draw 2, return 2
  if (action === 'exchange') {
    gs.pendingAction = { type: 'exchange', actor: playerId, claimedRole: 'Ambassador' };
    gs.phase = 'challenge';
    gs.challengeResponders = gs.playerOrder.filter(id => id !== playerId && isAlive(gs.playerStates[id]));
    gs.actionLog.push({ player: ps.name, action: 'Exchange (Ambassador)' });
    gs.lastEvent = { type: 'action', player: playerId, action: 'exchange' };
    return { success: true, awaitingChallenge: true };
  }

  return null;
}

function respondChallenge(room, playerId, challenge) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'challenge') return null;
  if (!gs.challengeResponders.includes(playerId)) return null;

  if (challenge) {
    // Someone challenges the action
    const action = gs.pendingAction;
    const actor = gs.playerStates[action.actor];
    const challenger = gs.playerStates[playerId];
    const claimedRole = action.claimedRole;

    // Does the actor actually have the claimed role?
    const aliveCards = actor.cards.filter((_, i) => !actor.revealed[i]);
    const hasRole = aliveCards.includes(claimedRole);

    if (hasRole) {
      // Challenge fails: challenger loses a card
      gs.lastEvent = { type: 'challenge-failed', challenger: playerId, actor: action.actor, role: claimedRole };
      gs.actionLog.push({ player: challenger.name, action: 'Challenge Failed', detail: `${actor.name} had ${claimedRole}` });

      // Actor swaps the revealed card for a new one
      const roleIdx = actor.cards.findIndex((c, i) => c === claimedRole && !actor.revealed[i]);
      gs.deck.push(actor.cards[roleIdx]);
      gs.deck = shuffle(gs.deck);
      actor.cards[roleIdx] = gs.deck.pop();

      // Challenger must lose a card
      gs.pendingChallenge = { loser: playerId, originalAction: action };
      gs.phase = 'losing-card';
      gs.pendingAction = { ...action, _afterChallenge: true };
      return { success: true, challengeFailed: true, loser: playerId };
    } else {
      // Challenge succeeds: actor loses a card, action is cancelled
      gs.lastEvent = { type: 'challenge-succeeded', challenger: playerId, actor: action.actor, role: claimedRole };
      gs.actionLog.push({ player: challenger.name, action: 'Challenge Succeeded', detail: `${actor.name} didn't have ${claimedRole}` });

      // Refund coins if assassinate
      if (action.type === 'assassinate') {
        actor.coins += 3;
      }

      gs.pendingAction = null;
      gs.pendingChallenge = { loser: action.actor };
      gs.phase = 'losing-card';
      return { success: true, challengeSucceeded: true, loser: action.actor };
    }
  } else {
    // Pass on challenge
    gs.challengeResponders = gs.challengeResponders.filter(id => id !== playerId);
    if (gs.challengeResponders.length === 0) {
      // No one challenged — proceed with action
      return resolveAction(room);
    }
    return { success: true, waiting: true };
  }
}

function respondCounter(room, playerId, counter, claimedRole) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'counteraction') return null;
  if (!gs.counterResponders.includes(playerId)) return null;

  if (counter) {
    // Someone blocks
    gs.pendingCounter = { blocker: playerId, claimedRole: claimedRole || 'Duke' };
    gs.phase = 'counter-challenge';
    gs.challengeResponders = gs.playerOrder.filter(id => id !== playerId && isAlive(gs.playerStates[id]));
    const blockerName = gs.playerStates[playerId].name;
    gs.actionLog.push({ player: blockerName, action: 'Block', detail: `claiming ${claimedRole || 'Duke'}` });
    gs.lastEvent = { type: 'counter', blocker: playerId, role: claimedRole || 'Duke' };
    return { success: true, awaitingCounterChallenge: true };
  } else {
    gs.counterResponders = gs.counterResponders.filter(id => id !== playerId);
    if (gs.counterResponders.length === 0) {
      // No one blocked — action goes through
      return resolveAction(room);
    }
    return { success: true, waiting: true };
  }
}

function respondCounterChallenge(room, playerId, challenge) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'counter-challenge') return null;
  if (!gs.challengeResponders.includes(playerId)) return null;

  if (challenge) {
    const counter = gs.pendingCounter;
    const blocker = gs.playerStates[counter.blocker];
    const aliveCards = blocker.cards.filter((_, i) => !blocker.revealed[i]);
    const hasRole = aliveCards.includes(counter.claimedRole);

    if (hasRole) {
      // Block stands (challenger of block loses card)
      gs.lastEvent = { type: 'counter-challenge-failed', challenger: playerId, blocker: counter.blocker };
      const roleIdx = blocker.cards.findIndex((c, i) => c === counter.claimedRole && !blocker.revealed[i]);
      gs.deck.push(blocker.cards[roleIdx]);
      gs.deck = shuffle(gs.deck);
      blocker.cards[roleIdx] = gs.deck.pop();

      gs.pendingChallenge = { loser: playerId };
      gs.pendingAction = null; // action is blocked
      gs.pendingCounter = null;
      gs.phase = 'losing-card';
      return { success: true, blockStands: true, loser: playerId };
    } else {
      // Block fails — blocker loses card and original action proceeds
      gs.lastEvent = { type: 'counter-challenge-succeeded', challenger: playerId, blocker: counter.blocker };
      gs.pendingChallenge = { loser: counter.blocker, _thenResolve: true };
      gs.pendingCounter = null;
      gs.phase = 'losing-card';
      return { success: true, blockFails: true, loser: counter.blocker };
    }
  } else {
    gs.challengeResponders = gs.challengeResponders.filter(id => id !== playerId);
    if (gs.challengeResponders.length === 0) {
      // Block is accepted — action is cancelled
      gs.pendingAction = null;
      gs.pendingCounter = null;
      gs.actionLog.push({ action: 'Blocked', detail: 'action cancelled' });
      nextAliveTurn(gs);
      gs.phase = 'action';
      checkWin(gs);
      return { success: true, blocked: true };
    }
    return { success: true, waiting: true };
  }
}

function loseCard(room, playerId, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'losing-card') return null;

  // Determine who should lose a card
  let expectedLoser;
  if (gs.pendingChallenge) {
    expectedLoser = gs.pendingChallenge.loser;
  } else if (gs.pendingAction && gs.pendingAction.type === 'coup') {
    expectedLoser = gs.pendingAction.target;
  } else if (gs.pendingAction && (gs.pendingAction.type === 'assassinate')) {
    expectedLoser = gs.pendingAction.target;
  }

  if (playerId !== expectedLoser) return null;
  const ps = gs.playerStates[playerId];
  if (cardIndex < 0 || cardIndex >= ps.cards.length || ps.revealed[cardIndex]) return null;

  ps.revealed[cardIndex] = true;
  ps.alive = isAlive(ps);
  gs.actionLog.push({ player: ps.name, action: 'Lost Card', detail: ps.cards[cardIndex] });
  gs.lastEvent = { type: 'card-lost', player: playerId, card: ps.cards[cardIndex], cardIndex };

  if (checkWin(gs)) return { success: true, gameOver: true };

  // After challenge resolution, resolve the original action if it should proceed
  if (gs.pendingChallenge) {
    const pc = gs.pendingChallenge;
    if (pc._thenResolve && gs.pendingAction) {
      gs.pendingChallenge = null;
      return resolveAction(room);
    }
    if (pc.originalAction && gs.pendingAction && gs.pendingAction._afterChallenge) {
      // The action was not cancelled — proceed to counteraction or resolve
      gs.pendingChallenge = null;
      gs.pendingAction = pc.originalAction;
      return resolveOrCounter(room);
    }
    gs.pendingChallenge = null;
    if (!gs.pendingAction) {
      nextAliveTurn(gs);
      gs.phase = 'action';
      return { success: true };
    }
  }

  // After coup
  if (gs.pendingAction && gs.pendingAction.type === 'coup') {
    gs.pendingAction = null;
    nextAliveTurn(gs);
    gs.phase = 'action';
    checkWin(gs);
    return { success: true };
  }

  // After successful assassination (target lost card)
  if (gs.pendingAction && gs.pendingAction.type === 'assassinate') {
    gs.pendingAction = null;
    nextAliveTurn(gs);
    gs.phase = 'action';
    checkWin(gs);
    return { success: true };
  }

  nextAliveTurn(gs);
  gs.phase = 'action';
  return { success: true };
}

function resolveOrCounter(room) {
  const gs = room.gameState;
  const action = gs.pendingAction;

  // Some actions can be countered
  if (action.type === 'foreign-aid') {
    gs.phase = 'counteraction';
    gs.counterResponders = gs.playerOrder.filter(id => id !== action.actor && isAlive(gs.playerStates[id]));
    return { success: true, awaitingCounter: true };
  }
  if (action.type === 'assassinate') {
    // Target can counter with Contessa
    gs.phase = 'counteraction';
    gs.counterResponders = [action.target].filter(id => isAlive(gs.playerStates[id]));
    return { success: true, awaitingCounter: true };
  }
  if (action.type === 'steal') {
    // Target can counter with Ambassador or Captain
    gs.phase = 'counteraction';
    gs.counterResponders = [action.target].filter(id => isAlive(gs.playerStates[id]));
    return { success: true, awaitingCounter: true };
  }

  return resolveAction(room);
}

function resolveAction(room) {
  const gs = room.gameState;
  const action = gs.pendingAction;
  if (!action) {
    nextAliveTurn(gs);
    gs.phase = 'action';
    return { success: true };
  }

  const actor = gs.playerStates[action.actor];

  if (action.type === 'foreign-aid') {
    actor.coins += 2;
    gs.lastEvent = { type: 'resolved', action: 'foreign-aid', player: action.actor };
  } else if (action.type === 'tax') {
    actor.coins += 3;
    gs.lastEvent = { type: 'resolved', action: 'tax', player: action.actor };
  } else if (action.type === 'steal') {
    const target = gs.playerStates[action.target];
    const stolen = Math.min(2, target.coins);
    target.coins -= stolen;
    actor.coins += stolen;
    gs.lastEvent = { type: 'resolved', action: 'steal', player: action.actor, target: action.target };
  } else if (action.type === 'assassinate') {
    // Target must lose a card
    gs.pendingAction = action;
    gs.phase = 'losing-card';
    return { success: true, awaitingLoseCard: action.target };
  } else if (action.type === 'exchange') {
    // Draw 2 from deck, player picks which to keep
    const drawn = [];
    for (let i = 0; i < 2 && gs.deck.length > 0; i++) {
      drawn.push(gs.deck.pop());
    }
    const aliveCards = actor.cards.filter((_, i) => !actor.revealed[i]);
    gs.exchangeOptions = [...aliveCards, ...drawn];
    gs.exchangeCount = aliveCards.length; // how many to keep
    gs.exchangeReturn = drawn.length; // how many to return
    gs.phase = 'exchange';
    gs.lastEvent = { type: 'exchange-pending', player: action.actor };
    return { success: true, awaitingExchange: action.actor };
  }

  gs.pendingAction = null;
  nextAliveTurn(gs);
  gs.phase = 'action';
  checkWin(gs);
  return { success: true, resolved: true };
}

function exchangeCards(room, playerId, keptCards) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'exchange') return null;
  if (gs.pendingAction.actor !== playerId) return null;
  if (!keptCards || keptCards.length !== gs.exchangeCount) return null;

  const ps = gs.playerStates[playerId];

  // Validate choices are from exchange options
  const options = [...gs.exchangeOptions];
  for (const card of keptCards) {
    const idx = options.indexOf(card);
    if (idx === -1) return null;
    options.splice(idx, 1);
  }

  // Return unchosen cards to deck
  for (const card of options) {
    gs.deck.push(card);
  }
  gs.deck = shuffle(gs.deck);

  // Update player's hand
  let keptIdx = 0;
  for (let i = 0; i < ps.cards.length; i++) {
    if (!ps.revealed[i]) {
      ps.cards[i] = keptCards[keptIdx++];
    }
  }

  gs.exchangeOptions = null;
  gs.exchangeCount = null;
  gs.pendingAction = null;
  gs.lastEvent = { type: 'exchange-done', player: playerId };
  gs.actionLog.push({ player: ps.name, action: 'Exchanged', detail: 'cards swapped' });
  nextAliveTurn(gs);
  gs.phase = 'action';
  checkWin(gs);
  return { success: true };
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];
  const myState = gs.playerStates[playerId];

  // Determine who needs to act
  let awaitingAction = null;
  if (gs.phase === 'losing-card') {
    if (gs.pendingChallenge) awaitingAction = gs.pendingChallenge.loser;
    else if (gs.pendingAction) awaitingAction = gs.pendingAction.target;
  } else if (gs.phase === 'exchange') {
    awaitingAction = gs.pendingAction.actor;
  }

  return {
    phase: gs.phase,
    myCards: myState ? myState.cards : [],
    myRevealed: myState ? myState.revealed : [],
    myCoins: myState ? myState.coins : 0,
    isMyTurn: currentPlayerId === playerId,
    currentPlayerId,
    players: gs.playerOrder.map(id => {
      const ps = gs.playerStates[id];
      return {
        id,
        name: ps.name,
        avatar: ps.avatar,
        coins: ps.coins,
        cardCount: ps.cards.filter((_, i) => !ps.revealed[i]).length,
        revealedCards: ps.cards.filter((_, i) => ps.revealed[i]),
        alive: isAlive(ps),
        isCurrentTurn: id === currentPlayerId
      };
    }),
    pendingAction: gs.pendingAction ? {
      type: gs.pendingAction.type,
      actor: gs.pendingAction.actor,
      target: gs.pendingAction.target,
      claimedRole: gs.pendingAction.claimedRole
    } : null,
    pendingCounter: gs.pendingCounter ? {
      blocker: gs.pendingCounter.blocker,
      claimedRole: gs.pendingCounter.claimedRole
    } : null,
    awaitingAction,
    canChallenge: gs.phase === 'challenge' && gs.challengeResponders.includes(playerId),
    canCounter: gs.phase === 'counteraction' && gs.counterResponders.includes(playerId),
    canCounterChallenge: gs.phase === 'counter-challenge' && gs.challengeResponders.includes(playerId),
    mustLoseCard: gs.phase === 'losing-card' && awaitingAction === playerId,
    exchangeOptions: gs.phase === 'exchange' && gs.pendingAction.actor === playerId ? gs.exchangeOptions : null,
    exchangeCount: gs.exchangeCount,
    actionLog: gs.actionLog.slice(-10),
    lastEvent: gs.lastEvent,
    winner: gs.winner
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [], gameType: 'coup' };

  const alive = gs.playerOrder.filter(id => isAlive(gs.playerStates[id]));
  const dead = gs.playerOrder.filter(id => !isAlive(gs.playerStates[id]));

  const results = [];
  alive.forEach((id, i) => {
    const p = room.players.find(pl => pl.id === id);
    if (p) results.push({ rank: '1st', name: p.name, score: 1, isHost: p.isHost });
  });
  dead.reverse().forEach((id, i) => {
    const p = room.players.find(pl => pl.id === id);
    const rank = results.length + 1;
    if (p) results.push({ rank: rank <= 3 ? ['1st', '2nd', '3rd'][rank - 1] : `${rank}th`, name: p.name, score: 0, isHost: p.isHost });
  });

  return { players: results, gameType: 'coup' };
}

module.exports = { init, takeAction, respondChallenge, respondCounter, respondCounterChallenge, loseCard, exchangeCards, getPlayerView, getResults };
