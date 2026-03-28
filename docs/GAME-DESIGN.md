# Game Design Details

## 1. Trivia Quiz
- Host can choose category or "random"
- 10 questions per round (configurable by host)
- Each question: 4 options, 15-second timer
- Scoring: 1000 points base, minus time penalty (faster = more points)
- Between questions: show correct answer + current leaderboard
- Categories: General Knowledge, Science, Movies, Sports, History, Geography

## 2. Word Scramble
- A scrambled word is shown to all players
- Players type their guess
- First correct answer gets 500 points, second gets 400, etc.
- Hint after 10 seconds (reveal first letter)
- 10 words per round

## 3. Speed Math
- Math equation shown (addition, subtraction, multiplication)
- Players type the answer
- First correct gets most points
- Difficulty increases each round
- 10 problems per round

## 4. Emoji Decoder
- A sequence of emojis representing a movie/phrase is shown
- Players type their guess
- Partial matches can get partial points
- Hints reveal more context over time
- 8 puzzles per round

## 5. Draw & Guess (Most Complex)
- One player draws on a canvas, others type guesses
- Drawing player gets a word to draw
- Correct guessers AND the drawer get points
- 60-second timer per round
- Each player gets a turn to draw
- Uses HTML5 Canvas for drawing

## Leaderboard
- Cumulative scores across all games in the session
- Shown between games in the lobby
- Final session leaderboard when host ends the session

## Host Controls
- Start game
- Skip question/round
- Kick player
- End game early → back to lobby
- End session → show final leaderboard and close room
