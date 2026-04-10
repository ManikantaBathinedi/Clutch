// ─── MAFIA SERVER LOGIC ───
// Classic social deduction: Town (Villagers, Doctor, Detective) vs Mafia.
// Night: Mafia votes to kill, Doctor protects, Detective investigates.
// Day: Discussion + vote to eliminate. Town wins when all Mafia gone; Mafia wins when they match Town count.

const ROLES = {
  MAFIA: 'mafia',
  DOCTOR: 'doctor',
  DETECTIVE: 'detective',
  VILLAGER: 'villager'
};

const ROLE_INFO = {
  [ROLES.MAFIA]:     { icon: '🔪', label: 'Mafia',     team: 'mafia' },
  [ROLES.DOCTOR]:    { icon: '💉', label: 'Doctor',    team: 'town' },
  [ROLES.DETECTIVE]: { icon: '🔍', label: 'Detective', team: 'town' },
  [ROLES.VILLAGER]:  { icon: '👤', label: 'Villager',  team: 'town' }
};

const POINTS_TOWN_WIN = 300;
const POINTS_MAFIA_WIN = 400;
const POINTS_SURVIVE = 100;

// Role distribution based on player count
function getRoleDistribution(count) {
  if (count <= 5)  return { mafia: 1, doctor: 1, detective: 1, villager: count - 3 };
  if (count <= 7)  return { mafia: 2, doctor: 1, detective: 1, villager: count - 4 };
  if (count <= 9)  return { mafia: 2, doctor: 1, detective: 1, villager: count - 4 };
  if (count <= 11) return { mafia: 3, doctor: 1, detective: 1, villager: count - 5 };
  return { mafia: 3, doctor: 1, detective: 1, villager: count - 5 };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function init(room, settings) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  if (activePlayers.length < 4) return;

  const dist = getRoleDistribution(activePlayers.length);
  const roles = [];
  for (let i = 0; i < dist.mafia; i++) roles.push(ROLES.MAFIA);
  for (let i = 0; i < dist.doctor; i++) roles.push(ROLES.DOCTOR);
  for (let i = 0; i < dist.detective; i++) roles.push(ROLES.DETECTIVE);
  for (let i = 0; i < dist.villager; i++) roles.push(ROLES.VILLAGER);

  const shuffledRoles = shuffle(roles);
  const playerStates = {};

  activePlayers.forEach((p, i) => {
    playerStates[p.id] = {
      name: p.name,
      avatar: p.avatar || '😎',
      role: shuffledRoles[i],
      alive: true
    };
    p.score = 0;
  });

  const discussTime = (settings && settings.timeLimit) || 60;

  room.gameState = {
    playerStates,
    playerOrder: activePlayers.map(p => p.id),
    phase: 'night-mafia', // night-mafia, night-doctor, night-detective, day-discuss, day-vote, vote-result, game-over
    dayNumber: 1,
    nightKillTarget: null,
    doctorSaveTarget: null,
    detectiveTarget: null,
    detectiveResult: null,
    mafiaVotes: {},        // mafiaId -> targetId
    dayVotes: {},          // playerId -> targetId
    eliminatedTonight: null,
    eliminatedHistory: [],  // { name, role, day, phase }
    discussTime,
    winner: null,
    lastNightSummary: null, // { killed, saved }
    actionLog: []
  };
}

function getAlivePlayers(gs) {
  return gs.playerOrder.filter(id => gs.playerStates[id].alive);
}

function getAliveMafia(gs) {
  return getAlivePlayers(gs).filter(id => gs.playerStates[id].role === ROLES.MAFIA);
}

function getAliveTown(gs) {
  return getAlivePlayers(gs).filter(id => gs.playerStates[id].role !== ROLES.MAFIA);
}

function checkWinCondition(gs) {
  const mafiaAlive = getAliveMafia(gs).length;
  const townAlive = getAliveTown(gs).length;

  if (mafiaAlive === 0) return 'town';
  if (mafiaAlive >= townAlive) return 'mafia';
  return null;
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const ps = gs.playerStates[playerId];
  if (!ps) return null;

  const alive = getAlivePlayers(gs);
  const isAlive = ps.alive;
  const isMafia = ps.role === ROLES.MAFIA;
  const isDoctor = ps.role === ROLES.DOCTOR;
  const isDetective = ps.role === ROLES.DETECTIVE;

  // Build player list — hide roles of living players (except mafia sees other mafia)
  const players = gs.playerOrder.map(id => {
    const p = gs.playerStates[id];
    const showRole = !p.alive || (isMafia && p.role === ROLES.MAFIA) || gs.phase === 'game-over';
    return {
      id,
      name: p.name,
      avatar: p.avatar,
      alive: p.alive,
      role: showRole ? p.role : null,
      roleIcon: showRole ? ROLE_INFO[p.role].icon : null,
      roleLabel: showRole ? ROLE_INFO[p.role].label : null
    };
  });

  const view = {
    phase: gs.phase,
    dayNumber: gs.dayNumber,
    role: ps.role,
    roleIcon: ROLE_INFO[ps.role].icon,
    roleLabel: ROLE_INFO[ps.role].label,
    team: ROLE_INFO[ps.role].team,
    isAlive: isAlive,
    players,
    alivePlayers: alive.map(id => ({
      id, name: gs.playerStates[id].name, avatar: gs.playerStates[id].avatar
    })),
    eliminatedHistory: gs.eliminatedHistory,
    actionLog: gs.actionLog.slice(-10),
    winner: gs.winner,
    gameType: 'mafia'
  };

  // Phase-specific data
  if (gs.phase === 'night-mafia' && isMafia && isAlive) {
    view.canAct = true;
    view.mafiaVoteCount = Object.keys(gs.mafiaVotes).length;
    view.mafiaTotal = getAliveMafia(gs).length;
    view.targets = alive.filter(id => gs.playerStates[id].role !== ROLES.MAFIA).map(id => ({
      id, name: gs.playerStates[id].name, avatar: gs.playerStates[id].avatar
    }));
  }

  if (gs.phase === 'night-doctor' && isDoctor && isAlive) {
    view.canAct = true;
    view.targets = alive.map(id => ({
      id, name: gs.playerStates[id].name, avatar: gs.playerStates[id].avatar
    }));
  }

  if (gs.phase === 'night-detective' && isDetective && isAlive) {
    view.canAct = true;
    view.targets = alive.filter(id => id !== playerId).map(id => ({
      id, name: gs.playerStates[id].name, avatar: gs.playerStates[id].avatar
    }));
  }

  if (gs.phase === 'night-detective' && isDetective && gs.detectiveResult) {
    view.detectiveResult = gs.detectiveResult;
  }

  if (gs.phase === 'day-discuss') {
    view.discussTime = gs.discussTime;
    view.lastNightSummary = gs.lastNightSummary;
  }

  if (gs.phase === 'day-vote' && isAlive) {
    view.canAct = true;
    view.targets = alive.filter(id => id !== playerId).map(id => ({
      id, name: gs.playerStates[id].name, avatar: gs.playerStates[id].avatar
    }));
    view.votesIn = Object.keys(gs.dayVotes).length;
    view.totalVoters = alive.length;
  }

  if (gs.phase === 'vote-result') {
    view.voteResult = gs.lastVoteResult;
    view.lastNightSummary = gs.lastNightSummary;
  }

  if (gs.phase === 'game-over') {
    view.winner = gs.winner;
  }

  return view;
}

// ─── NIGHT ACTIONS ───

function mafiaVote(room, playerId, targetId) {
  const gs = room.gameState;
  if (gs.phase !== 'night-mafia') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || !ps.alive || ps.role !== ROLES.MAFIA) return null;

  const target = gs.playerStates[targetId];
  if (!target || !target.alive || target.role === ROLES.MAFIA) return null;

  gs.mafiaVotes[playerId] = targetId;

  const aliveMafia = getAliveMafia(gs);
  if (Object.keys(gs.mafiaVotes).length < aliveMafia.length) {
    return { waiting: true, votesIn: Object.keys(gs.mafiaVotes).length, total: aliveMafia.length };
  }

  // All mafia voted — majority target
  const tally = {};
  Object.values(gs.mafiaVotes).forEach(tid => {
    tally[tid] = (tally[tid] || 0) + 1;
  });
  let maxVotes = 0, maxId = null;
  Object.entries(tally).forEach(([tid, count]) => {
    if (count > maxVotes) { maxVotes = count; maxId = tid; }
  });
  gs.nightKillTarget = maxId;
  gs.mafiaVotes = {};

  // Move to doctor phase
  const aliveDoctor = getAlivePlayers(gs).find(id => gs.playerStates[id].role === ROLES.DOCTOR);
  if (aliveDoctor) {
    gs.phase = 'night-doctor';
  } else {
    // No doctor alive — skip to detective
    const aliveDetective = getAlivePlayers(gs).find(id => gs.playerStates[id].role === ROLES.DETECTIVE);
    if (aliveDetective) {
      gs.phase = 'night-detective';
      gs.detectiveResult = null;
    } else {
      resolveNight(room);
    }
  }

  return { resolved: true };
}

function doctorSave(room, playerId, targetId) {
  const gs = room.gameState;
  if (gs.phase !== 'night-doctor') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || !ps.alive || ps.role !== ROLES.DOCTOR) return null;

  const target = gs.playerStates[targetId];
  if (!target || !target.alive) return null;

  gs.doctorSaveTarget = targetId;

  // Move to detective phase
  const aliveDetective = getAlivePlayers(gs).find(id => gs.playerStates[id].role === ROLES.DETECTIVE);
  if (aliveDetective) {
    gs.phase = 'night-detective';
    gs.detectiveResult = null;
  } else {
    resolveNight(room);
  }

  return { resolved: true };
}

function detectiveInvestigate(room, playerId, targetId) {
  const gs = room.gameState;
  if (gs.phase !== 'night-detective') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || !ps.alive || ps.role !== ROLES.DETECTIVE) return null;

  const target = gs.playerStates[targetId];
  if (!target || !target.alive || targetId === playerId) return null;

  gs.detectiveTarget = targetId;
  const isMafia = target.role === ROLES.MAFIA;
  gs.detectiveResult = {
    targetId,
    targetName: target.name,
    isMafia
  };

  return { resolved: true, detectiveResult: gs.detectiveResult };
}

function detectiveDone(room, playerId) {
  const gs = room.gameState;
  if (gs.phase !== 'night-detective') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || !ps.alive || ps.role !== ROLES.DETECTIVE) return null;
  if (!gs.detectiveResult) return null;

  resolveNight(room);
  return { resolved: true };
}

function resolveNight(room) {
  const gs = room.gameState;
  const killTarget = gs.nightKillTarget;
  const saveTarget = gs.doctorSaveTarget;

  let killed = null;
  let saved = false;

  if (killTarget) {
    if (killTarget === saveTarget) {
      saved = true;
      gs.actionLog.push({ text: `🌙 Night ${gs.dayNumber}: The Doctor saved someone!`, type: 'save' });
    } else {
      const target = gs.playerStates[killTarget];
      target.alive = false;
      killed = { id: killTarget, name: target.name, role: target.role };
      gs.eliminatedHistory.push({
        name: target.name,
        role: target.role,
        roleIcon: ROLE_INFO[target.role].icon,
        day: gs.dayNumber,
        phase: 'night'
      });
      gs.actionLog.push({ text: `🌙 Night ${gs.dayNumber}: ${target.name} was eliminated!`, type: 'kill' });
    }
  }

  gs.lastNightSummary = { killed, saved };
  gs.nightKillTarget = null;
  gs.doctorSaveTarget = null;
  gs.detectiveTarget = null;
  gs.detectiveResult = null;

  // Check win condition
  const winner = checkWinCondition(gs);
  if (winner) {
    endGame(room, winner);
    return;
  }

  // Move to day discussion
  gs.phase = 'day-discuss';
}

function startDayVote(room) {
  const gs = room.gameState;
  if (gs.phase !== 'day-discuss') return null;

  gs.phase = 'day-vote';
  gs.dayVotes = {};
  return { resolved: true };
}

function dayVote(room, playerId, targetId) {
  const gs = room.gameState;
  if (gs.phase !== 'day-vote') return null;

  const ps = gs.playerStates[playerId];
  if (!ps || !ps.alive) return null;

  if (targetId === '__skip__') {
    gs.dayVotes[playerId] = '__skip__';
  } else {
    const target = gs.playerStates[targetId];
    if (!target || !target.alive || targetId === playerId) return null;
    gs.dayVotes[playerId] = targetId;
  }

  const alive = getAlivePlayers(gs);
  if (Object.keys(gs.dayVotes).length < alive.length) {
    return { waiting: true, votesIn: Object.keys(gs.dayVotes).length, total: alive.length };
  }

  // All votes in — tally
  const tally = {};
  let skipCount = 0;
  Object.values(gs.dayVotes).forEach(tid => {
    if (tid === '__skip__') skipCount++;
    else tally[tid] = (tally[tid] || 0) + 1;
  });

  const majorityNeeded = Math.floor(alive.length / 2) + 1;

  let maxVotes = 0, maxId = null, tie = false;
  Object.entries(tally).forEach(([tid, count]) => {
    if (count > maxVotes) { maxVotes = count; maxId = tid; tie = false; }
    else if (count === maxVotes) tie = true;
  });

  const noElimination = skipCount >= majorityNeeded || maxVotes < majorityNeeded || tie;

  let eliminated = null;
  if (!noElimination && maxId) {
    const target = gs.playerStates[maxId];
    target.alive = false;
    eliminated = { id: maxId, name: target.name, role: target.role, roleIcon: ROLE_INFO[target.role].icon };
    gs.eliminatedHistory.push({
      name: target.name,
      role: target.role,
      roleIcon: ROLE_INFO[target.role].icon,
      day: gs.dayNumber,
      phase: 'day'
    });
    gs.actionLog.push({ text: `☀️ Day ${gs.dayNumber}: ${target.name} (${ROLE_INFO[target.role].label}) was voted out!`, type: 'vote' });
  } else {
    gs.actionLog.push({ text: `☀️ Day ${gs.dayNumber}: No one was eliminated.`, type: 'skip' });
  }

  gs.lastVoteResult = {
    tally,
    skipCount,
    eliminated,
    noElimination,
    tie
  };

  // Check win condition
  const winner = checkWinCondition(gs);
  if (winner) {
    endGame(room, winner);
    return { resolved: true, gameOver: true };
  }

  gs.phase = 'vote-result';
  gs.dayVotes = {};

  return { resolved: true, gameOver: false };
}

function nextNight(room) {
  const gs = room.gameState;
  if (gs.phase !== 'vote-result') return false;

  gs.dayNumber++;
  gs.phase = 'night-mafia';
  gs.mafiaVotes = {};
  gs.nightKillTarget = null;
  gs.doctorSaveTarget = null;
  gs.detectiveTarget = null;
  gs.detectiveResult = null;
  gs.lastVoteResult = null;

  return true;
}

function endGame(room, winner) {
  const gs = room.gameState;
  gs.phase = 'game-over';
  gs.winner = winner;

  // Award points
  gs.playerOrder.forEach(id => {
    const ps = gs.playerStates[id];
    const player = room.players.find(p => p.id === id);
    if (!player) return;

    const isWinningTeam = (winner === 'town' && ROLE_INFO[ps.role].team === 'town') ||
                          (winner === 'mafia' && ps.role === ROLES.MAFIA);

    if (isWinningTeam) {
      player.score += winner === 'town' ? POINTS_TOWN_WIN : POINTS_MAFIA_WIN;
    }
    if (ps.alive) {
      player.score += POINTS_SURVIVE;
    }
  });
}

function getResults(room) {
  const gs = room.gameState;
  if (!gs) return null;

  const players = gs.playerOrder.map(id => {
    const ps = gs.playerStates[id];
    const player = room.players.find(p => p.id === id);
    return {
      id,
      name: ps.name,
      avatar: ps.avatar,
      role: ps.role,
      roleIcon: ROLE_INFO[ps.role].icon,
      roleLabel: ROLE_INFO[ps.role].label,
      team: ROLE_INFO[ps.role].team,
      alive: ps.alive,
      totalScore: player ? player.score : 0
    };
  });

  // Sort: winners first, then alive, then by score
  players.sort((a, b) => {
    const aWin = (gs.winner === 'town' && a.team === 'town') || (gs.winner === 'mafia' && a.role === ROLES.MAFIA);
    const bWin = (gs.winner === 'town' && b.team === 'town') || (gs.winner === 'mafia' && b.role === ROLES.MAFIA);
    if (aWin && !bWin) return -1;
    if (!aWin && bWin) return 1;
    if (a.alive && !b.alive) return -1;
    if (!a.alive && b.alive) return 1;
    return b.totalScore - a.totalScore;
  });

  return {
    players,
    winner: gs.winner,
    eliminatedHistory: gs.eliminatedHistory,
    gameType: 'mafia'
  };
}

module.exports = {
  init,
  getPlayerView,
  getResults,
  mafiaVote,
  doctorSave,
  detectiveInvestigate,
  detectiveDone,
  startDayVote,
  dayVote,
  nextNight
};
