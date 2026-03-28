// ─── SPYFALL SERVER LOGIC ───
// One player is the spy and doesn't know the location.
// Others ask questions to find the spy without revealing the location.

const LOCATIONS = [
  { name: 'Beach', roles: ['Lifeguard', 'Surfer', 'Ice Cream Vendor', 'Tourist', 'Sandcastle Builder', 'Volleyball Player'] },
  { name: 'Hospital', roles: ['Doctor', 'Nurse', 'Patient', 'Surgeon', 'Receptionist', 'Paramedic'] },
  { name: 'School', roles: ['Teacher', 'Student', 'Principal', 'Janitor', 'Coach', 'Librarian'] },
  { name: 'Restaurant', roles: ['Chef', 'Waiter', 'Customer', 'Food Critic', 'Bartender', 'Dishwasher'] },
  { name: 'Airport', roles: ['Pilot', 'Flight Attendant', 'Passenger', 'Security Guard', 'Baggage Handler', 'Air Traffic Controller'] },
  { name: 'Movie Theater', roles: ['Projectionist', 'Ticket Seller', 'Popcorn Vendor', 'Moviegoer', 'Critic', 'Usher'] },
  { name: 'Supermarket', roles: ['Cashier', 'Manager', 'Stock Clerk', 'Shopper', 'Butcher', 'Baker'] },
  { name: 'Space Station', roles: ['Astronaut', 'Engineer', 'Scientist', 'Commander', 'Medic', 'Pilot'] },
  { name: 'Pirate Ship', roles: ['Captain', 'First Mate', 'Navigator', 'Cook', 'Deckhand', 'Lookout'] },
  { name: 'Zoo', roles: ['Zookeeper', 'Veterinarian', 'Visitor', 'Gift Shop Clerk', 'Tour Guide', 'Photographer'] },
  { name: 'Museum', roles: ['Curator', 'Tour Guide', 'Security Guard', 'Artist', 'Visitor', 'Restorer'] },
  { name: 'Farm', roles: ['Farmer', 'Veterinarian', 'Tractor Driver', 'Scarecrow', 'Harvester', 'Dairy Worker'] },
  { name: 'Casino', roles: ['Dealer', 'Gambler', 'Security', 'Bartender', 'Floor Manager', 'Entertainer'] },
  { name: 'Cruise Ship', roles: ['Captain', 'Passenger', 'Cook', 'Entertainer', 'Lifeguard', 'Navigator'] },
  { name: 'Circus', roles: ['Clown', 'Acrobat', 'Ringmaster', 'Lion Tamer', 'Audience Member', 'Ticket Seller'] },
  { name: 'Police Station', roles: ['Detective', 'Officer', 'Suspect', 'Lawyer', 'Chief', 'Dispatcher'] },
  { name: 'Ski Resort', roles: ['Skier', 'Instructor', 'Lift Operator', 'Snowboarder', 'Medic', 'Lodge Manager'] },
  { name: 'Gym', roles: ['Personal Trainer', 'Bodybuilder', 'Yoga Instructor', 'Receptionist', 'Member', 'Cleaner'] },
  { name: 'Library', roles: ['Librarian', 'Student', 'Author', 'Reader', 'Security', 'Volunteer'] },
  { name: 'Haunted House', roles: ['Ghost', 'Explorer', 'Exorcist', 'Owner', 'Tourist', 'Photographer'] }
];

const ROUND_TIME = 480; // 8 minutes per round
const POINTS_SPY_WINS = 300;
const POINTS_SPY_GUESSES_LOCATION = 500;
const POINTS_CATCH_SPY = 200;

function init(room, settings) {
  const rounds = (settings && settings.rounds) || 3;
  room.gameState = {
    currentRound: 0,
    totalRounds: rounds,
    location: null,
    spyId: null,
    playerRoles: {},
    votes: {},
    voteInProgress: false,
    voteTarget: null,
    voteResults: null,
    roundStartTime: null,
    roundTime: ROUND_TIME,
    phase: 'playing', // playing, voting, reveal
    askerIndex: 0,
    questionOrder: [],
    spyGuess: null,
    roundOver: false
  };
  setupRound(room);
}

function setupRound(room) {
  const gs = room.gameState;
  gs.currentRound++;

  // Pick a random location
  const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  gs.location = loc.name;

  // Pick a random spy
  const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
  gs.spyId = playerIds[Math.floor(Math.random() * playerIds.length)];

  // Assign roles
  gs.playerRoles = {};
  const availableRoles = [...loc.roles];
  playerIds.forEach(id => {
    if (id === gs.spyId) {
      gs.playerRoles[id] = 'Spy';
    } else {
      const roleIdx = Math.floor(Math.random() * availableRoles.length);
      gs.playerRoles[id] = availableRoles.splice(roleIdx, 1)[0] || 'Visitor';
    }
  });

  // Random question order
  gs.questionOrder = [...playerIds].sort(() => Math.random() - 0.5);
  gs.askerIndex = 0;
  gs.votes = {};
  gs.voteInProgress = false;
  gs.voteTarget = null;
  gs.voteResults = null;
  gs.spyGuess = null;
  gs.roundOver = false;
  gs.phase = 'playing';
  gs.roundStartTime = Date.now();
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const isSpy = playerId === gs.spyId;
  const currentAsker = gs.questionOrder[gs.askerIndex % gs.questionOrder.length];

  return {
    round: gs.currentRound,
    totalRounds: gs.totalRounds,
    location: isSpy ? null : gs.location,
    role: gs.playerRoles[playerId] || 'Unknown',
    isSpy,
    allLocations: LOCATIONS.map(l => l.name).sort(),
    currentAskerId: currentAsker,
    currentAskerName: room.players.find(p => p.id === currentAsker)?.name || '?',
    players: room.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar
    })),
    phase: gs.phase,
    voteInProgress: gs.voteInProgress,
    voteTarget: gs.voteTarget,
    voteTargetName: room.players.find(p => p.id === gs.voteTarget)?.name || null,
    votes: gs.voteInProgress ? gs.votes : {},
    totalVoters: room.players.filter(p => !p.isSpectator).length,
    timeLimit: gs.roundTime,
    roundStartTime: gs.roundStartTime,
    roundOver: gs.roundOver,
    voteResults: gs.voteResults,
    spyGuess: gs.spyGuess
  };
}

function advanceAsker(room) {
  room.gameState.askerIndex++;
}

function startVote(room, targetId) {
  const gs = room.gameState;
  if (gs.voteInProgress || gs.roundOver) return null;
  const target = room.players.find(p => p.id === targetId && !p.isSpectator);
  if (!target) return null;
  gs.voteInProgress = true;
  gs.voteTarget = targetId;
  gs.votes = {};
  return { targetId, targetName: target.name };
}

function castVote(room, playerId, vote) {
  const gs = room.gameState;
  if (!gs.voteInProgress || gs.votes[playerId] !== undefined) return null;
  const player = room.players.find(p => p.id === playerId && !p.isSpectator);
  if (!player) return null;

  gs.votes[playerId] = !!vote; // true = guilty, false = not guilty

  const activePlayers = room.players.filter(p => !p.isSpectator);
  const totalVotes = Object.keys(gs.votes).length;
  if (totalVotes < activePlayers.length) return { waiting: true, votesIn: totalVotes, total: activePlayers.length };

  // All votes in — resolve
  const yesVotes = Object.values(gs.votes).filter(v => v).length;
  const majority = yesVotes > activePlayers.length / 2;

  gs.voteInProgress = false;
  const result = {
    resolved: true,
    targetId: gs.voteTarget,
    targetName: room.players.find(p => p.id === gs.voteTarget)?.name,
    yesVotes,
    noVotes: totalVotes - yesVotes,
    caught: majority
  };

  if (majority) {
    // Voted someone out
    if (gs.voteTarget === gs.spyId) {
      // Caught the spy!
      result.spyCaught = true;
      result.location = gs.location;
      result.spyId = gs.spyId;
      result.spyName = room.players.find(p => p.id === gs.spyId)?.name;
      // Award points to non-spies
      room.players.forEach(p => {
        if (!p.isSpectator && p.id !== gs.spyId) {
          p.score += POINTS_CATCH_SPY;
        }
      });
      gs.roundOver = true;
      gs.phase = 'reveal';
    } else {
      // Wrong person — spy wins
      result.spyCaught = false;
      result.wrongTarget = true;
      result.spyId = gs.spyId;
      result.spyName = room.players.find(p => p.id === gs.spyId)?.name;
      result.location = gs.location;
      const spy = room.players.find(p => p.id === gs.spyId);
      if (spy) spy.score += POINTS_SPY_WINS;
      gs.roundOver = true;
      gs.phase = 'reveal';
    }
  }

  gs.voteResults = result;
  return result;
}

function spyGuessLocation(room, playerId, guess) {
  const gs = room.gameState;
  if (playerId !== gs.spyId || gs.roundOver) return null;

  const correct = guess.toLowerCase().trim() === gs.location.toLowerCase().trim();
  const result = {
    spyId: gs.spyId,
    spyName: room.players.find(p => p.id === gs.spyId)?.name,
    guess,
    location: gs.location,
    correct
  };

  if (correct) {
    const spy = room.players.find(p => p.id === gs.spyId);
    if (spy) spy.score += POINTS_SPY_GUESSES_LOCATION;
  } else {
    room.players.forEach(p => {
      if (!p.isSpectator && p.id !== gs.spyId) {
        p.score += POINTS_CATCH_SPY;
      }
    });
  }

  gs.spyGuess = result;
  gs.roundOver = true;
  gs.phase = 'reveal';
  return result;
}

function timeUp(room) {
  const gs = room.gameState;
  if (gs.roundOver) return null;
  // Time ran out — spy wins
  const spy = room.players.find(p => p.id === gs.spyId);
  if (spy) spy.score += POINTS_SPY_WINS;
  gs.roundOver = true;
  gs.phase = 'reveal';
  return {
    timeUp: true,
    spyId: gs.spyId,
    spyName: spy?.name,
    location: gs.location
  };
}

function nextRound(room) {
  const gs = room.gameState;
  if (gs.currentRound >= gs.totalRounds) return false;
  setupRound(room);
  return true;
}

function getResults(room) {
  const sorted = [...room.players].filter(p => !p.isSpectator).sort((a, b) => b.score - a.score);
  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score,
      isHost: p.isHost
    })),
    gameType: 'spyfall'
  };
}

module.exports = { init, getPlayerView, advanceAsker, startVote, castVote, spyGuessLocation, timeUp, nextRound, getResults };
