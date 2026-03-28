// Sound effects — Web Audio API synthesized tones
// No external audio files needed

const SFX = (function () {
  let ctx = null;
  let muted = localStorage.getItem('clutch-muted') === 'true';

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function resumeCtx() {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
  }

  // Core: play a tone with envelope
  function playTone(freq, type, duration, volume, delay) {
    if (muted) return;
    try {
      resumeCtx();
      const c = getCtx();
      const t = delay ? c.currentTime + delay : c.currentTime;

      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume || 0.15, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (duration || 0.15));

      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t);
      osc.stop(t + (duration || 0.15) + 0.01);
    } catch (e) { /* ignore audio errors */ }
  }

  // Play noise burst (for errors, buzzes)
  function playNoise(duration, volume) {
    if (muted) return;
    try {
      resumeCtx();
      const c = getCtx();
      const t = c.currentTime;
      const len = c.sampleRate * (duration || 0.15);
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

      const src = c.createBufferSource();
      const gain = c.createGain();
      src.buffer = buffer;
      gain.gain.setValueAtTime(volume || 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (duration || 0.15));
      src.connect(gain);
      gain.connect(c.destination);
      src.start(t);
    } catch (e) { /* ignore */ }
  }

  // ════════════════════════════════════
  // NAMED SOUND EFFECTS
  // ════════════════════════════════════

  return {
    // Countdown tick (game starting)
    tick() { playTone(800, 'sine', 0.08, 0.1); },

    // Game starts
    gameStart() {
      playTone(523, 'square', 0.12, 0.12, 0);     // C5
      playTone(659, 'square', 0.12, 0.12, 0.12);   // E5
      playTone(784, 'square', 0.2, 0.15, 0.24);    // G5
    },

    // Correct answer
    correct() {
      playTone(660, 'sine', 0.12, 0.15, 0);
      playTone(880, 'sine', 0.18, 0.18, 0.1);
    },

    // Wrong answer
    wrong() {
      playTone(250, 'sawtooth', 0.2, 0.1, 0);
      playTone(200, 'sawtooth', 0.25, 0.08, 0.15);
    },

    // Close guess (Draw & Guess)
    close() { playTone(440, 'triangle', 0.15, 0.1); },

    // Timer warning (last 5 seconds) — urgent double-tick
    timerWarn() {
      playTone(1200, 'sine', 0.04, 0.06);
      playTone(900, 'triangle', 0.06, 0.05, 0.05);
    },

    // Time's up
    timeUp() {
      playTone(400, 'sawtooth', 0.15, 0.1, 0);
      playTone(300, 'sawtooth', 0.3, 0.12, 0.12);
    },

    // Player joins lobby
    playerJoin() { playTone(700, 'sine', 0.1, 0.08); },

    // Player kicked
    kicked() {
      playTone(300, 'square', 0.12, 0.1, 0);
      playTone(200, 'square', 0.2, 0.1, 0.1);
    },

    // Round results appear
    roundResults() {
      playTone(523, 'sine', 0.1, 0.1, 0);
      playTone(659, 'sine', 0.1, 0.1, 0.08);
      playTone(784, 'sine', 0.15, 0.12, 0.16);
    },

    // Game over fanfare
    gameOver() {
      playTone(523, 'square', 0.15, 0.12, 0);      // C5
      playTone(659, 'square', 0.15, 0.12, 0.15);    // E5
      playTone(784, 'square', 0.15, 0.12, 0.3);     // G5
      playTone(1047, 'square', 0.35, 0.15, 0.45);   // C6
    },

    // Click / button press
    click() { playTone(1000, 'sine', 0.04, 0.06); },

    // Chat message received
    chat() { playTone(1200, 'sine', 0.05, 0.05); },

    // Hint reveal
    hint() {
      playTone(880, 'triangle', 0.08, 0.08, 0);
      playTone(1100, 'triangle', 0.1, 0.1, 0.07);
    },

    // All guessed correctly
    allGuessed() {
      playTone(600, 'sine', 0.1, 0.12, 0);
      playTone(800, 'sine', 0.1, 0.12, 0.08);
      playTone(1000, 'sine', 0.1, 0.12, 0.16);
      playTone(1200, 'sine', 0.2, 0.15, 0.24);
    },

    // Error buzz
    error() { playNoise(0.15, 0.08); },

    // Card play — snappy card slap
    cardPlay() {
      playNoise(0.06, 0.12);
      playTone(1800, 'sine', 0.04, 0.08, 0.02);
    },

    // Card draw — soft slide
    cardDraw() {
      playNoise(0.1, 0.06);
      playTone(400, 'sine', 0.08, 0.05, 0.04);
    },

    // UNO call — dramatic alert
    unoCall() {
      playTone(880, 'square', 0.1, 0.15, 0);
      playTone(1100, 'square', 0.1, 0.15, 0.1);
      playTone(1320, 'square', 0.15, 0.18, 0.2);
    },

    // Blackjack bust — descending crash
    bust() {
      playTone(500, 'sawtooth', 0.15, 0.12, 0);
      playTone(350, 'sawtooth', 0.15, 0.1, 0.12);
      playTone(200, 'sawtooth', 0.25, 0.08, 0.24);
      playNoise(0.15, 0.06);
    },

    // Blackjack win — ascending chime
    bjWin() {
      playTone(523, 'sine', 0.12, 0.12, 0);
      playTone(659, 'sine', 0.12, 0.12, 0.1);
      playTone(784, 'sine', 0.12, 0.12, 0.2);
      playTone(1047, 'sine', 0.25, 0.15, 0.3);
    },

    // Card deal — single card flick
    cardDeal() {
      playTone(2200, 'sine', 0.03, 0.06);
      playNoise(0.04, 0.04);
    },

    // Dice roll — rattling noise bursts to simulate dice tumbling
    diceRoll() {
      for (let i = 0; i < 12; i++) {
        playNoise(0.04, 0.06 + Math.random() * 0.04);
        playTone(300 + Math.random() * 400, 'sine', 0.03, 0.04, i * 0.1);
        playTone(500 + Math.random() * 600, 'triangle', 0.02, 0.03, i * 0.1 + 0.03);
      }
    },

    // Dice reveal — satisfying thud when dice lands
    diceReveal() {
      playNoise(0.08, 0.12);
      playTone(400, 'sine', 0.1, 0.1, 0);
      playTone(600, 'sine', 0.08, 0.08, 0.05);
    },

    // Chess — piece move (wooden thud)
    chessMove() {
      playTone(220, 'sine', 0.06, 0.15, 0);
      playNoise(0.04, 0.08);
      playTone(180, 'sine', 0.05, 0.08, 0.03);
    },

    // Chess — capture (sharp impact)
    chessCapture() {
      playNoise(0.06, 0.14);
      playTone(300, 'sawtooth', 0.06, 0.12, 0);
      playTone(200, 'sine', 0.08, 0.1, 0.04);
      playNoise(0.04, 0.06);
    },

    // Chess — check (alert tone)
    chessCheck() {
      playTone(660, 'sine', 0.08, 0.14, 0);
      playTone(880, 'sine', 0.1, 0.16, 0.08);
      playTone(660, 'sine', 0.06, 0.1, 0.18);
    },

    // Chess — castle (double thud)
    chessCastle() {
      playTone(200, 'sine', 0.06, 0.12, 0);
      playNoise(0.04, 0.08);
      playTone(240, 'sine', 0.06, 0.12, 0.12);
      playNoise(0.04, 0.08);
    },

    // Chess — game end (dramatic chord)
    chessGameEnd() {
      playTone(262, 'sine', 0.2, 0.12, 0);
      playTone(330, 'sine', 0.2, 0.12, 0);
      playTone(392, 'sine', 0.2, 0.12, 0);
      playTone(523, 'sine', 0.3, 0.15, 0.2);
    },

    // Toggle mute state
    toggleMute() {
      muted = !muted;
      localStorage.setItem('clutch-muted', muted);
      return muted;
    },

    isMuted() { return muted; }
  };
})();

// ─── Mute Toggle Button ───
(function () {
  const btn = document.getElementById('sound-toggle');
  if (!btn) return;

  function updateIcon() {
    btn.innerHTML = SFX.isMuted()
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  }
  updateIcon();

  btn.addEventListener('click', () => {
    SFX.toggleMute();
    updateIcon();
  });

  // Resume AudioContext on first user interaction
  document.addEventListener('click', function once() {
    if (typeof SFX !== 'undefined') SFX.click();
    document.removeEventListener('click', once);
  }, { once: true });
})();
