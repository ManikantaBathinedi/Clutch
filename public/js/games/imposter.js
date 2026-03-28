// ─── IMPOSTER CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let describeTimer = null;

  function render(data) {
    clearInterval(describeTimer);

    if (data.roundOver || data.phase === 'reveal') {
      renderReveal(data);
      return;
    }

    if (data.phase === 'vote-reveal') {
      renderVoteReveal(data);
      return;
    }

    if (data.phase === 'imposter-guess') {
      renderImposterGuess(data);
      return;
    }

    if (data.phase === 'voting') {
      renderVoting(data);
      return;
    }

    // ─── DESCRIBING PHASE ───
    const descHtml = data.descriptions.map(d => `
      <div class="imp-desc-item">
        <span class="imp-desc-avatar">${d.avatar || '😎'}</span>
        <span class="imp-desc-name">${escapeHtml(d.name)}:</span>
        <span class="imp-desc-text">${escapeHtml(d.description)}</span>
      </div>
    `).join('');

    gameView.innerHTML = `
      <div class="imp-game fade-in">
        <div class="imp-header">
          <div class="imp-round">Round ${data.round} / ${data.totalRounds}</div>
          <div class="imp-category">📂 ${escapeHtml(data.category)}</div>
        </div>
        <div style="text-align:center;font-size:0.8rem;color:var(--text-dim);margin-bottom:8px;">
          Vote attempt ${data.votingRound} / ${data.totalVotingRounds}
        </div>

        <div class="game-layout">
          <div class="game-main">
            <div class="imp-role-card ${data.isImposter ? 'imp-spy' : ''}">
              ${data.isImposter
                ? `<div class="imp-role-icon">🤫</div>
                   <div class="imp-role-title">You are the IMPOSTER!</div>
                   <div class="imp-role-clue">Clue: <strong>${escapeHtml(data.clue)}</strong></div>
                   <div class="imp-role-hint">Blend in — describe like you know the word</div>`
                : `<div class="imp-role-icon">📝</div>
                   <div class="imp-role-title">The Word</div>
                   <div class="imp-role-word">${escapeHtml(data.word)}</div>
                   <div class="imp-role-hint">Describe it without giving it away to the imposter</div>`
              }
            </div>

            <div class="imp-turn-info">
              ${data.allDescribed
                ? '<div class="imp-all-done">All players have described! Moving to vote...</div>'
                : data.isMyTurn
                  ? '<div class="imp-your-turn">🎤 Your turn to describe!</div>'
                  : `<div class="imp-waiting-turn">🎤 <strong>${escapeHtml(data.currentDescriberName)}</strong> is describing...</div>`
              }
            </div>

            ${data.isMyTurn && !data.hasDescribed ? `
              <div class="imp-input-area">
                <input type="text" id="imp-desc-input" class="game-input" placeholder="Describe the word..." maxlength="100" autocomplete="off" />
                <button class="btn btn-sm btn-primary" id="imp-submit-desc">Submit</button>
              </div>
              <div class="imp-timer" id="imp-timer"></div>
            ` : ''}

            ${descHtml ? `
              <div class="imp-descriptions">
                <div class="imp-section-label">Descriptions</div>
                ${descHtml}
              </div>
            ` : ''}

            <div class="imp-players">
              <div class="imp-section-label">Players</div>
              <div class="imp-player-grid">
                ${data.players.map((p, i) => {
                  const hasGone = data.descriptions.some(d => d.id === p.id);
                  const isCurrent = p.id === data.currentDescriberId && data.phase === 'describing';
                  return `<div class="imp-player ${isCurrent ? 'imp-active' : ''} ${hasGone ? 'imp-done' : ''}">
                    <span class="imp-player-avatar">${p.avatar || '😎'}</span>
                    <span class="imp-player-name">${escapeHtml(p.name)}</span>
                    ${hasGone ? '<span class="imp-check">✓</span>' : ''}
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>

          <div class="game-side-panel">
            <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('imposter')">📖 Rules</button>
            ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
          </div>
        </div>
      </div>
    `;

    // Input handler
    const input = document.getElementById('imp-desc-input');
    const submitBtn = document.getElementById('imp-submit-desc');
    if (input && submitBtn) {
      submitBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (text) {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('imposter-describe', { description: text });
          submitBtn.disabled = true;
          input.disabled = true;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
      });
      input.focus();
      startDescribeTimer(data.describeTime);
    }
  }

  function startDescribeTimer(seconds) {
    const timerEl = document.getElementById('imp-timer');
    if (!timerEl) return;
    let remaining = seconds;
    timerEl.textContent = `⏱ ${remaining}s`;
    describeTimer = setInterval(() => {
      remaining--;
      timerEl.textContent = `⏱ ${remaining}s`;
      if (remaining <= 10) timerEl.classList.add('imp-timer-warn');
      if (remaining <= 0) {
        clearInterval(describeTimer);
        timerEl.textContent = '⏱ Time up!';
        // Host auto-skips
        if (isHost) socket.emit('imposter-skip');
      }
    }, 1000);
  }

  function renderVoting(data) {
    clearInterval(describeTimer);

    const descHtml = data.descriptions.map(d => `
      <div class="imp-desc-item">
        <span class="imp-desc-avatar">${d.avatar || '😎'}</span>
        <span class="imp-desc-name">${escapeHtml(d.name)}:</span>
        <span class="imp-desc-text">${escapeHtml(d.description)}</span>
      </div>
    `).join('');

    // Previous voting rounds' descriptions
    const prevDescs = (data.allDescriptions || []).filter(d => d.votingRound < data.votingRound);
    const prevDescHtml = prevDescs.map(d => `
      <div class="imp-desc-item">
        <span class="imp-desc-avatar">${d.avatar || '😎'}</span>
        <span class="imp-desc-name">${escapeHtml(d.name)}:</span>
        <span class="imp-desc-text">${escapeHtml(d.description)}</span>
      </div>
    `).join('');

    gameView.innerHTML = `
      <div class="imp-game fade-in">
        <div class="imp-header">
          <div class="imp-round">Round ${data.round} / ${data.totalRounds}</div>
          <div class="imp-phase-label">📢 Vote for the Imposter!</div>
        </div>
        <div style="text-align:center;font-size:0.8rem;color:var(--text-dim);margin-bottom:8px;">
          Vote attempt ${data.votingRound} / ${data.totalVotingRounds}
        </div>

        <div class="imp-descriptions">
          <div class="imp-section-label">Descriptions (this round)</div>
          ${descHtml}
        </div>

        ${prevDescHtml ? `
          <div class="imp-descriptions" style="margin-top:8px;opacity:0.7;">
            <div class="imp-section-label">Previous descriptions</div>
            ${prevDescHtml}
          </div>
        ` : ''}

        <div class="imp-vote-section">
          <div class="imp-section-label">Who is the Imposter?</div>
          <p style="color:var(--text-dim);font-size:0.85rem;margin:4px 0 12px">Votes: ${data.votes} / ${data.totalVoters}</p>
          <div class="imp-vote-grid">
            ${data.players.map(p => `
              <button class="imp-vote-btn" data-id="${p.id}">
                <span class="imp-vote-avatar">${p.avatar || '😎'}</span>
                <span class="imp-vote-name">${escapeHtml(p.name)}</span>
              </button>
            `).join('')}
          </div>
          <button class="imp-skip-vote-btn" id="imp-skip-vote">⏭ Skip Vote</button>
        </div>
      </div>
    `;

    let hasVoted = false;

    document.querySelectorAll('.imp-vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (hasVoted) return;
        hasVoted = true;
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('imposter-vote', { targetId: btn.dataset.id });
        document.querySelectorAll('.imp-vote-btn').forEach(b => b.disabled = true);
        document.getElementById('imp-skip-vote').disabled = true;
        btn.classList.add('imp-voted');
      });
    });

    const skipBtn = document.getElementById('imp-skip-vote');
    skipBtn.addEventListener('click', () => {
      if (hasVoted) return;
      hasVoted = true;
      if (typeof SFX !== 'undefined') SFX.click();
      socket.emit('imposter-vote', { targetId: '__skip__' });
      document.querySelectorAll('.imp-vote-btn').forEach(b => b.disabled = true);
      skipBtn.disabled = true;
      skipBtn.textContent = '⏭ Skipped';
      skipBtn.style.borderColor = 'var(--accent)';
    });
  }

  function renderVoteReveal(data) {
    clearInterval(describeTimer);
    const vr = data.voteResults;

    let msg = '';
    if (vr && vr.skippedRound) {
      msg = `⏭ Vote skipped by majority! ${vr.votingRoundsLeft} attempt${vr.votingRoundsLeft > 1 ? 's' : ''} remaining.`;
    } else if (vr && vr.wrongTarget) {
      msg = `❌ <strong>${escapeHtml(vr.votedOutName)}</strong> was NOT the imposter! ${vr.votingRoundsLeft} attempt${vr.votingRoundsLeft > 1 ? 's' : ''} remaining.`;
    } else if (vr && vr.imposterSurvives) {
      msg = `⚖️ No majority reached! ${vr.votingRoundsLeft} attempt${vr.votingRoundsLeft > 1 ? 's' : ''} remaining.`;
    }

    const allDescHtml = (data.allDescriptions || []).map(d => `
      <div class="imp-desc-item">
        <span class="imp-desc-avatar">${d.avatar || '😎'}</span>
        <span class="imp-desc-name">${escapeHtml(d.name)}:</span>
        <span class="imp-desc-text">${escapeHtml(d.description)}</span>
      </div>
    `).join('');

    gameView.innerHTML = `
      <div class="imp-game fade-in" style="text-align:center">
        <div class="imp-header">
          <div class="imp-round">Round ${data.round} / ${data.totalRounds}</div>
        </div>
        <div class="imp-reveal-card">
          <div style="font-size:1.1rem;margin-bottom:12px">${msg}</div>
          <div style="font-size:0.85rem;color:var(--text-dim);margin-top:8px;">
            Everyone will describe again with new clues...
          </div>
        </div>

        ${allDescHtml ? `
          <div class="imp-descriptions" style="margin-top:16px;text-align:left">
            <div class="imp-section-label">All descriptions so far</div>
            ${allDescHtml}
          </div>
        ` : ''}

        ${isHost ? `<button class="btn btn-sm btn-primary" id="imp-continue" style="margin-top:20px">Continue ➜</button>` : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('imp-continue')?.addEventListener('click', () => {
      socket.emit('imposter-continue');
    });
  }

  function renderImposterGuess(data) {
    clearInterval(describeTimer);

    const descHtml = data.descriptions.map(d => `
      <div class="imp-desc-item">
        <span class="imp-desc-avatar">${d.avatar || '😎'}</span>
        <span class="imp-desc-name">${escapeHtml(d.name)}:</span>
        <span class="imp-desc-text">${escapeHtml(d.description)}</span>
      </div>
    `).join('');

    const vr = data.voteResults;

    gameView.innerHTML = `
      <div class="imp-game fade-in" style="text-align:center">
        <div class="imp-header">
          <div class="imp-round">Round ${data.round} / ${data.totalRounds}</div>
        </div>

        <div class="imp-reveal-card">
          <div style="font-size:1.2rem;margin-bottom:12px">
            🎯 The imposter <strong>${escapeHtml(vr && vr.imposterName ? vr.imposterName : '?')}</strong> was caught!
          </div>
          <div style="font-size:0.95rem;color:var(--text-dim)">
            But they get one chance to guess the word...
          </div>
        </div>

        ${data.isImposter ? `
          <div class="imp-guess-area">
            <p style="font-size:1rem;margin:16px 0 8px">Your clue was: <strong>${escapeHtml(data.clue)}</strong></p>
            <input type="text" id="imp-guess-input" class="game-input" placeholder="Guess the word..." maxlength="50" autocomplete="off" />
            <button class="btn btn-sm btn-accent" id="imp-guess-submit">🎯 Guess</button>
          </div>
        ` : `
          <p style="color:var(--text-dim);margin-top:16px">Waiting for the imposter to guess the word...</p>
        `}

        <div class="imp-descriptions" style="margin-top:20px">
          <div class="imp-section-label">Descriptions</div>
          ${descHtml}
        </div>
      </div>
    `;

    const guessInput = document.getElementById('imp-guess-input');
    const guessSubmit = document.getElementById('imp-guess-submit');
    if (guessInput && guessSubmit) {
      guessSubmit.addEventListener('click', () => {
        const guess = guessInput.value.trim();
        if (guess) {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('imposter-guess-word', { guess });
          guessSubmit.disabled = true;
          guessInput.disabled = true;
        }
      });
      guessInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guessSubmit.click();
      });
      guessInput.focus();
    }
  }

  function renderReveal(data) {
    clearInterval(describeTimer);
    const vr = data.voteResults;
    const ig = data.imposterGuess;

    let revealMsg = '';
    if (ig) {
      revealMsg = ig.correct
        ? `🤫 The imposter <strong>${escapeHtml(ig.imposterName)}</strong> correctly guessed the word "<strong>${escapeHtml(ig.word)}</strong>"! +${500} pts!`
        : `✅ The imposter <strong>${escapeHtml(ig.imposterName)}</strong> guessed "${escapeHtml(ig.guess)}" — WRONG! Villagers win!`;
    } else if (vr) {
      if (vr.skippedRound) {
        revealMsg = `⏭ Vote skipped! Majority chose to skip. The imposter <strong>${escapeHtml(vr.imposterName)}</strong> survives this round!`;
      } else if (vr.imposterSurvives) {
        revealMsg = `⚖️ No majority! The imposter <strong>${escapeHtml(vr.imposterName)}</strong> survives this round!`;
      } else if (vr.wrongTarget) {
        revealMsg = `❌ <strong>${escapeHtml(vr.votedOutName)}</strong> was NOT the imposter! The imposter was <strong>${escapeHtml(vr.imposterName)}</strong>!`;
      } else {
        revealMsg = `✅ The imposter was caught!`;
      }
    }

    const descHtml = data.descriptions.map(d => `
      <div class="imp-desc-item">
        <span class="imp-desc-avatar">${d.avatar || '😎'}</span>
        <span class="imp-desc-name">${escapeHtml(d.name)}:</span>
        <span class="imp-desc-text">${escapeHtml(d.description)}</span>
      </div>
    `).join('');

    gameView.innerHTML = `
      <div class="imp-game fade-in" style="text-align:center">
        <h2 style="margin-bottom:16px">Round ${data.round} Results</h2>
        <div class="imp-reveal-card">
          <div style="font-size:1.1rem;margin-bottom:12px">${revealMsg}</div>
          <div style="margin:12px 0;font-size:0.9rem;color:var(--text-mid)">
            📝 The word was: <strong>${escapeHtml(data.word || (vr && vr.word) || '')}</strong>
          </div>
          <div style="font-size:0.85rem;color:var(--text-dim)">
            📂 Category: ${escapeHtml(data.category || '')}
          </div>
        </div>

        <div class="imp-descriptions" style="margin-top:16px">
          <div class="imp-section-label">Descriptions</div>
          ${descHtml}
        </div>

        ${isHost ? `<button class="btn btn-sm btn-primary" id="imp-next-round" style="margin-top:20px">${data.round >= data.totalRounds ? '🏆 Final Results' : 'Next Round ➜'}</button>` : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;

    document.getElementById('imp-next-round')?.addEventListener('click', () => {
      socket.emit('imposter-next');
    });
  }

  function renderGameOver(data) {
    clearInterval(describeTimer);
    if (typeof SFX !== 'undefined') SFX.gameOver();
    gameView.innerHTML = `
      <div class="results-container fade-in">
        <h2 class="results-title">🤫 Imposter — Final Results</h2>
        <div class="results-list">
          ${data.players.map((p, i) => `
            <div class="result-row ${i === 0 ? 'winner' : ''}">
              <span class="result-rank">${p.rank}</span>
              <span class="result-name">${escapeHtml(p.name)}</span>
              <span class="result-score">${p.score.toLocaleString()} pts</span>
            </div>
          `).join('')}
        </div>
        ${isHost ? `
          <div class="result-actions" style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
            <button class="btn btn-sm btn-primary" id="back-to-lobby-btn">🏠 Back to Lobby</button>
          </div>
        ` : '<p style="color: var(--text-dim); margin-top: 16px;">Waiting for host...</p>'}
      </div>
    `;
    document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  }

  // Socket listeners
  socket.on('imposter-state', render);
  socket.on('imposter-voting', renderVoting);
  socket.on('imposter-guess-phase', renderImposterGuess);
  socket.on('imposter-reveal', renderReveal);
  socket.on('game-over', renderGameOver);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
