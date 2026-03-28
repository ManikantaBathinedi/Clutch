# Game Hub — Multiplayer Online Game Platform

## Concept
A web platform where a host creates a game room, shares a 6-digit join code, and players join via browser to play together in real-time (like Kahoot/Jackbox).

## Key Decisions
- **One room, multiple games** — players join once, host picks games, they play as many as they want without rejoining
- **No sign-up required** — enter code + nickname to play
- **No database** — rooms and scores live in memory (simple start)
- **All game logic on server** — prevents cheating, clients send inputs and receive state
- **Mobile-friendly** — players typically join from phones
- **Deployment target: Render (free tier)** — supports Node.js + Socket.IO, fine for 10+ players

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript (vanilla, no framework)
- **Backend**: Node.js + Express
- **Real-time**: Socket.IO
- **Styling**: CSS with animations, colorful game feel
- **Hosting**: Render free tier

## Games (Starting Set)
1. **Trivia Quiz** — Kahoot-style, host picks/creates questions, timer, leaderboard
2. **Word Scramble** — Unscramble letters, fastest correct answer wins
3. **Draw & Guess** — One draws, others guess (like Skribbl.io)
4. **Speed Math** — Solve math problems, first correct answer gets points
5. **Emoji Decoder** — Guess movie/phrase from emojis

## User Flow
1. Host creates a room → gets a 6-digit join code
2. Players go to site, enter code + nickname → join lobby
3. Host picks a game and starts it
4. Real-time gameplay with live scores
5. After game ends → back to lobby → host picks next game
6. Final leaderboard at end of session
