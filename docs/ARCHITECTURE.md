# Project Architecture

## Directory Structure
```
Game web/
├── server.js              # Main Node.js + Express + Socket.IO server
├── package.json           # Dependencies and scripts
├── .gitignore
├── docs/                  # Project documentation
├── public/                # Static frontend files (served by Express)
│   ├── index.html         # Landing page — create or join room
│   ├── lobby.html         # Lobby — see players, host picks game
│   ├── css/
│   │   └── style.css      # Global styles
│   ├── js/
│   │   ├── main.js        # Landing page logic (create/join room)
│   │   ├── lobby.js       # Lobby logic (player list, game selection)
│   │   └── games/
│   │       ├── trivia.js      # Trivia Quiz client-side
│   │       ├── wordscramble.js # Word Scramble client-side
│   │       ├── drawguess.js   # Draw & Guess client-side
│   │       ├── speedmath.js   # Speed Math client-side
│   │       └── emoji.js       # Emoji Decoder client-side
│   └── games/             # Game-specific HTML pages
│       ├── trivia.html
│       ├── wordscramble.html
│       ├── drawguess.html
│       ├── speedmath.html
│       └── emoji.html
├── game-logic/            # Server-side game logic modules
│   ├── trivia.js
│   ├── wordscramble.js
│   ├── drawguess.js
│   ├── speedmath.js
│   └── emoji.js
└── data/                  # Game data (question banks, word lists, etc.)
    ├── trivia-questions.json
    ├── words.json
    └── emoji-puzzles.json
```

## Socket.IO Events Architecture

### Room Management
| Event | Direction | Payload | Description |
|---|---|---|---|
| `create-room` | Client→Server | `{ hostName }` | Host creates a room |
| `room-created` | Server→Client | `{ roomCode }` | Room code sent to host |
| `join-room` | Client→Server | `{ roomCode, playerName }` | Player joins |
| `player-joined` | Server→All | `{ players[] }` | Updated player list |
| `player-left` | Server→All | `{ players[] }` | Player disconnected |

### Game Flow
| Event | Direction | Payload | Description |
|---|---|---|---|
| `select-game` | Client→Server | `{ gameType }` | Host selects a game |
| `game-starting` | Server→All | `{ gameType }` | Notify all, load game UI |
| `game-state` | Server→All | `{ ...gameData }` | Current game state/question |
| `player-answer` | Client→Server | `{ answer }` | Player submits answer |
| `round-result` | Server→All | `{ scores, correct }` | Round results |
| `game-over` | Server→All | `{ finalScores }` | Game ended, show leaderboard |
| `back-to-lobby` | Server→All | `{}` | Return to lobby |

## Room Data Model (in-memory)
```javascript
rooms = {
  "ABC123": {
    code: "ABC123",
    hostId: "socket-id-xxx",
    players: [
      { id: "socket-id-xxx", name: "Alice", score: 0, isHost: true },
      { id: "socket-id-yyy", name: "Bob", score: 0, isHost: false }
    ],
    currentGame: null,        // "trivia" | "wordscramble" | etc.
    gameState: {},            // Game-specific state
    status: "lobby"           // "lobby" | "playing" | "results"
  }
}
```

## Server Architecture Pattern
- `server.js` — sets up Express + Socket.IO, handles room events
- Each game module in `game-logic/` exports functions:
  - `init(room)` — set up initial game state
  - `handleAnswer(room, playerId, answer)` — process a player's answer
  - `nextRound(room)` — advance to next question/round
  - `getResults(room)` — return final scores
- Game modules are pluggable — easy to add new games
