// ─── KING'S CUP SERVER LOGIC ───
const CARD_RULES = {
  'A':  { title: 'Waterfall', rule: 'Everyone starts drinking. You can only stop when the person before you stops!' },
  '2':  { title: 'You', rule: 'Pick someone to drink!' },
  '3':  { title: 'Me', rule: 'You drink!' },
  '4':  { title: 'Floor', rule: 'Last person to touch the floor drinks!' },
  '5':  { title: 'Guys', rule: 'All guys drink!' },
  '6':  { title: 'Chicks', rule: 'All girls drink!' },
  '7':  { title: 'Heaven', rule: 'Last person to raise their hand drinks!' },
  '8':  { title: 'Mate', rule: 'Pick a drinking buddy — they drink when you drink for the rest of the game!' },
  '9':  { title: 'Rhyme', rule: 'Say a word. Go around — everyone must rhyme. First to fail drinks!' },
  '10': { title: 'Categories', rule: 'Pick a category (e.g. car brands). Go around — first to fail drinks!' },
  'J':  { title: 'Make a Rule', rule: 'Create a rule everyone must follow. Violators drink!' },
  'Q':  { title: 'Question Master', rule: 'You are the Question Master. Anyone who answers your questions must drink!' },
  'K':  { title: 'King\'s Cup', rule: 'Pour some of your drink into the King\'s Cup. 4th King = chug it all!' }
};

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function init(room) {
  const players = room.players.filter(p => !p.isSpectator);
  if (players.length < 2) return;

  const deck = buildDeck();
  const playerOrder = players.map(p => p.id).sort(() => Math.random() - 0.5);

  room.gameState = {
    deck,
    drawnCards: [],
    currentTurn: 0,
    playerOrder,
    kingsDrawn: 0,
    currentCard: null,
    phase: 'draw', // draw or reveal
    gameOver: false
  };
}

function getCurrentQuestion(room) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPlayerId = gs.playerOrder[gs.currentTurn % gs.playerOrder.length];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  return {
    phase: gs.phase,
    currentPlayerId,
    currentPlayerName: currentPlayer ? currentPlayer.name : 'Unknown',
    cardsLeft: gs.deck.length,
    totalCards: 52,
    kingsDrawn: gs.kingsDrawn,
    currentCard: gs.phase === 'reveal' ? gs.currentCard : null,
    cardRule: gs.phase === 'reveal' && gs.currentCard ? CARD_RULES[gs.currentCard.value] : null,
    drawnCount: gs.drawnCards.length
  };
}

function handleAnswer(room, playerId, answer) {
  const gs = room.gameState;
  if (!gs || gs.gameOver) return null;

  const expectedPlayer = gs.playerOrder[gs.currentTurn % gs.playerOrder.length];
  if (playerId !== expectedPlayer) return null;

  if (answer === 'draw' && gs.phase === 'draw') {
    if (gs.deck.length === 0) return null;
    gs.currentCard = gs.deck.pop();
    gs.drawnCards.push(gs.currentCard);
    gs.phase = 'reveal';
    if (gs.currentCard.value === 'K') gs.kingsDrawn++;
    if (gs.kingsDrawn >= 4 || gs.deck.length === 0) gs.gameOver = true;
    return { action: 'reveal' };
  }

  if (answer === 'next' && gs.phase === 'reveal') {
    if (gs.gameOver) return { action: 'gameover' };
    gs.phase = 'draw';
    gs.currentTurn++;
    gs.currentCard = null;
    return { action: 'next' };
  }

  return null;
}

function getRoundResults(room) {
  return getCurrentQuestion(room);
}

function nextRound(room) {
  const gs = room.gameState;
  if (!gs || gs.gameOver || gs.deck.length === 0) return false;
  return true;
}

function getResults(room) {
  const gs = room.gameState;
  return {
    players: room.players.filter(p => !p.isSpectator).map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: 0,
      isHost: p.isHost
    })),
    kingsDrawn: gs ? gs.kingsDrawn : 0,
    cardsDrawn: gs ? gs.drawnCards.length : 0,
    gameType: 'kingscup'
  };
}

module.exports = { init, getCurrentQuestion, handleAnswer, getRoundResults, nextRound, getResults };
