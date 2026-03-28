// Codenames — Server-side game logic
const GRID_SIZE = 25; // 5x5

const WORD_BANK = [
  'APPLE','BANK','BARK','BAT','BEAR','BED','BELL','BERRY','BOARD','BOLT',
  'BOMB','BOND','BOOT','BOW','BOX','BRIDGE','BRUSH','BUG','BUTTON','CAB',
  'CAKE','CAP','CARD','CAST','CAT','CELL','CHAIR','CHANGE','CHARGE','CHECK',
  'CHEST','CHINA','CIRCLE','CLIFF','CLOCK','CLOUD','CLUB','COACH','COAL','COAT',
  'COLD','COMIC','COMPOUND','CONCERT','CONDUCTOR','COPPER','COTTON','COURT','COVER','CRANE',
  'CRASH','CRICKET','CROSS','CROWN','CYCLE','DANCE','DATE','DAY','DEATH','DECK',
  'DEGREE','DIAMOND','DICE','DINOSAUR','DISEASE','DOCTOR','DOG','DRAFT','DRAGON','DRESS',
  'DRILL','DROP','DRUM','DUCK','DWARF','EAGLE','ENGINE','EYE','FACE','FAIR',
  'FALL','FAN','FENCE','FIELD','FIGHTER','FIGURE','FILE','FILM','FIRE','FISH',
  'FLY','FOOT','FORCE','FOREST','FORK','FOX','FRAME','GAME','GARDEN','GAS',
  'GENIUS','GHOST','GIANT','GLASS','GLOVE','GOLD','GRACE','GRASS','GREEN','GROUND',
  'GUM','HALL','HAND','HAWK','HEAD','HEART','HELICOPTER','HERO','HOLE','HOOD',
  'HOOK','HORN','HORSE','HOSPITAL','HOTEL','ICE','IRON','JACK','JAM','JET',
  'JUDGE','JUNGLE','KEY','KICK','KID','KING','KITE','KNIGHT','KNIFE','LAB',
  'LAP','LEMON','LETTER','LIFE','LIGHT','LINE','LINK','LION','LOCK','LOG',
  'LUCK','MAIL','MAPLE','MARCH','MARK','MASS','MATCH','MERCURY','MICROSCOPE','MINE',
  'MINT','MISSILE','MODEL','MOLE','MOON','MOUNT','MOUSE','MOUTH','MUG','NAIL',
  'NET','NIGHT','NOTE','NOVEL','NURSE','NUT','OCTOPUS','OIL','OLIVE','OPERA',
  'ORANGE','ORGAN','PALM','PAN','PANTS','PAPER','PARK','PASS','PASTE','PENGUIN',
  'PHOENIX','PIANO','PIE','PILOT','PIN','PIPE','PIRATE','PIT','PLATE','PLAY',
  'PLOT','POINT','POISON','POLE','POOL','PORT','POST','POUND','PRESS','PRINCE',
  'PRINT','PUMP','QUEEN','RACE','RAIN','RANCH','RAY','REVOLUTION','RING','ROBIN',
  'ROCK','ROLL','ROME','ROOT','ROSE','ROUND','ROW','RULER','SALE','SALT',
  'SATELLITE','SATURN','SCALE','SCHOOL','SCORPION','SCREEN','SEAL','SERVER','SHADOW','SHARK',
  'SHED','SHELL','SHIP','SHOE','SHOP','SHOT','SHOW','SIDE','SILK','SILVER',
  'SINK','SLIP','SLUG','SMUGGLER','SNOW','SOLDIER','SOUL','SPACE','SPELL','SPIDER',
  'SPIKE','SPOT','SPRING','SPY','SQUARE','STAFF','STAR','STATE','STEAK','STEEL',
  'STICK','STOCK','STONE','STORM','STORY','STREAM','STRIKE','STRING','SUB','SUIT',
  'SUPER','SWING','SWITCH','TABLE','TAIL','TAP','TEMPLE','THEATER','THUMB','TICK',
  'TIE','TIGER','TIME','TOAST','TOOTH','TORCH','TOWER','TRACK','TRAIN','TREE',
  'TRIANGLE','TRIP','TRUNK','TUBE','TURKEY','UNICORN','VAN','VET','VIOLIN','VIRUS',
  'WALL','WASH','WATCH','WATER','WAVE','WEB','WHALE','WHEAT','WHIP','WIND',
  'WITCH','WOLF','WOOD','WORM','YARD','ZERO'
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function init(room) {
  // Pick 25 random words
  const words = shuffle(WORD_BANK).slice(0, GRID_SIZE);

  // Randomly decide who goes first (that team gets 9 cards, other gets 8)
  const firstTeam = Math.random() < 0.5 ? 'red' : 'blue';
  const secondTeam = firstTeam === 'red' ? 'blue' : 'red';

  // Assign card types: 9 first-team, 8 second-team, 7 bystander, 1 assassin
  const types = [];
  for (let i = 0; i < 9; i++) types.push(firstTeam);
  for (let i = 0; i < 8; i++) types.push(secondTeam);
  for (let i = 0; i < 7; i++) types.push('bystander');
  types.push('assassin');
  const shuffledTypes = shuffle(types);

  const cards = words.map((word, i) => ({
    word,
    type: shuffledTypes[i],
    revealed: false
  }));

  room.gameState = {
    cards,
    teams: { red: [], blue: [] },
    spymasters: { red: null, blue: null },
    currentTeam: firstTeam,
    remaining: { red: firstTeam === 'red' ? 9 : 8, blue: firstTeam === 'blue' ? 9 : 8 },
    clue: null,
    guessesLeft: 0,
    phase: 'team-select', // team-select -> clue -> guess -> clue -> guess ... -> over
    winner: null,
    totalRounds: 1,
    currentRound: 0
  };
}

function joinTeam(room, playerId, team) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'team-select') return null;
  if (team !== 'red' && team !== 'blue') return null;

  // Remove from other team if present
  gs.teams.red = gs.teams.red.filter(id => id !== playerId);
  gs.teams.blue = gs.teams.blue.filter(id => id !== playerId);

  // Remove from spymaster if was one
  if (gs.spymasters.red === playerId) gs.spymasters.red = null;
  if (gs.spymasters.blue === playerId) gs.spymasters.blue = null;

  gs.teams[team].push(playerId);

  return getTeamState(room);
}

function setSpymaster(room, playerId, team) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'team-select') return null;

  // Must be on the team
  if (!gs.teams[team].includes(playerId)) return null;

  gs.spymasters[team] = playerId;
  return getTeamState(room);
}

function startGame(room) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'team-select') return null;

  // Need at least 1 player per team and both spymasters
  if (gs.teams.red.length < 1 || gs.teams.blue.length < 1) return null;
  if (!gs.spymasters.red || !gs.spymasters.blue) return null;

  gs.phase = 'clue';
  return true;
}

function getTeamState(room) {
  const gs = room.gameState;
  const getNames = (ids) => ids.map(id => {
    const p = room.players.find(pl => pl.id === id);
    return p ? p.name : 'Unknown';
  });

  return {
    phase: gs.phase,
    currentTeam: gs.currentTeam,
    teams: {
      red: { players: getNames(gs.teams.red), spymaster: gs.spymasters.red ? room.players.find(p => p.id === gs.spymasters.red)?.name : null },
      blue: { players: getNames(gs.teams.blue), spymaster: gs.spymasters.blue ? room.players.find(p => p.id === gs.spymasters.blue)?.name : null }
    },
    remaining: gs.remaining
  };
}

function getGameState(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const isSpymaster = playerId === gs.spymasters.red || playerId === gs.spymasters.blue;
  const playerTeam = gs.teams.red.includes(playerId) ? 'red' : gs.teams.blue.includes(playerId) ? 'blue' : null;

  return {
    phase: gs.phase,
    currentTeam: gs.currentTeam,
    cards: gs.cards.map(c => ({
      word: c.word,
      revealed: c.revealed,
      type: (c.revealed || isSpymaster) ? c.type : null
    })),
    remaining: gs.remaining,
    clue: gs.clue,
    guessesLeft: gs.guessesLeft,
    isSpymaster,
    playerTeam,
    winner: gs.winner,
    teams: getTeamState(room).teams
  };
}

function giveClue(room, playerId, word, number) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'clue') return null;
  if (playerId !== gs.spymasters[gs.currentTeam]) return null;

  // Validate clue
  if (!word || typeof word !== 'string') return null;
  const cleanWord = word.trim().toUpperCase();
  if (cleanWord.length === 0 || cleanWord.length > 30) return null;

  // Number must be 0-9 or unlimited
  const num = parseInt(number, 10);
  if (isNaN(num) || num < 0 || num > 9) return null;

  gs.clue = { word: cleanWord, number: num };
  gs.guessesLeft = num === 0 ? 99 : num + 1; // +1 bonus guess
  gs.phase = 'guess';

  return { clue: gs.clue, guessesLeft: gs.guessesLeft };
}

function pickCard(room, playerId, cardIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'guess') return null;

  // Must be on current team and NOT spymaster
  const playerTeam = gs.teams.red.includes(playerId) ? 'red' : gs.teams.blue.includes(playerId) ? 'blue' : null;
  if (playerTeam !== gs.currentTeam) return null;
  if (playerId === gs.spymasters[gs.currentTeam]) return null;

  if (cardIndex < 0 || cardIndex >= gs.cards.length) return null;
  const card = gs.cards[cardIndex];
  if (card.revealed) return null;

  card.revealed = true;

  const result = {
    cardIndex,
    word: card.word,
    type: card.type,
    remaining: gs.remaining,
    currentTeam: gs.currentTeam,
    gameOver: false,
    winner: null,
    turnEnded: false
  };

  // Handle card type
  if (card.type === 'assassin') {
    // Team that picked assassin loses
    gs.winner = gs.currentTeam === 'red' ? 'blue' : 'red';
    gs.phase = 'over';
    result.gameOver = true;
    result.winner = gs.winner;
  } else if (card.type === gs.currentTeam) {
    // Correct guess
    gs.remaining[gs.currentTeam]--;
    gs.guessesLeft--;
    result.remaining = gs.remaining;

    if (gs.remaining[gs.currentTeam] === 0) {
      gs.winner = gs.currentTeam;
      gs.phase = 'over';
      result.gameOver = true;
      result.winner = gs.winner;
    } else if (gs.guessesLeft <= 0) {
      // Out of guesses, switch turn
      switchTurn(gs);
      result.turnEnded = true;
    }
  } else {
    // Wrong team's card or bystander
    if (card.type === 'red' || card.type === 'blue') {
      gs.remaining[card.type]--;
      result.remaining = gs.remaining;

      if (gs.remaining[card.type] === 0) {
        gs.winner = card.type;
        gs.phase = 'over';
        result.gameOver = true;
        result.winner = gs.winner;
      }
    }
    // End turn
    if (!result.gameOver) {
      switchTurn(gs);
      result.turnEnded = true;
    }
  }

  result.currentTeam = gs.currentTeam;
  return result;
}

function endTurn(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'guess') return null;

  const playerTeam = gs.teams.red.includes(playerId) ? 'red' : gs.teams.blue.includes(playerId) ? 'blue' : null;
  if (playerTeam !== gs.currentTeam) return null;

  switchTurn(gs);
  return { currentTeam: gs.currentTeam, phase: gs.phase };
}

function switchTurn(gs) {
  gs.currentTeam = gs.currentTeam === 'red' ? 'blue' : 'red';
  gs.clue = null;
  gs.guessesLeft = 0;
  gs.phase = 'clue';
}

function getResults(room) {
  const gs = room.gameState;
  return {
    winner: gs.winner,
    cards: gs.cards,
    players: room.players.map(p => ({
      name: p.name,
      score: p.score,
      team: gs.teams.red.includes(p.id) ? 'red' : 'blue'
    }))
  };
}

module.exports = { init, joinTeam, setSpymaster, startGame, getGameState, giveClue, pickCard, endTurn, getResults };
