/**
 * Test helpers — spins up the server and creates Socket.IO clients
 */
const http = require('http');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const express = require('express');
const path = require('path');

let server, io, httpServer;
let PORT = 0; // random port

/**
 * Start the game server on a random port for testing.
 * Returns { server, io, port, baseUrl }
 */
function startServer() {
  return new Promise((resolve) => {
    // Re-require server modules fresh
    const app = express();
    httpServer = http.createServer(app);
    io = new Server(httpServer, { cors: { origin: '*' } });

    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Require the game-logic modules
    const triviaLogic = require('../game-logic/trivia');
    const wordScrambleLogic = require('../game-logic/wordscramble');
    const speedMathLogic = require('../game-logic/speedmath');
    const emojiLogic = require('../game-logic/emoji');
    const drawGuessLogic = require('../game-logic/drawguess');
    const codenamesLogic = require('../game-logic/codenames');
    const colorClashLogic = require('../game-logic/colorclash');
    const blackjackLogic = require('../game-logic/blackjack');
    const hangmanLogic = require('../game-logic/hangman');
    const memoryMatchLogic = require('../game-logic/memorymatch');
    const spyfallLogic = require('../game-logic/spyfall');
    const wavelengthLogic = require('../game-logic/wavelength');
    const justOneLogic = require('../game-logic/justone');
    const wouldYouRatherLogic = require('../game-logic/wouldyourather');
    const wordChainLogic = require('../game-logic/wordchain');
    const imposterLogic = require('../game-logic/imposter');
    const ludoLogic = require('../game-logic/ludo');
    const pokerLogic = require('../game-logic/poker');
    const chessLogic = require('../game-logic/chess');
    const battleshipLogic = require('../game-logic/battleship');
    const rummyLogic = require('../game-logic/rummy');
    const coupLogic = require('../game-logic/coup');
    const wordleLogic = require('../game-logic/wordle');
    const dixitLogic = require('../game-logic/dixit');
    const knowmeLogic = require('../game-logic/knowme');
    const connectFourLogic = require('../game-logic/connectfour');
    const ticTacToeLogic = require('../game-logic/tictactoe');
    const partyPromptsLogic = require('../game-logic/partyprompts');
    const kingsCupLogic = require('../game-logic/kingscup');
    const mostLikelyToLogic = require('../game-logic/mostlikelyto');
    const neverHaveIEverLogic = require('../game-logic/neverhaveiever');
    const truthOrDrinkLogic = require('../game-logic/truthordrink');
    const typingRaceLogic = require('../game-logic/typingrace');

    const rooms = new Map();

    function generateRoomCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      return rooms.has(code) ? generateRoomCode() : code;
    }

    const roomTimers = new Map();

    function startDrawRound(room, data) {
      room.players.forEach(p => {
        const payload = p.id === data.drawerId ? data : { ...data, word: undefined };
        io.to(p.id).emit('draw-start', payload);
      });
    }

    function startAutoChooseTimer(room) {
      const gs = room.gameState;
      if (!gs) return;
      const key = room.code + '_autochoose';
      const timer = setTimeout(() => {
        const data = drawGuessLogic.autoChooseWord(room);
        if (data) startDrawRound(room, data);
      }, (gs.chooseTime + 1) * 1000);
      roomTimers.set(key, timer);
    }

    function clearAutoChooseTimer(room) {
      const key = room.code + '_autochoose';
      const timer = roomTimers.get(key);
      if (timer) { clearTimeout(timer); roomTimers.delete(key); }
    }

    function clearHintTimers(room) {
      const key = room.code + '_hints';
      const timers = roomTimers.get(key);
      if (timers) { timers.forEach(t => clearTimeout(t)); roomTimers.delete(key); }
    }

    io.on('connection', (socket) => {
      socket.on('create-room', ({ hostName, avatar }) => {
        if (!hostName || typeof hostName !== 'string') return;
        const name = hostName.trim().substring(0, 20);
        if (!name) return;
        const playerAvatar = (typeof avatar === 'string' && avatar.length <= 4) ? avatar : '😎';
        const code = generateRoomCode();
        const room = {
          code, hostId: socket.id,
          players: [{ id: socket.id, name, avatar: playerAvatar, score: 0, isHost: true }],
          currentGame: null, gameState: null, status: 'lobby'
        };
        rooms.set(code, room);
        socket.join(code);
        socket.roomCode = code;
        socket.playerName = name;
        socket.emit('room-created', { roomCode: code });
        io.to(code).emit('player-joined', { players: room.players });
      });

      socket.on('join-room', ({ roomCode, playerName, avatar }) => {
        if (!roomCode || !playerName || typeof playerName !== 'string') return;
        const code = roomCode.trim().toUpperCase();
        const name = playerName.trim().substring(0, 20);
        if (!name) return;
        const playerAvatar = (typeof avatar === 'string' && avatar.length <= 4) ? avatar : '😎';
        const room = rooms.get(code);
        if (!room) { socket.emit('join-error', { message: 'Room not found.' }); return; }
        if (room.players.length >= 50) { socket.emit('join-error', { message: 'Room is full.' }); return; }
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
          socket.emit('join-error', { message: 'Name taken.' }); return;
        }
        const isSpectator = room.status !== 'lobby';
        room.players.push({ id: socket.id, name, avatar: playerAvatar, score: 0, isHost: false, isSpectator });
        socket.join(code);
        socket.roomCode = code;
        socket.playerName = name;
        if (isSpectator) {
          socket.emit('join-as-spectator', { roomCode: code, gameType: room.currentGame });
          io.to(code).emit('player-joined', { players: room.players });
          // Send current game state to spectator after a short delay
          const gt = room.currentGame;
          setTimeout(() => {
            if (gt === 'trivia') { const d = triviaLogic.getCurrentQuestion(room); if (d) socket.emit('game-state', d); }
            else if (gt === 'wordscramble') { const d = wordScrambleLogic.getCurrentWord(room); if (d) socket.emit('game-state', d); }
            else if (gt === 'speedmath') { const d = speedMathLogic.getCurrentProblem(room); if (d) socket.emit('game-state', d); }
            else if (gt === 'emoji') { const d = emojiLogic.getCurrentPuzzle(room); if (d) socket.emit('game-state', d); }
            else if (gt === 'hangman') { socket.emit('hangman-state', hangmanLogic.getCurrentState(room)); }
            else if (gt === 'memorymatch') { socket.emit('mm-state', memoryMatchLogic.getPlayerView(room, socket.id)); }
            else if (gt === 'colorclash') { socket.emit('cc-state', colorClashLogic.getPlayerState(room, socket.id)); }
            else if (gt === 'blackjack') { socket.emit('bj-state', blackjackLogic.getPlayerView(room, socket.id)); }
            else if (gt === 'codenames') { socket.emit('codenames-state', codenamesLogic.getGameState(room, socket.id)); }
          }, 100);
        } else {
          socket.emit('join-success', { roomCode: code, isHost: false });
          io.to(code).emit('player-joined', { players: room.players });
        }
      });

      socket.on('get-categories', ({ gameType }) => {
        const m = { trivia: triviaLogic.getCategories(), wordscramble: wordScrambleLogic.getCategories(), emoji: emojiLogic.getCategories(), hangman: hangmanLogic.getCategories() };
        socket.emit('categories-list', { gameType, categories: m[gameType] || [] });
      });

      socket.on('select-game', ({ gameType, category, settings }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id) return;
        const validGames = ['trivia','wordscramble','speedmath','emoji','drawguess','codenames','colorclash','blackjack','hangman','memorymatch','spyfall','wavelength','justone','wouldyourather','wordchain','imposter','ludo','poker','chess','battleship','rummy','coup','wordle','dixit','knowme','connectfour','tictactoe','partyprompts','kingscup','mostlikelyto','neverhaveiever','truthordrink','typingrace'];
        if (!validGames.includes(gameType)) return;
        const cat = (typeof category === 'string') ? category.trim().toLowerCase() : 'all';
        const s = {};
        if (settings && typeof settings === 'object') {
          if (typeof settings.rounds === 'number') s.rounds = Math.max(3, Math.min(30, Math.floor(settings.rounds)));
          if (typeof settings.timeLimit === 'number') s.timeLimit = Math.max(5, Math.min(120, Math.floor(settings.timeLimit)));
        }
        room.currentGame = gameType;
        room.status = 'playing';
        room.lastGame = { gameType, category: cat, settings: s };

        if (gameType === 'trivia') triviaLogic.init(room, cat, s);
        else if (gameType === 'wordscramble') wordScrambleLogic.init(room, cat, s);
        else if (gameType === 'speedmath') speedMathLogic.init(room, s);
        else if (gameType === 'emoji') emojiLogic.init(room, cat, s);
        else if (gameType === 'drawguess') drawGuessLogic.init(room, s);
        else if (gameType === 'codenames') codenamesLogic.init(room);
        else if (gameType === 'colorclash') colorClashLogic.init(room);
        else if (gameType === 'blackjack') blackjackLogic.init(room);
        else if (gameType === 'hangman') hangmanLogic.init(room, cat, s);
        else if (gameType === 'memorymatch') memoryMatchLogic.init(room, s);
        else if (gameType === 'spyfall') spyfallLogic.init(room, s);
        else if (gameType === 'wavelength') wavelengthLogic.init(room, s);
        else if (gameType === 'justone') justOneLogic.init(room, s);
        else if (gameType === 'wouldyourather') wouldYouRatherLogic.init(room, s);
        else if (gameType === 'wordchain') wordChainLogic.init(room, s);
        else if (gameType === 'imposter') { s.category = cat; imposterLogic.init(room, s); }
        else if (gameType === 'ludo') ludoLogic.init(room);
        else if (gameType === 'poker') pokerLogic.init(room);
        else if (gameType === 'chess') chessLogic.init(room);
        else if (gameType === 'battleship') battleshipLogic.init(room);
        else if (gameType === 'rummy') rummyLogic.init(room, s);
        else if (gameType === 'coup') coupLogic.init(room);
        else if (gameType === 'wordle') wordleLogic.init(room, s);
        else if (gameType === 'dixit') dixitLogic.init(room, s);
        else if (gameType === 'knowme') knowmeLogic.init(room, s);
        else if (gameType === 'connectfour') connectFourLogic.init(room);
        else if (gameType === 'tictactoe') ticTacToeLogic.init(room);
        else if (gameType === 'partyprompts') partyPromptsLogic.init(room, s);
        else if (gameType === 'kingscup') kingsCupLogic.init(room);
        else if (gameType === 'mostlikelyto') mostLikelyToLogic.init(room, s);
        else if (gameType === 'neverhaveiever') neverHaveIEverLogic.init(room, s);
        else if (gameType === 'truthordrink') truthOrDrinkLogic.init(room, s);
        else if (gameType === 'typingrace') typingRaceLogic.init(room, s);

        io.to(room.code).emit('game-starting', { gameType });

        // For tests, emit state immediately (no 3s delay)
        setTimeout(() => {
          if (room.status !== 'playing' || !room.gameState) return;
          if (gameType === 'trivia') { const d = triviaLogic.getCurrentQuestion(room); if (d) io.to(room.code).emit('game-state', d); }
          else if (gameType === 'wordscramble') { const d = wordScrambleLogic.getCurrentWord(room); if (d) io.to(room.code).emit('game-state', d); }
          else if (gameType === 'speedmath') { const d = speedMathLogic.getCurrentProblem(room); if (d) io.to(room.code).emit('game-state', d); }
          else if (gameType === 'emoji') { const d = emojiLogic.getCurrentPuzzle(room); if (d) io.to(room.code).emit('game-state', d); }
          else if (gameType === 'drawguess') {
            const d = drawGuessLogic.getWordChoices(room);
            if (d) {
              io.to(d.drawerId).emit('word-choices', d);
              room.players.forEach(p => {
                if (p.id !== d.drawerId) io.to(p.id).emit('word-choices', { ...d, words: undefined });
              });
            }
          }
          else if (gameType === 'codenames') {
            room.players.forEach(p => io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id)));
          }
          else if (gameType === 'colorclash') {
            room.players.forEach(p => io.to(p.id).emit('cc-state', colorClashLogic.getPlayerState(room, p.id)));
          }
          else if (gameType === 'blackjack') {
            room.players.forEach(p => io.to(p.id).emit('bj-state', blackjackLogic.getPlayerView(room, p.id)));
          }
          else if (gameType === 'hangman') {
            io.to(room.code).emit('hangman-state', hangmanLogic.getCurrentState(room));
          }
          else if (gameType === 'memorymatch') {
            room.players.forEach(p => io.to(p.id).emit('mm-state', memoryMatchLogic.getPlayerView(room, p.id)));
          }
          else if (gameType === 'spyfall') {
            room.players.forEach(p => {
              if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
            });
          }
          else if (gameType === 'wavelength') {
            const gs = room.gameState;
            const clueGiverId = gs.clueGiverId || gs.giverOrder[gs.currentRound];
            room.players.forEach(p => {
              if (p.isSpectator) return;
              if (p.id === clueGiverId) {
                io.to(p.id).emit('wavelength-clue-view', wavelengthLogic.getClueGiverView(room));
              } else {
                io.to(p.id).emit('wavelength-guess-view', wavelengthLogic.getGuesserView(room));
              }
            });
          }
          else if (gameType === 'justone') {
            const gs = room.gameState;
            room.players.forEach(p => {
              if (p.isSpectator) return;
              if (p.id === gs.guesserId || p.id === gs.guesserOrder[gs.currentRound]) {
                io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
              } else {
                io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
              }
            });
          }
          else if (gameType === 'wouldyourather') {
            const d = wouldYouRatherLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'wordchain') {
            io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
          }
          else if (gameType === 'imposter') {
            room.players.forEach(p => {
              if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
            });
          }
          else if (gameType === 'ludo') {
            room.players.forEach(p => {
              const view = ludoLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('ludo-state', view);
            });
          }
          else if (gameType === 'poker') {
            room.players.forEach(p => {
              const view = pokerLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('poker-state', view);
            });
          }
          else if (gameType === 'chess') {
            room.players.forEach(p => {
              const view = chessLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('chess-state', view);
            });
          }
          else if (gameType === 'battleship') {
            room.players.forEach(p => {
              const view = battleshipLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('battleship-state', view);
            });
          }
          else if (gameType === 'rummy') {
            room.players.forEach(p => {
              const view = rummyLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('rummy-state', view);
            });
          }
          else if (gameType === 'coup') {
            room.players.forEach(p => {
              const view = coupLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('coup-state', view);
            });
          }
          else if (gameType === 'wordle') {
            room.players.forEach(p => {
              const view = wordleLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('wordle-state', view);
            });
          }
          else if (gameType === 'dixit') {
            room.players.forEach(p => {
              const view = dixitLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('dixit-state', view);
            });
          }
          else if (gameType === 'knowme') {
            const d = knowmeLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'connectfour') {
            room.players.forEach(p => {
              const view = connectFourLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('connectfour-state', view);
            });
          }
          else if (gameType === 'tictactoe') {
            room.players.forEach(p => {
              const view = ticTacToeLogic.getPlayerView(room, p.id);
              if (view) io.to(p.id).emit('tictactoe-state', view);
            });
          }
          else if (gameType === 'partyprompts') {
            const d = partyPromptsLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'kingscup') {
            const d = kingsCupLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'mostlikelyto') {
            const d = mostLikelyToLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'neverhaveiever') {
            const d = neverHaveIEverLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'truthordrink') {
            const d = truthOrDrinkLogic.getCurrentQuestion(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
          else if (gameType === 'typingrace') {
            const d = typingRaceLogic.getCurrentPrompt(room);
            if (d) io.to(room.code).emit('game-state', d);
          }
        }, 100);
      });

      socket.on('player-answer', ({ answer }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.status !== 'playing') return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.isSpectator) return;
        let result;
        if (room.currentGame === 'trivia') result = triviaLogic.handleAnswer(room, socket.id, answer);
        else if (room.currentGame === 'wordscramble') result = wordScrambleLogic.handleAnswer(room, socket.id, answer);
        else if (room.currentGame === 'speedmath') result = speedMathLogic.handleAnswer(room, socket.id, answer);
        else if (room.currentGame === 'emoji') result = emojiLogic.handleAnswer(room, socket.id, answer);
        else if (room.currentGame === 'wouldyourather') result = wouldYouRatherLogic.handleAnswer(room, socket.id, answer);
        else if (room.currentGame === 'knowme') result = knowmeLogic.handleAnswer(room, socket.id, answer);
        else if (room.currentGame === 'partyprompts') {
          result = partyPromptsLogic.handleAnswer(room, socket.id, answer);
          if (result) {
            socket.emit('answer-result', result);
            const activePlayers = room.players.filter(p => !p.isSpectator);
            const gs = room.gameState;
            if (gs && gs.acknowledged && Object.keys(gs.acknowledged).length >= activePlayers.length) {
              const roundData = partyPromptsLogic.getRoundResults(room);
              if (roundData) io.to(room.code).emit('round-result', roundData);
            }
            return;
          }
        }
        else if (room.currentGame === 'kingscup') {
          result = kingsCupLogic.handleAnswer(room, socket.id, answer);
          if (result) {
            const state = kingsCupLogic.getCurrentQuestion(room);
            if (state) io.to(room.code).emit('game-state', state);
            if (room.gameState && room.gameState.gameOver) {
              const results = kingsCupLogic.getResults(room);
              io.to(room.code).emit('game-over', results);
              room.status = 'lobby'; room.currentGame = null;
            }
            return;
          }
        }
        else if (room.currentGame === 'mostlikelyto') {
          result = mostLikelyToLogic.handleAnswer(room, socket.id, answer);
          if (result) {
            socket.emit('answer-result', result);
            const activePlayers = room.players.filter(p => !p.isSpectator);
            const gs = room.gameState;
            if (gs && gs.votes && Object.keys(gs.votes).length >= activePlayers.length) {
              const roundData = mostLikelyToLogic.getRoundResults(room);
              if (roundData) io.to(room.code).emit('round-result', roundData);
            }
            return;
          }
        }
        else if (room.currentGame === 'neverhaveiever') {
          result = neverHaveIEverLogic.handleAnswer(room, socket.id, answer);
          if (result) {
            socket.emit('answer-result', result);
            const activePlayers = room.players.filter(p => !p.isSpectator);
            const gs = room.gameState;
            if (gs && gs.answers && Object.keys(gs.answers).length >= activePlayers.length) {
              const roundData = neverHaveIEverLogic.getRoundResults(room);
              if (roundData) io.to(room.code).emit('round-result', roundData);
            }
            return;
          }
        }
        else if (room.currentGame === 'truthordrink') {
          result = truthOrDrinkLogic.handleAnswer(room, socket.id, answer);
          if (result) {
            socket.emit('answer-result', result);
            const gs = room.gameState;
            const hotSeatId = gs && gs.playerOrder ? gs.playerOrder[gs.currentRound % gs.playerOrder.length] : null;
            if (hotSeatId && gs.answers && gs.answers[hotSeatId] !== undefined) {
              const roundData = truthOrDrinkLogic.getRoundResults(room);
              if (roundData) io.to(room.code).emit('round-result', roundData);
            }
            return;
          }
        }
        else if (room.currentGame === 'typingrace') {
          result = typingRaceLogic.handleAnswer(room, socket.id, answer);
          if (result) {
            io.to(room.code).emit('typing-progress', result);
            const gs = room.gameState;
            const activePlayers = room.players.filter(p => !p.isSpectator);
            const allFinished = activePlayers.every(p => gs.playerProgress[p.id] && gs.playerProgress[p.id].finished);
            if (allFinished) {
              const roundData = typingRaceLogic.getRoundResults(room);
              if (roundData) io.to(room.code).emit('round-result', roundData);
            }
            return;
          }
        }
        else if (room.currentGame === 'drawguess') {
          result = drawGuessLogic.handleGuess(room, socket.id, answer);
          if (result) {
            socket.emit('answer-result', { isCorrect: result.isCorrect, isClose: result.isClose, points: result.points });
            io.to(room.code).emit('guess-chat', result.chatEntry);
            if (result.allGuessedCorrect) io.to(room.code).emit('all-guessed');
            return;
          }
        }
        if (result) socket.emit('answer-result', result);
      });

      socket.on('choose-word', ({ wordIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'drawguess') return;
        const data = drawGuessLogic.chooseWord(room, socket.id, wordIndex);
        if (!data) return;
        clearAutoChooseTimer(room);
        room.players.forEach(p => {
          const payload = p.id === data.drawerId ? data : { ...data, word: undefined };
          io.to(p.id).emit('draw-start', payload);
        });
      });

      socket.on('next-question', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id) return;
        const game = room.currentGame;
        let logic;
        if (game === 'trivia') logic = triviaLogic;
        else if (game === 'wordscramble') logic = wordScrambleLogic;
        else if (game === 'speedmath') logic = speedMathLogic;
        else if (game === 'emoji') logic = emojiLogic;
        else if (game === 'drawguess') logic = drawGuessLogic;
        else if (game === 'wouldyourather') logic = wouldYouRatherLogic;
        else if (game === 'knowme') logic = knowmeLogic;
        else if (game === 'partyprompts') logic = partyPromptsLogic;
        else if (game === 'mostlikelyto') logic = mostLikelyToLogic;
        else if (game === 'neverhaveiever') logic = neverHaveIEverLogic;
        else if (game === 'truthordrink') logic = truthOrDrinkLogic;
        else if (game === 'typingrace') logic = typingRaceLogic;
        if (!logic) return;
        const hasNext = logic.nextRound(room);
        if (hasNext) {
          let data;
          if (game === 'trivia') data = triviaLogic.getCurrentQuestion(room);
          else if (game === 'wordscramble') data = wordScrambleLogic.getCurrentWord(room);
          else if (game === 'speedmath') data = speedMathLogic.getCurrentProblem(room);
          else if (game === 'emoji') data = emojiLogic.getCurrentPuzzle(room);
          else if (game === 'typingrace') data = typingRaceLogic.getCurrentPrompt(room);
          else if (game === 'wouldyourather') data = wouldYouRatherLogic.getCurrentQuestion(room);
          else if (game === 'knowme') data = knowmeLogic.getCurrentQuestion(room);
          else if (game === 'partyprompts') data = partyPromptsLogic.getCurrentQuestion(room);
          else if (game === 'mostlikelyto') data = mostLikelyToLogic.getCurrentQuestion(room);
          else if (game === 'neverhaveiever') data = neverHaveIEverLogic.getCurrentQuestion(room);
          else if (game === 'truthordrink') data = truthOrDrinkLogic.getCurrentQuestion(room);
          else if (game === 'drawguess') {
            const choiceData = drawGuessLogic.getWordChoices(room);
            if (choiceData) {
              io.to(choiceData.drawerId).emit('word-choices', choiceData);
              room.players.forEach(p => {
                if (p.id !== choiceData.drawerId) io.to(p.id).emit('word-choices', { ...choiceData, words: undefined });
              });
              return;
            }
          }
          if (data) io.to(room.code).emit('game-state', data);
        } else {
          const results = logic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      socket.on('show-results', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id) return;
        clearHintTimers(room);
        const game = room.currentGame;
        let roundData;
        if (game === 'trivia') roundData = triviaLogic.getRoundResults(room);
        else if (game === 'wordscramble') roundData = wordScrambleLogic.getRoundResults(room);
        else if (game === 'speedmath') roundData = speedMathLogic.getRoundResults(room);
        else if (game === 'emoji') roundData = emojiLogic.getRoundResults(room);
        else if (game === 'drawguess') roundData = drawGuessLogic.getRoundResults(room);
        else if (game === 'wouldyourather') roundData = wouldYouRatherLogic.getRoundResults(room);
        else if (game === 'knowme') roundData = knowmeLogic.getRoundResults(room);
        else if (game === 'partyprompts') roundData = partyPromptsLogic.getRoundResults(room);
        else if (game === 'kingscup') roundData = kingsCupLogic.getRoundResults(room);
        else if (game === 'mostlikelyto') roundData = mostLikelyToLogic.getRoundResults(room);
        else if (game === 'neverhaveiever') roundData = neverHaveIEverLogic.getRoundResults(room);
        else if (game === 'truthordrink') roundData = truthOrDrinkLogic.getRoundResults(room);
        else if (game === 'typingrace') roundData = typingRaceLogic.getRoundResults(room);
        if (roundData) io.to(room.code).emit('round-result', roundData);
      });

      socket.on('end-game-early', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id || room.status !== 'playing') return;
        clearAutoChooseTimer(room); clearHintTimers(room);
        const game = room.currentGame;
        let logic;
        if (game === 'trivia') logic = triviaLogic;
        else if (game === 'wordscramble') logic = wordScrambleLogic;
        else if (game === 'speedmath') logic = speedMathLogic;
        else if (game === 'emoji') logic = emojiLogic;
        else if (game === 'drawguess') logic = drawGuessLogic;
        else if (game === 'codenames') logic = codenamesLogic;
        else if (game === 'colorclash') logic = colorClashLogic;
        else if (game === 'blackjack') logic = blackjackLogic;
        else if (game === 'hangman') logic = hangmanLogic;
        else if (game === 'memorymatch') logic = memoryMatchLogic;
        else if (game === 'spyfall') logic = spyfallLogic;
        else if (game === 'wavelength') logic = wavelengthLogic;
        else if (game === 'justone') logic = justOneLogic;
        else if (game === 'wouldyourather') logic = wouldYouRatherLogic;
        else if (game === 'wordchain') logic = wordChainLogic;
        else if (game === 'imposter') logic = imposterLogic;
        else if (game === 'ludo') logic = ludoLogic;
        else if (game === 'poker') logic = pokerLogic;
        else if (game === 'chess') logic = chessLogic;
        else if (game === 'battleship') logic = battleshipLogic;
        else if (game === 'rummy') logic = rummyLogic;
        else if (game === 'coup') logic = coupLogic;
        else if (game === 'wordle') logic = wordleLogic;
        else if (game === 'dixit') logic = dixitLogic;
        else if (game === 'knowme') logic = knowmeLogic;
        else if (game === 'connectfour') logic = connectFourLogic;
        else if (game === 'tictactoe') logic = ticTacToeLogic;
        else if (game === 'partyprompts') logic = partyPromptsLogic;
        else if (game === 'kingscup') logic = kingsCupLogic;
        else if (game === 'mostlikelyto') logic = mostLikelyToLogic;
        else if (game === 'neverhaveiever') logic = neverHaveIEverLogic;
        else if (game === 'truthordrink') logic = truthOrDrinkLogic;
        else if (game === 'typingrace') logic = typingRaceLogic;
        if (logic) {
          const results = logic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      socket.on('rematch', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id || !room.lastGame) return;
        const { gameType, category, settings } = room.lastGame;
        room.currentGame = gameType; room.status = 'playing';
        room.players.forEach(p => { p.isSpectator = false; });
        if (gameType === 'trivia') triviaLogic.init(room, category, settings);
        else if (gameType === 'wordscramble') wordScrambleLogic.init(room, category, settings);
        else if (gameType === 'speedmath') speedMathLogic.init(room, settings);
        else if (gameType === 'emoji') emojiLogic.init(room, category, settings);
        else if (gameType === 'drawguess') drawGuessLogic.init(room, settings);
        else if (gameType === 'codenames') codenamesLogic.init(room);
        else if (gameType === 'colorclash') colorClashLogic.init(room);
        else if (gameType === 'blackjack') blackjackLogic.init(room);
        else if (gameType === 'hangman') hangmanLogic.init(room, category, settings);
        else if (gameType === 'memorymatch') memoryMatchLogic.init(room, settings);
        else if (gameType === 'spyfall') spyfallLogic.init(room, settings);
        else if (gameType === 'wavelength') wavelengthLogic.init(room, settings);
        else if (gameType === 'justone') justOneLogic.init(room, settings);
        else if (gameType === 'wouldyourather') wouldYouRatherLogic.init(room, settings);
        else if (gameType === 'wordchain') wordChainLogic.init(room, settings);
        else if (gameType === 'imposter') { settings.category = category; imposterLogic.init(room, settings); }
        else if (gameType === 'ludo') ludoLogic.init(room);
        else if (gameType === 'poker') pokerLogic.init(room);
        else if (gameType === 'chess') chessLogic.init(room);
        else if (gameType === 'battleship') battleshipLogic.init(room);
        else if (gameType === 'rummy') rummyLogic.init(room, settings);
        else if (gameType === 'coup') coupLogic.init(room);
        else if (gameType === 'wordle') wordleLogic.init(room, settings);
        else if (gameType === 'dixit') dixitLogic.init(room, settings);
        else if (gameType === 'knowme') knowmeLogic.init(room, settings);
        else if (gameType === 'connectfour') connectFourLogic.init(room);
        else if (gameType === 'tictactoe') ticTacToeLogic.init(room);
        else if (gameType === 'partyprompts') partyPromptsLogic.init(room, settings);
        else if (gameType === 'kingscup') kingsCupLogic.init(room);
        else if (gameType === 'mostlikelyto') mostLikelyToLogic.init(room, settings);
        else if (gameType === 'neverhaveiever') neverHaveIEverLogic.init(room, settings);
        else if (gameType === 'truthordrink') truthOrDrinkLogic.init(room, settings);
        else if (gameType === 'typingrace') typingRaceLogic.init(room, settings);
        io.to(room.code).emit('game-starting', { gameType });
      });

      socket.on('back-to-lobby', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id) return;
        clearAutoChooseTimer(room); clearHintTimers(room);
        room.status = 'lobby'; room.currentGame = null; room.gameState = null;
        room.players.forEach(p => { p.isSpectator = false; });
        io.to(room.code).emit('back-to-lobby', { players: room.players });
      });

      // Hangman
      socket.on('hangman-guess', ({ letter }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'hangman') return;
        const result = hangmanLogic.handleGuess(room, socket.id, letter);
        if (!result) return;
        if (result.action === 'solved' || result.action === 'hanged') {
          io.to(room.code).emit('hangman-round-over', hangmanLogic.getCurrentState(room));
        } else {
          io.to(room.code).emit('hangman-update', hangmanLogic.getCurrentState(room));
        }
      });

      socket.on('hangman-timeout', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'hangman') return;
        const result = hangmanLogic.timeOut(room);
        if (!result) return;
        io.to(room.code).emit('hangman-round-over', hangmanLogic.getCurrentState(room));
      });

      socket.on('hangman-next', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'hangman' || room.hostId !== socket.id) return;
        const result = hangmanLogic.nextRound(room);
        if (!result) return;
        if (result.action === 'gameOver') {
          io.to(room.code).emit('game-over', hangmanLogic.getResults(room));
          room.status = 'lobby'; room.currentGame = null;
        } else {
          io.to(room.code).emit('hangman-state', hangmanLogic.getCurrentState(room));
        }
      });

      // Memory Match
      socket.on('mm-flip', ({ cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'memorymatch') return;
        const result = memoryMatchLogic.flipCard(room, socket.id, cardIndex);
        if (!result) return;
        if (result.action === 'gameOver') {
          io.to(room.code).emit('game-over', memoryMatchLogic.getResults(room));
          room.status = 'lobby'; room.currentGame = null;
        } else if (result.action === 'match') {
          room.players.forEach(p => io.to(p.id).emit('mm-match', memoryMatchLogic.getPlayerView(room, p.id)));
        } else if (result.action === 'mismatch') {
          room.players.forEach(p => io.to(p.id).emit('mm-mismatch', memoryMatchLogic.getPlayerView(room, p.id)));
        } else {
          room.players.forEach(p => io.to(p.id).emit('mm-flip', memoryMatchLogic.getPlayerView(room, p.id)));
        }
      });

      socket.on('mm-hide', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'memorymatch') return;
        const result = memoryMatchLogic.hideMismatch(room);
        if (!result) return;
        room.players.forEach(p => io.to(p.id).emit('mm-update', memoryMatchLogic.getPlayerView(room, p.id)));
      });

      // Color Clash
      socket.on('cc-play', ({ cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'colorclash') return;
        const result = colorClashLogic.playCard(room, socket.id, cardIndex);
        if (!result) return;
        if (result.action === 'win') {
          io.to(room.code).emit('cc-over', colorClashLogic.getResults(room));
          room.status = 'lobby'; room.currentGame = null;
        } else {
          room.players.forEach(p => io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id)));
        }
      });

      socket.on('cc-draw', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'colorclash') return;
        const result = colorClashLogic.drawCards(room, socket.id);
        if (result) room.players.forEach(p => io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id)));
      });

      socket.on('cc-pick-color', ({ color }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'colorclash') return;
        const result = colorClashLogic.pickColor(room, socket.id, color);
        if (result) room.players.forEach(p => io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id)));
      });

      socket.on('cc-uno', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'colorclash') return;
        const result = colorClashLogic.callUno(room, socket.id);
        if (result) room.players.forEach(p => io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id)));
      });

      socket.on('cc-catch', ({ targetId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'colorclash') return;
        const result = colorClashLogic.catchUno(room, socket.id, targetId);
        if (result) room.players.forEach(p => io.to(p.id).emit('cc-update', colorClashLogic.getPlayerState(room, p.id)));
      });

      // Blackjack
      socket.on('bj-bet', ({ amount }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'blackjack') return;
        const result = blackjackLogic.placeBet(room, socket.id, amount);
        if (result) room.players.forEach(p => io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id)));
      });

      socket.on('bj-hit', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'blackjack') return;
        const result = blackjackLogic.hit(room, socket.id);
        if (result) room.players.forEach(p => io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id)));
      });

      socket.on('bj-stand', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'blackjack') return;
        const result = blackjackLogic.stand(room, socket.id);
        if (result) room.players.forEach(p => io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id)));
      });

      socket.on('bj-double', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'blackjack') return;
        const result = blackjackLogic.doubleDown(room, socket.id);
        if (result) room.players.forEach(p => io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id)));
      });

      socket.on('bj-new-round', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'blackjack' || room.hostId !== socket.id) return;
        const result = blackjackLogic.newRound(room);
        if (result) room.players.forEach(p => io.to(p.id).emit('bj-update', blackjackLogic.getPlayerView(room, p.id)));
      });

      // Codenames
      socket.on('codenames-join', ({ team }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'codenames') return;
        const result = codenamesLogic.joinTeam(room, socket.id, team);
        if (result) room.players.forEach(p => io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id)));
      });
      socket.on('codenames-spymaster', ({ team }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'codenames') return;
        const result = codenamesLogic.setSpymaster(room, socket.id, team);
        if (result) room.players.forEach(p => io.to(p.id).emit('codenames-teams', codenamesLogic.getGameState(room, p.id)));
      });
      socket.on('codenames-start', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'codenames' || room.hostId !== socket.id) return;
        const result = codenamesLogic.startGame(room);
        if (result) room.players.forEach(p => io.to(p.id).emit('codenames-state', codenamesLogic.getGameState(room, p.id)));
      });
      socket.on('codenames-clue', ({ word, number }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'codenames') return;
        const result = codenamesLogic.giveClue(room, socket.id, word, number);
        if (result) room.players.forEach(p => io.to(p.id).emit('codenames-update', codenamesLogic.getGameState(room, p.id)));
      });
      socket.on('codenames-pick', ({ cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'codenames') return;
        const result = codenamesLogic.pickCard(room, socket.id, cardIndex);
        if (result) {
          if (result.gameOver) {
            io.to(room.code).emit('codenames-over', codenamesLogic.getResults(room));
            room.status = 'lobby'; room.currentGame = null;
          } else {
            room.players.forEach(p => io.to(p.id).emit('codenames-update', codenamesLogic.getGameState(room, p.id)));
          }
        }
      });
      socket.on('codenames-end-turn', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'codenames') return;
        const result = codenamesLogic.endTurn(room, socket.id);
        if (result) room.players.forEach(p => io.to(p.id).emit('codenames-update', codenamesLogic.getGameState(room, p.id)));
      });

      // Spyfall
      socket.on('spyfall-next-asker', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'spyfall') return;
        spyfallLogic.advanceAsker(room);
        room.players.forEach(p => {
          if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
        });
      });
      socket.on('spyfall-vote-start', ({ targetId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'spyfall') return;
        const result = spyfallLogic.startVote(room, targetId);
        if (result) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('spyfall-voting', spyfallLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('spyfall-vote', ({ vote }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'spyfall') return;
        const result = spyfallLogic.castVote(room, socket.id, vote);
        if (!result) return;
        if (result.waiting) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('spyfall-voting', spyfallLogic.getPlayerView(room, p.id));
          });
        } else if (result.resolved) {
          io.to(room.code).emit('spyfall-vote-result', result);
          if (result.spyCaught !== undefined) {
            room.players.forEach(p => {
              if (!p.isSpectator) io.to(p.id).emit('spyfall-reveal', spyfallLogic.getPlayerView(room, p.id));
            });
          }
        }
      });
      socket.on('spyfall-guess', ({ guess }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'spyfall') return;
        const result = spyfallLogic.spyGuessLocation(room, socket.id, guess);
        if (result) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('spyfall-reveal', spyfallLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('spyfall-timeout', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'spyfall') return;
        const result = spyfallLogic.timeUp(room);
        if (result) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('spyfall-reveal', spyfallLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('spyfall-next', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'spyfall' || room.hostId !== socket.id) return;
        const hasNext = spyfallLogic.nextRound(room);
        if (hasNext) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('spyfall-state', spyfallLogic.getPlayerView(room, p.id));
          });
        } else {
          const results = spyfallLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Imposter
      socket.on('imposter-describe', ({ description }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'imposter') return;
        const result = imposterLogic.submitDescription(room, socket.id, description);
        if (!result) return;
        room.players.forEach(p => {
          if (!p.isSpectator) {
            if (result.allDone) {
              io.to(p.id).emit('imposter-voting', imposterLogic.getPlayerView(room, p.id));
            } else {
              io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
            }
          }
        });
      });
      socket.on('imposter-skip', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'imposter' || room.hostId !== socket.id) return;
        const result = imposterLogic.skipDescription(room);
        if (!result) return;
        room.players.forEach(p => {
          if (!p.isSpectator) {
            if (result.allDone) {
              io.to(p.id).emit('imposter-voting', imposterLogic.getPlayerView(room, p.id));
            } else {
              io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
            }
          }
        });
      });
      socket.on('imposter-vote', ({ targetId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'imposter') return;
        const result = imposterLogic.castVote(room, socket.id, targetId);
        if (!result) return;
        if (result.waiting) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('imposter-voting', imposterLogic.getPlayerView(room, p.id));
          });
        } else if (result.resolved) {
          if (result.imposterCaught && result.awaitingGuess) {
            room.players.forEach(p => {
              if (!p.isSpectator) io.to(p.id).emit('imposter-guess-phase', imposterLogic.getPlayerView(room, p.id));
            });
          } else {
            room.players.forEach(p => {
              if (!p.isSpectator) io.to(p.id).emit('imposter-reveal', imposterLogic.getPlayerView(room, p.id));
            });
          }
        }
      });
      socket.on('imposter-guess-word', ({ guess }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'imposter') return;
        const result = imposterLogic.imposterGuessWord(room, socket.id, guess);
        if (result) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('imposter-reveal', imposterLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('imposter-continue', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'imposter' || room.hostId !== socket.id) return;
        const continued = imposterLogic.continueVotingRound(room);
        if (continued) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('imposter-next', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'imposter' || room.hostId !== socket.id) return;
        const hasNext = imposterLogic.nextRound(room);
        if (hasNext) {
          room.players.forEach(p => {
            if (!p.isSpectator) io.to(p.id).emit('imposter-state', imposterLogic.getPlayerView(room, p.id));
          });
        } else {
          const results = imposterLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Ludo
      socket.on('ludo-roll', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'ludo') return;
        const result = ludoLogic.rollDice(room, socket.id);
        if (result) {
          room.players.forEach(p => {
            io.to(p.id).emit('ludo-update', ludoLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('ludo-move', ({ tokenIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'ludo') return;
        const result = ludoLogic.moveToken(room, socket.id, tokenIndex);
        if (result) {
          room.players.forEach(p => {
            io.to(p.id).emit('ludo-update', ludoLogic.getPlayerView(room, p.id));
          });
        }
      });
      socket.on('ludo-end', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'ludo' || room.hostId !== socket.id) return;
        const results = ludoLogic.getResults(room);
        io.to(room.code).emit('game-over', results);
        room.status = 'lobby'; room.currentGame = null;
      });

      // Poker
      socket.on('poker-fold', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker') return;
        const result = pokerLogic.fold(room, socket.id);
        if (result) {
          room.players.forEach(p => io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id)));
        }
      });
      socket.on('poker-check', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker') return;
        const result = pokerLogic.check(room, socket.id);
        if (result) {
          room.players.forEach(p => io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id)));
        }
      });
      socket.on('poker-call', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker') return;
        const result = pokerLogic.call(room, socket.id);
        if (result) {
          room.players.forEach(p => io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id)));
        }
      });
      socket.on('poker-raise', ({ amount }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker') return;
        const result = pokerLogic.raise(room, socket.id, amount);
        if (result) {
          room.players.forEach(p => io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id)));
        }
      });
      socket.on('poker-allin', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker') return;
        const result = pokerLogic.allIn(room, socket.id);
        if (result) {
          room.players.forEach(p => io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id)));
        }
      });
      socket.on('poker-new-hand', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker' || room.hostId !== socket.id) return;
        const result = pokerLogic.newHand(room);
        if (result) {
          room.players.forEach(p => io.to(p.id).emit('poker-update', pokerLogic.getPlayerView(room, p.id)));
        }
      });
      socket.on('poker-end', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'poker' || room.hostId !== socket.id) return;
        const results = pokerLogic.getResults(room);
        io.to(room.code).emit('game-over', results);
        room.status = 'lobby'; room.currentGame = null;
      });

      // Wavelength
      socket.on('wavelength-clue', ({ clue }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wavelength') return;
        const result = wavelengthLogic.submitClue(room, socket.id, clue);
        if (result) {
          const gs = room.gameState;
          room.players.forEach(p => {
            if (p.isSpectator) return;
            if (p.id === gs.giverOrder[gs.currentRound]) return;
            const view = wavelengthLogic.getGuesserView(room);
            view.hasGuessed = !!gs.guesses[p.id];
            io.to(p.id).emit('wavelength-guess-view', view);
          });
        }
      });
      socket.on('wavelength-guess', ({ guess }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wavelength') return;
        const result = wavelengthLogic.submitGuess(room, socket.id, guess);
        if (!result) return;
        const gs = room.gameState;
        const guessers = room.players.filter(p => !p.isSpectator && p.id !== gs.giverOrder[gs.currentRound]);
        const allGuessed = guessers.every(p => gs.guesses[p.id] !== undefined);
        if (allGuessed) {
          const reveal = wavelengthLogic.getRevealData(room);
          io.to(room.code).emit('wavelength-reveal', reveal);
        }
      });
      socket.on('wavelength-next', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wavelength' || room.hostId !== socket.id) return;
        const hasNext = wavelengthLogic.nextRound(room);
        if (hasNext) {
          const gs = room.gameState;
          room.players.forEach(p => {
            if (p.isSpectator) return;
            if (p.id === gs.giverOrder[gs.currentRound]) {
              io.to(p.id).emit('wavelength-clue-view', wavelengthLogic.getClueGiverView(room));
            } else {
              io.to(p.id).emit('wavelength-guess-view', wavelengthLogic.getGuesserView(room));
            }
          });
        } else {
          const results = wavelengthLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Just One
      socket.on('justone-clue', ({ clue }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'justone') return;
        const result = justOneLogic.submitClue(room, socket.id, clue);
        if (!result) return;
        const gs = room.gameState;
        const clueGivers = room.players.filter(p => !p.isSpectator && p.id !== gs.guesserOrder[gs.currentRound]);
        const allSubmitted = clueGivers.every(p => gs.clues[p.id] !== undefined);
        if (allSubmitted) gs.phase = 'review';
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.guesserOrder[gs.currentRound]) {
            io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
          } else {
            io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
          }
        });
      });
      socket.on('justone-confirm', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'justone' || room.hostId !== socket.id) return;
        const filtered = justOneLogic.filterClues(room);
        if (!filtered) return;
        const gs = room.gameState;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.guesserOrder[gs.currentRound]) {
            io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
          } else {
            io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
          }
        });
      });
      socket.on('justone-guess', ({ guess }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'justone') return;
        const result = justOneLogic.submitGuess(room, socket.id, guess);
        if (!result) return;
        const gs = room.gameState;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.guesserOrder[gs.currentRound]) {
            io.to(p.id).emit('justone-state', { ...justOneLogic.getGuesserView(room), reveal: result });
          } else {
            io.to(p.id).emit('justone-state', { ...justOneLogic.getClueGiverView(room, p.id), reveal: result });
          }
        });
      });
      socket.on('justone-skip', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'justone') return;
        const result = justOneLogic.skipGuess(room);
        if (!result) return;
        const gs = room.gameState;
        room.players.forEach(p => {
          if (p.isSpectator) return;
          if (p.id === gs.guesserOrder[gs.currentRound]) {
            io.to(p.id).emit('justone-state', { ...justOneLogic.getGuesserView(room), reveal: result });
          } else {
            io.to(p.id).emit('justone-state', { ...justOneLogic.getClueGiverView(room, p.id), reveal: result });
          }
        });
      });
      socket.on('justone-next', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'justone' || room.hostId !== socket.id) return;
        const hasNext = justOneLogic.nextRound(room);
        if (hasNext) {
          const gs = room.gameState;
          room.players.forEach(p => {
            if (p.isSpectator) return;
            if (p.id === gs.guesserOrder[gs.currentRound]) {
              io.to(p.id).emit('justone-state', justOneLogic.getGuesserView(room));
            } else {
              io.to(p.id).emit('justone-state', justOneLogic.getClueGiverView(room, p.id));
            }
          });
        } else {
          const results = justOneLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Word Chain
      socket.on('wordchain-word', ({ word }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wordchain') return;
        const result = wordChainLogic.handleWord(room, socket.id, word);
        if (!result) return;
        if (result.eliminated) {
          io.to(room.code).emit('wordchain-eliminated', result);
        }
        if (result.gameOver) {
          const results = wordChainLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        } else {
          io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
        }
      });
      socket.on('wordchain-timeout', ({ playerId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wordchain') return;
        const result = wordChainLogic.handleTimeout(room, playerId);
        if (!result) return;
        if (result.eliminated) {
          io.to(room.code).emit('wordchain-eliminated', result);
        }
        if (result.gameOver) {
          const results = wordChainLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        } else {
          io.to(room.code).emit('wordchain-state', wordChainLogic.getCurrentState(room));
        }
      });

      // Chess
      socket.on('chess-move', ({ fromR, fromC, toR, toC, promotion }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'chess') return;
        const result = chessLogic.makeMove(room, socket.id, fromR, fromC, toR, toC, promotion);
        if (!result) return;
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-update', view);
        });
        if (result.gameOver) {
          const results = chessLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('chess-ai-move', ({ fromR, fromC, toR, toC, promotion }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'chess') return;
        const gs = room.gameState;
        if (!gs || !gs.aiMode) return;
        const aiId = gs.whiteId === socket.id ? gs.blackId : (gs.blackId === socket.id ? gs.whiteId : null);
        if (!aiId) return;
        const result = chessLogic.makeMove(room, aiId, fromR, fromC, toR, toC, promotion);
        if (!result) return;
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-update', view);
        });
        if (result.gameOver) {
          const results = chessLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('chess-resign', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'chess') return;
        const result = chessLogic.resign(room, socket.id);
        if (!result) return;
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-update', view);
        });
        const results = chessLogic.getResults(room);
        io.to(room.code).emit('game-over', results);
        room.status = 'lobby'; room.currentGame = null;
      });
      socket.on('chess-draw-offer', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'chess') return;
        const result = chessLogic.offerDraw(room, socket.id);
        if (!result) return;
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-update', view);
        });
      });
      socket.on('chess-draw-respond', ({ accept }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'chess') return;
        const result = chessLogic.respondDraw(room, socket.id, accept);
        if (!result) return;
        room.players.forEach(p => {
          const view = chessLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('chess-update', view);
        });
        if (result.accepted) {
          const results = chessLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Battleship
      socket.on('battleship-place', ({ ships }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'battleship') return;
        const result = battleshipLogic.placeShips(room, socket.id, ships);
        if (!result) return;
        room.players.forEach(p => {
          const view = battleshipLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('battleship-update', view);
        });
      });
      socket.on('battleship-auto-place', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'battleship') return;
        const result = battleshipLogic.autoPlaceShips(room, socket.id);
        if (!result) return;
        room.players.forEach(p => {
          const view = battleshipLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('battleship-update', view);
        });
      });
      socket.on('battleship-fire', ({ row, col }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'battleship') return;
        const result = battleshipLogic.fireShot(room, socket.id, row, col);
        if (!result) return;
        room.players.forEach(p => {
          const view = battleshipLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('battleship-update', view);
        });
        if (result.gameOver) {
          const results = battleshipLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Connect Four
      socket.on('connectfour-move', ({ col }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'connectfour') return;
        const result = connectFourLogic.dropDisc(room, socket.id, col);
        if (!result) return;
        room.players.forEach(p => {
          const view = connectFourLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('connectfour-update', view);
        });
        if (result.action === 'win' || result.action === 'draw') {
          const results = connectFourLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Tic Tac Toe
      socket.on('tictactoe-move', ({ row, col }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'tictactoe') return;
        const result = ticTacToeLogic.makeMove(room, socket.id, row, col);
        if (!result) return;
        room.players.forEach(p => {
          const view = ticTacToeLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('tictactoe-update', view);
        });
        if (result.action === 'win' || result.action === 'draw') {
          const results = ticTacToeLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Rummy
      socket.on('rummy-draw-deck', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'rummy') return;
        const result = rummyLogic.drawFromDeck(room, socket.id);
        if (!result) return;
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-update', view);
        });
      });
      socket.on('rummy-draw-discard', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'rummy') return;
        const result = rummyLogic.drawFromDiscard(room, socket.id);
        if (!result) return;
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-update', view);
        });
      });
      socket.on('rummy-discard', ({ cardId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'rummy') return;
        const result = rummyLogic.discard(room, socket.id, cardId);
        if (!result) return;
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-update', view);
        });
        if (result.gameOver) {
          const results = rummyLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('rummy-lay-meld', ({ cardIds }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'rummy') return;
        const result = rummyLogic.layMeld(room, socket.id, cardIds);
        if (!result) {
          socket.emit('rummy-error', { message: 'Invalid meld!' });
          return;
        }
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-update', view);
        });
      });
      socket.on('rummy-lay-off', ({ cardIndex, meldIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'rummy') return;
        const result = rummyLogic.layOff(room, socket.id, cardIndex, meldIndex);
        if (!result) return;
        room.players.forEach(p => {
          const view = rummyLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('rummy-update', view);
        });
      });

      // Coup
      socket.on('coup-action', ({ action, targetId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'coup') return;
        const result = coupLogic.takeAction(room, socket.id, action, targetId);
        if (!result) return;
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-update', view);
        });
        if (result.gameOver) {
          const results = coupLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('coup-challenge', ({ challenge }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'coup') return;
        const result = coupLogic.respondChallenge(room, socket.id, challenge);
        if (!result) return;
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-update', view);
        });
        if (result.gameOver) {
          const results = coupLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('coup-counter', ({ counter, claimedRole }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'coup') return;
        const result = coupLogic.respondCounter(room, socket.id, counter, claimedRole);
        if (!result) return;
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-update', view);
        });
        if (result.gameOver) {
          const results = coupLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('coup-counter-challenge', ({ challenge }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'coup') return;
        const result = coupLogic.respondCounterChallenge(room, socket.id, challenge);
        if (!result) return;
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-update', view);
        });
        if (result.gameOver) {
          const results = coupLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('coup-lose-card', ({ cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'coup') return;
        const result = coupLogic.loseCard(room, socket.id, cardIndex);
        if (!result) return;
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-update', view);
        });
        if (result.gameOver) {
          const results = coupLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('coup-exchange', ({ keptCards }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'coup') return;
        const result = coupLogic.exchangeCards(room, socket.id, keptCards);
        if (!result) return;
        room.players.forEach(p => {
          const view = coupLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('coup-update', view);
        });
        if (result.gameOver) {
          const results = coupLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });

      // Wordle
      socket.on('wordle-guess', ({ guess }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wordle') return;
        const result = wordleLogic.submitGuess(room, socket.id, guess);
        if (!result) return;
        if (result.error) {
          socket.emit('wordle-error', { message: result.error });
          return;
        }
        room.players.forEach(p => {
          const view = wordleLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('wordle-update', view);
        });
        if (result.allDone) {
          const gs = room.gameState;
          if (gs.phase === 'finished') {
            const results = wordleLogic.getResults(room);
            io.to(room.code).emit('game-over', results);
            room.status = 'lobby'; room.currentGame = null;
          }
        }
      });
      socket.on('wordle-next', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'wordle' || room.hostId !== socket.id) return;
        const hasNext = wordleLogic.nextRound(room);
        if (!hasNext) {
          const results = wordleLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
          return;
        }
        room.players.forEach(p => {
          const view = wordleLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('wordle-update', view);
        });
      });

      // Dixit
      socket.on('dixit-submit-clue', ({ clue, cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'dixit') return;
        const result = dixitLogic.submitClue(room, socket.id, clue, cardIndex);
        if (!result) return;
        room.players.forEach(p => {
          const view = dixitLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('dixit-update', view);
        });
      });
      socket.on('dixit-play-card', ({ cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'dixit') return;
        const result = dixitLogic.playCard(room, socket.id, cardIndex);
        if (!result) return;
        room.players.forEach(p => {
          const view = dixitLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('dixit-update', view);
        });
      });
      socket.on('dixit-vote', ({ cardIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'dixit') return;
        const result = dixitLogic.vote(room, socket.id, cardIndex);
        if (!result) return;
        room.players.forEach(p => {
          const view = dixitLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('dixit-update', view);
        });
        if (result.allVoted && room.gameState && room.gameState.phase === 'finished') {
          const results = dixitLogic.getResults(room);
          io.to(room.code).emit('game-over', results);
          room.status = 'lobby'; room.currentGame = null;
        }
      });
      socket.on('dixit-next-round', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentGame !== 'dixit' || room.hostId !== socket.id) return;
        const result = dixitLogic.nextRound(room);
        if (!result) return;
        room.players.forEach(p => {
          const view = dixitLogic.getPlayerView(room, p.id);
          if (view) io.to(p.id).emit('dixit-update', view);
        });
      });

      // Reactions
      socket.on('reaction', ({ emoji }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        const allowed = ['😂','🔥','👏','❤️','😮','💀','🎉','👀','😭','🤔'];
        if (!allowed.includes(emoji)) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        socket.to(room.code).emit('reaction', { name: player.name, emoji });
      });

      // Kick
      socket.on('kick-player', ({ playerId }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.hostId !== socket.id) return;
        const idx = room.players.findIndex(p => p.id === playerId);
        if (idx !== -1 && !room.players[idx].isHost) {
          room.players.splice(idx, 1);
          io.to(playerId).emit('kicked');
          const kickedSocket = io.sockets.sockets.get(playerId);
          if (kickedSocket) { kickedSocket.leave(room.code); kickedSocket.roomCode = null; }
          io.to(room.code).emit('player-joined', { players: room.players });
        }
      });

      // Disconnect
      socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.hostId === socket.id) {
          if (room.players.length > 0) {
            room.players[0].isHost = true;
            room.hostId = room.players[0].id;
            io.to(room.players[0].id).emit('you-are-host');
          } else {
            rooms.delete(code);
            return;
          }
        }
        io.to(code).emit('player-joined', { players: room.players });
      });
    });

    httpServer.listen(0, () => {
      const port = httpServer.address().port;
      resolve({ httpServer, io, port, baseUrl: `http://localhost:${port}`, rooms });
    });
  });
}

/**
 * Create a connected Socket.IO client with event buffering
 */
function createClient(port) {
  return new Promise((resolve) => {
    const client = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });
    // Event buffer to prevent race conditions
    client._eventBuffer = {};
    client._eventWaiters = {};
    client.onAny((event, data) => {
      // If someone is waiting for this event, resolve immediately
      if (client._eventWaiters[event] && client._eventWaiters[event].length > 0) {
        const waiter = client._eventWaiters[event].shift();
        waiter(data);
        return;
      }
      // Otherwise buffer it
      if (!client._eventBuffer[event]) client._eventBuffer[event] = [];
      client._eventBuffer[event].push(data);
    });
    client.on('connect', () => resolve(client));
  });
}

/**
 * Wait for a specific event with timeout (uses event buffer)
 */
function waitForEvent(client, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    // Check buffer first
    if (client._eventBuffer && client._eventBuffer[event] && client._eventBuffer[event].length > 0) {
      return resolve(client._eventBuffer[event].shift());
    }

    const timer = setTimeout(() => {
      // Remove waiter on timeout
      if (client._eventWaiters && client._eventWaiters[event]) {
        client._eventWaiters[event] = client._eventWaiters[event].filter(w => w !== waiterFn);
      }
      reject(new Error(`Timeout waiting for "${event}"`));
    }, timeoutMs);

    const waiterFn = (data) => {
      clearTimeout(timer);
      resolve(data);
    };

    if (!client._eventWaiters) client._eventWaiters = {};
    if (!client._eventWaiters[event]) client._eventWaiters[event] = [];
    client._eventWaiters[event].push(waiterFn);
  });
}

/**
 * Wait ms
 */
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Cleanup — disconnect all clients and close server
 */
function cleanup(clients, serverObj) {
  return new Promise((resolve) => {
    clients.forEach(c => { if (c.connected) c.disconnect(); });
    if (serverObj && serverObj.httpServer) {
      serverObj.io.close();
      serverObj.httpServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

module.exports = { startServer, createClient, waitForEvent, delay, cleanup };
