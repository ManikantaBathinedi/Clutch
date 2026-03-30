// ─── WORDLE SERVER LOGIC ───
// Multiplayer Wordle: all players guess the same hidden word. Compete for fewest guesses.

const WORD_LIST = [
  'ABOUT','ABOVE','ABUSE','ACTOR','ACUTE','ADMIT','ADOPT','ADULT','AFTER','AGAIN',
  'AGENT','AGREE','AHEAD','ALARM','ALBUM','ALERT','ALIEN','ALIGN','ALIVE','ALLEY',
  'ALLOW','ALONE','ALONG','ALTER','AMONG','ANGEL','ANGER','ANGLE','ANGRY','APART',
  'APPLE','APPLY','ARENA','ARGUE','ARISE','ARMOR','ARRAY','ASIDE','ASSET','AVOID',
  'AWARD','AWARE','BADLY','BAKER','BASIC','BASIS','BEACH','BEGIN','BEING','BELOW',
  'BENCH','BIBLE','BIRTH','BLACK','BLADE','BLAME','BLANK','BLAST','BLAZE','BLEED',
  'BLEND','BLESS','BLIND','BLOCK','BLOOD','BLOOM','BLOWN','BOARD','BONUS','BOOTH',
  'BOUND','BRAIN','BRAND','BRAVE','BREAD','BREAK','BREED','BRICK','BRIDE','BRIEF',
  'BRING','BROAD','BROKE','BROWN','BRUSH','BUILD','BUNCH','BURST','BUYER','CABIN',
  'CABLE','CARRY','CATCH','CAUSE','CEDAR','CHAIN','CHAIR','CHARM','CHART','CHASE',
  'CHEAP','CHECK','CHEEK','CHEST','CHIEF','CHILD','CHINA','CHUNK','CIVIL','CLAIM',
  'CLASS','CLEAN','CLEAR','CLIMB','CLING','CLOCK','CLONE','CLOSE','CLOUD','COACH',
  'COAST','COLOR','COUCH','COULD','COUNT','COURT','COVER','CRACK','CRAFT','CRANE',
  'CRASH','CRAZY','CREAM','CRIME','CROSS','CROWD','CROWN','CRUDE','CRUSH','CURVE',
  'CYCLE','DAILY','DANCE','DATUM','DEBUG','DECOR','DELAY','DEMON','DEPTH','DERBY',
  'DEVIL','DIARY','DIRTY','DITCH','DIZZY','DONOR','DOUBT','DOUGH','DRAFT','DRAIN',
  'DRAMA','DRANK','DRAWN','DREAM','DRESS','DRIED','DRIFT','DRILL','DRINK','DRIVE',
  'DROPS','DROVE','DRUGS','DRUNK','DRIED','DUSTY','DWARF','DYING','EAGER','EARLY',
  'EARTH','EIGHT','ELDER','ELECT','ELITE','EMPTY','ENEMY','ENJOY','ENTER','ENTRY',
  'EQUAL','ERROR','EVENT','EVERY','EXACT','EXILE','EXIST','EXTRA','FACED','FAINT',
  'FAITH','FALSE','FANCY','FATAL','FAULT','FEAST','FENCE','FEWER','FIBER','FIELD',
  'FIFTH','FIFTY','FIGHT','FINAL','FIRST','FIXED','FLAGS','FLAME','FLASH','FLESH',
  'FLOAT','FLOOD','FLOOR','FLOUR','FLUID','FLUSH','FLY','FOCUS','FORCE','FORGE',
  'FORTH','FORUM','FOUND','FRAME','FRANK','FRAUD','FRESH','FRONT','FROZE','FRUIT',
  'FULLY','FUNNY','GHOST','GIANT','GIVEN','GLAD','GLASS','GLOBE','GLOOM','GLORY',
  'GLOVE','GOING','GRACE','GRADE','GRAIN','GRAND','GRANT','GRAPE','GRAPH','GRASP',
  'GRASS','GRAVE','GREAT','GREEN','GRIEF','GRIND','GROOM','GROSS','GROUP','GROWN',
  'GUARD','GUESS','GUEST','GUIDE','GUILT','HABIT','HAPPY','HARSH','HASTY','HAVEN',
  'HEART','HEAVY','HELLO','HENCE','HOBBY','HONOR','HORSE','HOTEL','HOUSE','HUMAN',
  'HUMOR','HURRY','IDEAL','IMAGE','IMPLY','INDEX','INDIE','INNER','INPUT','IRONY',
  'ISSUE','IVORY','JEWEL','JOINT','JUDGE','JUICE','JUICY','KNOCK','KNOWN','LABEL',
  'LARGE','LASER','LATER','LAUGH','LAYER','LEARN','LEASE','LEGAL','LEMON','LEVEL',
  'LIGHT','LIMIT','LIVER','LOBBY','LOCAL','LODGE','LOGIC','LOGIN','LONGE','LOOSE',
  'LOVER','LOWER','LUCKY','LUNAR','LUNCH','LYING','MAGIC','MAJOR','MAKER','MANOR',
  'MAPLE','MARCH','MATCH','MAYOR','MEDAL','MEDIA','MERCY','MERGE','METAL','METER',
  'MIGHT','MINOR','MINUS','MIXED','MODEL','MONEY','MONTH','MORAL','MOTOR','MOUNT',
  'MOUSE','MOUTH','MOVED','MOVIE','MUDDY','MULTI','MUSIC','NAIVE','NAMED','NASTY',
  'NAVAL','NERVE','NEVER','NEWLY','NIGHT','NOBLE','NOISE','NORTH','NOTED','NOVEL',
  'NURSE','OCEAN','OFFER','OFTEN','ORDER','OTHER','OUGHT','OUTER','OWNER','OXIDE',
  'PAINT','PANEL','PANIC','PAPER','PARTY','PASTA','PATCH','PAUSE','PEACE','PEACH',
  'PENNY','PHASE','PHONE','PHOTO','PIANO','PIECE','PILOT','PINCH','PITCH','PIXEL',
  'PIZZA','PLACE','PLAIN','PLANE','PLANT','PLATE','PLAZA','PLEAD','PLUCK','PLUMB',
  'PLUME','PLUMP','PLUNGE','POINT','POLAR','POUND','POWER','PRESS','PRICE','PRIDE',
  'PRIME','PRINCE','PRINT','PRIOR','PRIZE','PROBE','PROOF','PROUD','PROVE','PROXY',
  'PSALM','PULSE','PUNCH','PUPIL','PURSE','PUSH','QUEEN','QUERY','QUEST','QUEUE',
  'QUICK','QUIET','QUOTA','QUOTE','RADAR','RADIO','RAISE','RALLY','RANCH','RANGE',
  'RAPID','RATIO','REACH','READY','REALM','REBEL','REFER','REIGN','RELAX','RENEW',
  'REPLY','RIDER','RIDGE','RIFLE','RIGHT','RIGID','RISEN','RISKY','RIVAL','RIVER',
  'ROBOT','ROCKY','ROGER','ROMAN','ROUGH','ROUND','ROUTE','ROYAL','RUGBY','RULER',
  'RURAL','SADLY','SAINT','SALAD','SCALE','SCENE','SCOPE','SCORE','SCOUT','SCREW',
  'SEIZE','SENSE','SERVE','SETUP','SEVEN','SHALL','SHAME','SHAPE','SHARE','SHARK',
  'SHARP','SHEAR','SHEET','SHELF','SHELL','SHIFT','SHINE','SHIRT','SHOCK','SHOOT',
  'SHORT','SHOUT','SIGHT','SINCE','SIXTH','SIXTY','SIZED','SKILL','SKULL','SLATE',
  'SLAVE','SLEEP','SLICE','SLIDE','SLOPE','SMALL','SMART','SMELL','SMILE','SMOKE',
  'SNAKE','SOLAR','SOLID','SOLVE','SORRY','SOUND','SOUTH','SPACE','SPARE','SPARK',
  'SPEAK','SPEED','SPELL','SPEND','SPENT','SPICE','SPINE','SPLIT','SPOKE','SPOON',
  'SPORT','SPRAY','SQUAD','STACK','STAFF','STAGE','STAIN','STAKE','STALE','STALL',
  'STAMP','STAND','STARE','START','STATE','STAVE','STEAL','STEAM','STEEL','STEEP',
  'STEER','STERN','STICK','STILL','STOCK','STOLE','STONE','STOOD','STORE','STORM',
  'STORY','STOVE','STRIP','STUCK','STUDY','STUFF','STYLE','SUGAR','SUITE','SUPER',
  'SURGE','SWAMP','SWEAR','SWEEP','SWEET','SWEPT','SWIFT','SWING','SWORD','SWORE',
  'SWORN','SYRUP','TABLE','TAKEN','TASTE','TEACH','TEMPO','TENSE','TERMS','THEFT',
  'THEIR','THEME','THICK','THIEF','THING','THINK','THIRD','THORN','THREE','THREW',
  'THROW','THUMB','TIGHT','TIMER','TIRED','TITLE','TOAST','TODAY','TOKEN','TOTAL',
  'TOUCH','TOUGH','TOWEL','TOWER','TOXIC','TRACE','TRACK','TRADE','TRAIL','TRAIN',
  'TRAIT','TRASH','TREAT','TREND','TRIAL','TRIBE','TRICK','TRIED','TROOP','TRUCK',
  'TRULY','TRUMP','TRUNK','TRUST','TRUTH','TUMOR','TWICE','TWIST','TYING','ULTRA',
  'UNCLE','UNDER','UNIFY','UNION','UNITE','UNITY','UNTIL','UPPER','UPSET','URBAN',
  'USAGE','USUAL','VALID','VALUE','VALVE','VAULT','VENUE','VERSE','VIDEO','VIGOR',
  'VIRAL','VIRUS','VISIT','VITAL','VIVID','VOCAL','VODKA','VOICE','VOTER','WAIST',
  'WASTE','WATCH','WATER','WEAVE','WEIGH','WEIRD','WHEAT','WHEEL','WHERE','WHICH',
  'WHILE','WHITE','WHOLE','WHOSE','WIDER','WITCH','WOMAN','WORLD','WORRY','WORSE',
  'WORST','WORTH','WOULD','WOUND','WRATH','WRITE','WRONG','WROTE','YACHT','YIELD',
  'YOUNG','YOUTH','ZEBRA',
  // Extended common words
  'TASTY','TANGY','SALTY','JAZZY','FIZZY','TIPSY','BOOZY','GIDDY','PEAKY','CORNY',
  'FUNKY','NERDY','WITTY','BUSHY','FOGGY','FUZZY','GUSTY','HEFTY','JERKY','LANKY',
  'LOUSY','MESSY','MUSHY','NOISY','NUTTY','PESKY','RATTY','ROWDY','RUSTY','SASSY',
  'SHADY','SILLY','SISSY','SMOKY','SPICY','TACKY','TATTY','TESTY','WACKY','WEEDY',
  'WIMPY','ZINGY','BOSSY','CATTY','CHEWY','CORKY','CURVY','DITZY','DORKY','FLAKY',
  'FUSSY','GASSY','GEEKY','GOOEY','GRIMY','GUSHY','GUTSY','HAMMY','HANDY','HUSKY',
  'ITCHY','KINKY','LEAFY','MANGY','MEATY','MILKY','MUCKY','NERVY','NIPPY','PICKY',
  'PUSHY','PUFFY','PUNKY','RAINY','REEDY','SAUCY','SEEDY','SHAKY','SILKY','SNAKY',
  'SOGGY','SPIKY','SUDSY','TEARY','TIPPY','TOADY','WEARY','WINDY','WOODY','WORDY',
  'ZESTY','RISKY','EDGY','OILY','WAVY'
].filter(w => w.length === 5);

const MAX_GUESSES = 6;

function init(room, settings) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  if (activePlayers.length < 1) return;

  const rounds = (settings && settings.rounds) || 3;
  const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)].toUpperCase();

  const playerOrder = activePlayers.map(p => p.id);
  const playerStates = {};
  for (const p of activePlayers) {
    playerStates[p.id] = {
      name: p.name,
      avatar: p.avatar || '📝',
      guesses: [],     // array of { word, result } 
      solved: false,
      guessCount: 0
    };
  }

  room.gameState = {
    word,
    playerOrder,
    playerStates,
    currentRound: 1,
    totalRounds: rounds,
    phase: 'guessing', // guessing, reveal, finished
    maxGuesses: MAX_GUESSES,
    roundResults: [],
    allWords: [] // track used words across rounds
  };
}

function evaluateGuess(guess, word) {
  // Returns array of {letter, status} where status is 'correct', 'present', 'absent'
  const result = [];
  const wordArr = word.split('');
  const guessArr = guess.split('');
  const used = Array(5).fill(false);

  // First pass: correct positions
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === wordArr[i]) {
      result[i] = { letter: guessArr[i], status: 'correct' };
      used[i] = true;
    }
  }

  // Second pass: wrong position
  for (let i = 0; i < 5; i++) {
    if (result[i]) continue;
    const idx = wordArr.findIndex((l, j) => l === guessArr[i] && !used[j]);
    if (idx !== -1) {
      result[i] = { letter: guessArr[i], status: 'present' };
      used[idx] = true;
    } else {
      result[i] = { letter: guessArr[i], status: 'absent' };
    }
  }

  return result;
}

function submitGuess(room, playerId, guess) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'guessing') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || ps.solved || ps.guessCount >= gs.maxGuesses) return null;

  guess = (guess || '').toUpperCase().trim();
  if (guess.length !== 5 || !/^[A-Z]+$/.test(guess)) return null;

  // Validate: must be a real word from the word list
  if (!WORD_LIST.includes(guess)) return { error: 'Not a valid word' };

  const result = evaluateGuess(guess, gs.word);
  ps.guesses.push({ word: guess, result });
  ps.guessCount++;

  const isCorrect = result.every(r => r.status === 'correct');
  if (isCorrect) {
    ps.solved = true;
    // Score: fewer guesses = more points
    const points = (gs.maxGuesses - ps.guessCount + 1) * 10;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.score = (player.score || 0) + points;
  }

  // Check if all players done (solved or out of guesses)
  const allDone = gs.playerOrder.every(id => {
    const s = gs.playerStates[id];
    return s.solved || s.guessCount >= gs.maxGuesses;
  });

  if (allDone) {
    gs.phase = 'reveal';
    gs.roundResults.push({
      word: gs.word,
      players: gs.playerOrder.map(id => ({
        id,
        name: gs.playerStates[id].name,
        solved: gs.playerStates[id].solved,
        guessCount: gs.playerStates[id].guessCount
      }))
    });
  }

  return {
    success: true,
    result,
    solved: isCorrect,
    guessCount: ps.guessCount,
    allDone
  };
}

function nextRound(room) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'reveal') return false;

  if (gs.currentRound >= gs.totalRounds) {
    gs.phase = 'finished';
    return false;
  }

  gs.currentRound++;
  gs.allWords.push(gs.word);

  // New word
  let word;
  do {
    word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)].toUpperCase();
  } while (gs.allWords.includes(word));
  gs.word = word;

  // Reset player states
  for (const id of gs.playerOrder) {
    gs.playerStates[id].guesses = [];
    gs.playerStates[id].solved = false;
    gs.playerStates[id].guessCount = 0;
  }

  gs.phase = 'guessing';
  return true;
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const ps = gs.playerStates[playerId];
  const showWord = gs.phase === 'reveal' || gs.phase === 'finished';

  // Build keyboard status from guesses
  const keyboard = {};
  if (ps) {
    for (const guess of ps.guesses) {
      for (const { letter, status } of guess.result) {
        const current = keyboard[letter];
        if (status === 'correct') keyboard[letter] = 'correct';
        else if (status === 'present' && current !== 'correct') keyboard[letter] = 'present';
        else if (!current) keyboard[letter] = 'absent';
      }
    }
  }

  return {
    phase: gs.phase,
    currentRound: gs.currentRound,
    totalRounds: gs.totalRounds,
    maxGuesses: gs.maxGuesses,
    myGuesses: ps ? ps.guesses : [],
    mySolved: ps ? ps.solved : false,
    myGuessCount: ps ? ps.guessCount : 0,
    keyboard,
    word: showWord ? gs.word : null,
    players: gs.playerOrder.map(id => {
      const s = gs.playerStates[id];
      return {
        id,
        name: s.name,
        avatar: s.avatar,
        solved: s.solved,
        guessCount: s.guessCount,
        // Show other players' boards during reveal
        guesses: showWord ? s.guesses : null
      };
    }),
    roundResults: gs.roundResults
  };
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return { players: [], gameType: 'wordle' };

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
    gameType: 'wordle'
  };
}

module.exports = { init, submitGuess, nextRound, getPlayerView, getResults };
