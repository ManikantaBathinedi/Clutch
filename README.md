<p align="center">
  <img src="public/img/logo.svg" alt="Clutch Logo" width="80" height="80">
</p>

<h1 align="center">CLUTCH</h1>

<p align="center">
  <strong>The ultimate multiplayer game hub — play 24+ games with friends, right in your browser.</strong>
</p>

<p align="center">
  <a href="#-games"><img src="https://img.shields.io/badge/games-24%2B-blueviolet?style=for-the-badge" alt="24+ Games"></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/realtime-Socket.IO-010101?style=for-the-badge&logo=socketdotio" alt="Socket.IO"></a>
  <a href="#-getting-started"><img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <img src="https://img.shields.io/badge/tests-215%20passing-brightgreen?style=for-the-badge" alt="215 Tests Passing">
</p>

---

## What is Clutch?

Clutch is a **real-time multiplayer game platform** where you create a room, share the code, and jump into any of 24+ games with friends — no downloads, no accounts required. It runs entirely in the browser with instant matchmaking via room codes.

**Create a room → Share the code → Play together.**

---

## 🎮 Games

### 🎉 Party Games
| Game | Description |
|------|-------------|
| 🧠 **Trivia** | Answer fast, score big — timed multiple-choice rounds |
| 🔤 **Word Scramble** | Unscramble the letters before anyone else |
| ⚡ **Speed Math** | Solve equations under pressure |
| 😎 **Emoji Decoder** | Guess the phrase from emoji clues |
| 🎨 **Draw & Guess** | One draws, everyone guesses — Pictionary-style |
| 🕵️ **Codenames** | Team-based spy word guessing |
| 💀 **Hangman** | Classic letter-by-letter word guessing |
| 🧠 **Memory Match** | Flip cards, find matching pairs |
| 📝 **Wordle** | Guess the 5-letter word in 6 tries |

### 🃏 Card & Casino
| Game | Description |
|------|-------------|
| 🎴 **Color Clash** | Play your cards, call UNO! |
| 🂡 **Blackjack** | Beat the dealer to 21 |
| 🂪 **Poker** | Texas Hold'em with chips |
| 🃏 **Rummy** | Form melds, empty your hand first |

### 🎲 Board Games
| Game | Description |
|------|-------------|
| 🎲 **Ludo** | Roll dice, race your tokens home |
| ♟️ **Chess** | Classic strategy — checkmate wins |
| 🚢 **Battleship** | Sink the enemy fleet |

### 🧩 Social & Deduction
| Game | Description |
|------|-------------|
| 🕵️‍♂️ **Spyfall** | Find the spy among you |
| 📡 **Wavelength** | Guess where on the spectrum |
| ☝️ **Just One** | Cooperative word guessing |
| 🤔 **Would You Rather** | Pick a side, join the majority |
| 🔗 **Word Chain** | Chain words, don't get eliminated |
| 🤫 **Imposter** | Find the fake among you |
| 👑 **Coup** | Bluff, steal & overthrow |
| 📖 **Dixit** | Storytelling & creative guessing |

---

## ✨ Features

- **Instant Multiplayer** — Create a room, share a 6-character code, and play in seconds
- **No Sign-Up Required** — Jump in as a guest, or register for stats tracking
- **24+ Games** — Party, card, board, and social deduction games in one place
- **Real-Time Gameplay** — Powered by WebSockets for lag-free interaction
- **Dark & Light Themes** — Toggle between themes with one click
- **Tournaments** — Create multi-game tournaments and crown a champion
- **Spectator Mode** — Watch ongoing games and jump in next round
- **In-Game Chat** — Talk with your room while playing
- **Leaderboards** — Track scores and compete for the top spot
- **Mobile Friendly** — Responsive design that works on any device
- **Sound Effects** — Immersive audio feedback (toggleable)
- **Report Issues** — Built-in issue reporting directly from the app

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js, Express |
| **Real-Time** | Socket.IO |
| **Frontend** | Vanilla JS, HTML5, CSS3 |
| **Auth** | bcryptjs (password hashing) |
| **Security** | express-rate-limit, input sanitization |
| **Testing** | Jest (215 tests) |
| **Data** | In-memory (zero external dependencies) |

No build tools. No bundlers. No frameworks. Just fast, clean JavaScript.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/ManikantaBathinedi/Clutch.git
cd Clutch

# Install dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:3000** in your browser. That's it.

### Environment Variables (Optional)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `3000`) |
| `GITHUB_TOKEN` | GitHub Personal Access Token for the Report Issue feature |
| `GITHUB_REPO` | GitHub repo in `owner/repo` format (e.g. `ManikantaBathinedi/Clutch`) |

---

## 🧪 Testing

```bash
npm test
```

Runs 215 tests across 5 suites covering:
- Room creation, joining, and lifecycle
- All 24 game logic modules
- Edge cases and error handling
- Player disconnect and reconnection scenarios

---

## 📁 Project Structure

```
├── server.js              # Express + Socket.IO server
├── db.js                  # In-memory data layer (auth, history, leaderboards)
├── game-logic/            # Server-side game engines (24 modules)
│   ├── trivia.js
│   ├── chess.js
│   ├── poker.js
│   └── ...
├── public/                # Static frontend
│   ├── index.html         # Landing page
│   ├── lobby.html         # Game lobby
│   ├── css/style.css      # All styles (dark/light themes)
│   └── js/
│       ├── lobby.js       # Room management, game loading
│       ├── main.js        # Landing page logic
│       └── games/         # Client-side game renderers (24 modules)
├── data/                  # Game data (trivia questions, word lists, etc.)
├── tests/                 # Jest test suites
└── docs/                  # Architecture & design documents
```

---

## 🎯 How It Works

1. **Landing Page** — Enter a display name and create or join a room
2. **Lobby** — The host picks a game; all players see the selection in real-time
3. **Gameplay** — Game logic runs server-side to prevent cheating; clients render the UI
4. **Results** — Scores are tallied and displayed; players return to the lobby for another round

All game state is authoritative on the server. The client is a thin rendering layer.

---

## 🤝 Contributing

Found a bug or have a feature idea? Use the **Report Issue** button in the app header, or [open an issue](https://github.com/ManikantaBathinedi/Clutch/issues) directly.

Pull requests are welcome:

```bash
# Fork → Clone → Branch → Commit → PR
git checkout -b feature/your-feature
git commit -m "Add your feature"
git push origin feature/your-feature
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/ManikantaBathinedi">Manikanta Bathinedi</a>
</p>
