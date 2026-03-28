// ─── LUDO SERVER LOGIC ───
// Classic board game: 2-4 players, each with 4 tokens, race around the board.
// Roll a 6 to leave base. First to get all 4 tokens home wins.

const COLORS = ['red', 'blue', 'green', 'yellow'];
const TOKENS_PER_PLAYER = 4;
const BOARD_SIZE = 52; // main track squares
const HOME_STRETCH = 6; // final stretch before home

// Starting positions on the main track for each color
const START_POSITIONS = { red: 0, blue: 13, green: 26, yellow: 39 };

// Safe squares (can't be captured here)
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

function init(room) {
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const numPlayers = Math.min(activePlayers.length, 4);

  // For 2 players, use opposite corners (red & green) for fairness
  const colorAssignment = numPlayers === 2
    ? ['red', 'green']
    : COLORS.slice(0, numPlayers);

  const players = {};
  for (let i = 0; i < numPlayers; i++) {
    const color = colorAssignment[i];
    const p = activePlayers[i];
    players[p.id] = {
      color,
      name: p.name,
      avatar: p.avatar || '😎',
      tokens: [
        { pos: -1, state: 'base' }, // -1 = in base
        { pos: -1, state: 'base' },
        { pos: -1, state: 'base' },
        { pos: -1, state: 'base' }
      ],
      finished: 0 // tokens that reached home
    };
  }

  const playerOrder = activePlayers.slice(0, numPlayers).map(p => p.id);

  room.gameState = {
    players,
    playerOrder,
    currentPlayerIndex: 0,
    diceValue: null,
    diceRolled: false,
    consecutiveSixes: 0,
    phase: 'rolling', // rolling, moving, finished
    winner: null,
    lastAction: null,
    turnTimeout: null
  };
}

function rollDice(room, playerId) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'rolling') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;
  if (gs.diceRolled) return null;

  const value = Math.floor(Math.random() * 6) + 1;
  gs.diceValue = value;
  gs.diceRolled = true;

  // Check if player can make any move with this dice
  const playerState = gs.players[playerId];
  const movable = getMovableTokens(gs, playerId, value);

  if (movable.length === 0) {
    // No moves available — pass turn
    gs.lastAction = { type: 'no-move', player: playerId, dice: value };

    if (value === 6) {
      gs.consecutiveSixes++;
      if (gs.consecutiveSixes >= 3) {
        gs.lastAction = { type: 'three-sixes', player: playerId };
        gs.consecutiveSixes = 0;
        nextTurn(gs);
        return { rolled: true, dice: value, noMove: true, threeSixes: true };
      }
      // Get another roll on 6
      gs.diceRolled = false;
      return { rolled: true, dice: value, noMove: true, extraTurn: true };
    }

    gs.consecutiveSixes = 0;
    nextTurn(gs);
    return { rolled: true, dice: value, noMove: true };
  }

  // If only one token can move, auto-move it
  if (movable.length === 1) {
    return moveTokenLogic(gs, playerId, movable[0], value);
  }

  // Multiple tokens can move — wait for player to pick
  gs.phase = 'moving';
  return { rolled: true, dice: value, movable, pickToken: true };
}

function moveToken(room, playerId, tokenIndex) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'moving') return null;
  if (gs.playerOrder[gs.currentPlayerIndex] !== playerId) return null;

  const movable = getMovableTokens(gs, playerId, gs.diceValue);
  if (!movable.includes(tokenIndex)) return null;

  return moveTokenLogic(gs, playerId, tokenIndex, gs.diceValue);
}

function moveTokenLogic(gs, playerId, tokenIndex, dice) {
  const playerState = gs.players[playerId];
  const token = playerState.tokens[tokenIndex];
  const color = playerState.color;
  const startPos = START_POSITIONS[color];
  let captured = null;

  if (token.state === 'base' && dice === 6) {
    // Move out of base to start position
    token.pos = startPos;
    token.state = 'active';
    gs.lastAction = { type: 'leave-base', player: playerId, token: tokenIndex, newPos: startPos };

    // Check capture at start
    captured = checkCapture(gs, playerId, startPos);
  } else if (token.state === 'active') {
    const oldPos = token.pos;
    // Calculate new position
    const relativePos = getRelativePos(token.pos, startPos);
    const newRelative = relativePos + dice;

    if (newRelative >= BOARD_SIZE && newRelative < BOARD_SIZE + HOME_STRETCH) {
      // Entering home stretch
      token.pos = newRelative; // use relative position for home stretch
      token.state = 'home-stretch';
      gs.lastAction = { type: 'enter-home-stretch', player: playerId, token: tokenIndex, newPos: token.pos };
    } else if (newRelative >= BOARD_SIZE + HOME_STRETCH) {
      if (newRelative === BOARD_SIZE + HOME_STRETCH) {
        // Exact landing — token reaches home!
        token.state = 'home';
        token.pos = -2;
        playerState.finished++;
        gs.lastAction = { type: 'home', player: playerId, token: tokenIndex };

        // Check win
        if (playerState.finished >= TOKENS_PER_PLAYER) {
          gs.phase = 'finished';
          gs.winner = playerId;
          // Award points
          playerState.score = 500;
          // Give other players points based on how many they got home
          Object.entries(gs.players).forEach(([pid, ps]) => {
            if (pid !== playerId) {
              const p = { id: pid };
              ps.score = ps.finished * 50;
            }
          });
          return { moved: true, action: gs.lastAction, captured, gameOver: true, winner: playerId };
        }
      } else {
        // Overshot — can't move (shouldn't happen since getMovableTokens checks)
        return null;
      }
    } else {
      // Normal move on main track
      const newAbsolutePos = (startPos + newRelative) % BOARD_SIZE;
      token.pos = newAbsolutePos;
      gs.lastAction = { type: 'move', player: playerId, token: tokenIndex, from: oldPos, to: newAbsolutePos, dice };

      // Check capture
      captured = checkCapture(gs, playerId, newAbsolutePos);
    }
  } else if (token.state === 'home-stretch') {
    const relativePos = token.pos;
    const newRelative = relativePos + dice;
    if (newRelative === BOARD_SIZE + HOME_STRETCH) {
      token.state = 'home';
      token.pos = -2;
      playerState.finished++;
      gs.lastAction = { type: 'home', player: playerId, token: tokenIndex };

      if (playerState.finished >= TOKENS_PER_PLAYER) {
        gs.phase = 'finished';
        gs.winner = playerId;
        playerState.score = 500;
        Object.entries(gs.players).forEach(([pid, ps]) => {
          if (pid !== playerId) ps.score = ps.finished * 50;
        });
        return { moved: true, action: gs.lastAction, captured, gameOver: true, winner: playerId };
      }
    } else if (newRelative > BOARD_SIZE + HOME_STRETCH) {
      return null; // overshot
    } else {
      token.pos = newRelative;
      token.state = 'home-stretch';
      gs.lastAction = { type: 'move-home-stretch', player: playerId, token: tokenIndex, newPos: token.pos };
    }
  }

  if (captured) {
    gs.lastAction.captured = captured;
  }

  // Extra turn on 6 or capture
  if (dice === 6) {
    gs.consecutiveSixes++;
    if (gs.consecutiveSixes >= 3) {
      gs.lastAction = { type: 'three-sixes', player: playerId };
      gs.consecutiveSixes = 0;
      nextTurn(gs);
    } else {
      gs.diceRolled = false;
      gs.phase = 'rolling';
    }
  } else if (captured) {
    gs.consecutiveSixes = 0;
    gs.diceRolled = false;
    gs.phase = 'rolling';
  } else {
    gs.consecutiveSixes = 0;
    nextTurn(gs);
  }

  return { moved: true, action: gs.lastAction, captured, dice };
}

function getRelativePos(absolutePos, startPos) {
  return (absolutePos - startPos + BOARD_SIZE) % BOARD_SIZE;
}

function getMovableTokens(gs, playerId, dice) {
  const playerState = gs.players[playerId];
  const startPos = START_POSITIONS[playerState.color];
  const movable = [];

  for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
    const token = playerState.tokens[i];
    if (token.state === 'home') continue;

    if (token.state === 'base') {
      if (dice === 6) movable.push(i);
    } else if (token.state === 'active') {
      const relativePos = getRelativePos(token.pos, startPos);
      const newRelative = relativePos + dice;
      if (newRelative <= BOARD_SIZE + HOME_STRETCH) {
        movable.push(i);
      }
    } else if (token.state === 'home-stretch') {
      const newRelative = token.pos + dice;
      if (newRelative <= BOARD_SIZE + HOME_STRETCH) {
        movable.push(i);
      }
    }
  }
  return movable;
}

function checkCapture(gs, playerId, pos) {
  if (SAFE_SQUARES.includes(pos)) return null;

  for (const [pid, ps] of Object.entries(gs.players)) {
    if (pid === playerId) continue;
    for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
      const token = ps.tokens[i];
      if (token.state === 'active' && token.pos === pos) {
        // Capture! Send back to base
        token.pos = -1;
        token.state = 'base';
        return { playerId: pid, playerName: ps.name, tokenIndex: i, color: ps.color };
      }
    }
  }
  return null;
}

function nextTurn(gs) {
  gs.diceRolled = false;
  gs.diceValue = null;
  gs.phase = 'rolling';
  gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
}

function getPlayerView(room, playerId) {
  const gs = room.gameState;
  if (!gs) return null;

  const currentPlayerId = gs.playerOrder[gs.currentPlayerIndex];
  const currentPlayer = gs.players[currentPlayerId];

  // Build all player info
  const allPlayers = gs.playerOrder.map(pid => {
    const ps = gs.players[pid];
    return {
      id: pid,
      name: ps.name,
      avatar: ps.avatar,
      color: ps.color,
      tokens: ps.tokens.map(t => ({ pos: t.pos, state: t.state })),
      finished: ps.finished
    };
  });

  const movable = (gs.phase === 'moving' && currentPlayerId === playerId)
    ? getMovableTokens(gs, playerId, gs.diceValue)
    : [];

  return {
    players: allPlayers,
    currentPlayerId,
    currentPlayerName: currentPlayer ? currentPlayer.name : '?',
    currentPlayerColor: currentPlayer ? currentPlayer.color : 'red',
    isMyTurn: currentPlayerId === playerId,
    myColor: gs.players[playerId] ? gs.players[playerId].color : null,
    diceValue: gs.diceValue,
    diceRolled: gs.diceRolled,
    phase: gs.phase,
    movable,
    lastAction: gs.lastAction,
    winner: gs.winner,
    winnerName: gs.winner ? gs.players[gs.winner].name : null,
    winnerColor: gs.winner ? gs.players[gs.winner].color : null
  };
}

function getResults(room) {
  const gs = room.gameState;
  const sorted = gs.playerOrder
    .map(pid => {
      const ps = gs.players[pid];
      const player = room.players.find(p => p.id === pid);
      return {
        name: ps.name,
        score: ps.score || (ps.finished * 50),
        finished: ps.finished,
        color: ps.color,
        isHost: player ? player.isHost : false
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    players: sorted.map((p, i) => ({
      rank: i < 3 ? ['1st', '2nd', '3rd'][i] : `${i + 1}`,
      name: p.name,
      score: p.score,
      isHost: p.isHost
    })),
    gameType: 'ludo'
  };
}

module.exports = { init, rollDice, moveToken, getPlayerView, getResults };
