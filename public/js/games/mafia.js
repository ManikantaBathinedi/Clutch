// ─── MAFIA CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  let discussTimer = null;

  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function render(data) {
    clearInterval(discussTimer);
    if (!data || !data.phase) return;

    if (data.phase === 'game-over') { renderGameOver(data); return; }
    if (data.phase === 'vote-result') { renderVoteResult(data); return; }
    if (data.phase === 'day-vote') { renderDayVote(data); return; }
    if (data.phase === 'day-discuss') { renderDayDiscuss(data); return; }
    if (data.phase === 'night-detective') { renderNightDetective(data); return; }
    if (data.phase === 'night-doctor') { renderNightDoctor(data); return; }
    if (data.phase === 'night-mafia') { renderNightMafia(data); return; }
  }

  // ─── ROLE CARD ───
  function roleCard(data) {
    return `<div class="maf-role-card maf-team-${data.team}">
      <span class="maf-role-icon">${data.roleIcon}</span>
      <span class="maf-role-label">You are: <strong>${escapeHtml(data.roleLabel)}</strong></span>
    </div>`;
  }

  // ─── PLAYER LIST ───
  function playerList(data, showVoteTarget) {
    return `<div class="maf-players">
      ${data.players.map(p => {
        const dead = !p.alive;
        const cls = dead ? 'maf-dead' : '';
        const roleTag = p.roleIcon ? `<span class="maf-role-tag">${p.roleIcon}</span>` : '';
        return `<div class="maf-player ${cls}">
          <span class="maf-p-avatar">${p.avatar || '😎'}</span>
          <span class="maf-p-name">${escapeHtml(p.name)}</span>
          ${roleTag}
          ${dead ? '<span class="maf-p-dead">💀</span>' : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ─── ELIMINATED LOG ───
  function eliminatedLog(history) {
    if (!history || !history.length) return '';
    return `<div class="maf-elim-log">
      <div class="maf-section-label">Eliminated</div>
      ${history.map(e => `<div class="maf-elim-entry">
        ${e.roleIcon || '💀'} <strong>${escapeHtml(e.name)}</strong> (${escapeHtml(e.role)}) — ${e.phase === 'night' ? '🌙 Night' : '☀️ Day'} ${e.day}
      </div>`).join('')}
    </div>`;
  }

  // ─── ACTION LOG ───
  function actionLogHtml(log) {
    if (!log || !log.length) return '';
    return `<div class="maf-action-log">
      ${log.map(l => `<div class="maf-log-entry maf-log-${l.type || 'info'}">${l.text}</div>`).join('')}
    </div>`;
  }

  // ─── NIGHT: MAFIA PHASE ───
  function renderNightMafia(data) {
    const isMafia = data.role === 'mafia';
    const canAct = data.canAct && data.isAlive;

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-night">
        <div class="maf-header">
          <div class="maf-phase-icon">🌙</div>
          <div class="maf-phase-title">Night ${data.dayNumber} — Mafia Strikes</div>
        </div>
        ${roleCard(data)}
        ${canAct ? `
          <div class="maf-action-area">
            <div class="maf-prompt">Choose a target to eliminate:</div>
            <div class="maf-target-grid">
              ${data.targets.map(t => `
                <button class="maf-target-btn" data-id="${t.id}">
                  <span class="maf-t-avatar">${t.avatar || '😎'}</span>
                  <span class="maf-t-name">${escapeHtml(t.name)}</span>
                </button>
              `).join('')}
            </div>
            <div class="maf-vote-status">Mafia votes: ${data.mafiaVoteCount || 0} / ${data.mafiaTotal || 1}</div>
          </div>
        ` : `
          <div class="maf-waiting">
            ${isMafia ? '⏳ Waiting for other mafia members...' : '🌙 The town sleeps while the Mafia plots...'}
          </div>
        `}
        ${playerList(data)}
        ${eliminatedLog(data.eliminatedHistory)}
        ${actionLogHtml(data.actionLog)}
        <div class="maf-side-btns">
          <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('mafia')">📖 Rules</button>
          ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
        </div>
      </div>
    `;

    if (canAct) {
      document.querySelectorAll('.maf-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('mafia-vote', { targetId: btn.dataset.id });
          document.querySelectorAll('.maf-target-btn').forEach(b => b.disabled = true);
          btn.classList.add('maf-selected');
        });
      });
    }
  }

  // ─── NIGHT: DOCTOR PHASE ───
  function renderNightDoctor(data) {
    const isDoctor = data.role === 'doctor';
    const canAct = data.canAct && data.isAlive;

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-night">
        <div class="maf-header">
          <div class="maf-phase-icon">🌙</div>
          <div class="maf-phase-title">Night ${data.dayNumber} — Doctor's Turn</div>
        </div>
        ${roleCard(data)}
        ${canAct ? `
          <div class="maf-action-area">
            <div class="maf-prompt">Choose someone to protect tonight:</div>
            <div class="maf-target-grid">
              ${data.targets.map(t => `
                <button class="maf-target-btn" data-id="${t.id}">
                  <span class="maf-t-avatar">${t.avatar || '😎'}</span>
                  <span class="maf-t-name">${escapeHtml(t.name)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="maf-waiting">
            ${isDoctor ? '💉 Choose someone to save!' : '🌙 The Doctor is making their choice...'}
          </div>
        `}
        ${playerList(data)}
        ${eliminatedLog(data.eliminatedHistory)}
        ${actionLogHtml(data.actionLog)}
        <div class="maf-side-btns">
          <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('mafia')">📖 Rules</button>
          ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
        </div>
      </div>
    `;

    if (canAct) {
      document.querySelectorAll('.maf-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('mafia-doctor', { targetId: btn.dataset.id });
          document.querySelectorAll('.maf-target-btn').forEach(b => b.disabled = true);
          btn.classList.add('maf-selected');
        });
      });
    }
  }

  // ─── NIGHT: DETECTIVE PHASE ───
  function renderNightDetective(data) {
    const isDetective = data.role === 'detective';
    const canAct = data.canAct && data.isAlive;
    const hasResult = data.detectiveResult;

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-night">
        <div class="maf-header">
          <div class="maf-phase-icon">🌙</div>
          <div class="maf-phase-title">Night ${data.dayNumber} — Detective Investigates</div>
        </div>
        ${roleCard(data)}
        ${hasResult ? `
          <div class="maf-detective-result">
            <div class="maf-prompt">Investigation Result:</div>
            <div class="maf-result-card ${hasResult.isMafia ? 'maf-result-guilty' : 'maf-result-innocent'}">
              <strong>${escapeHtml(hasResult.targetName)}</strong> is
              ${hasResult.isMafia ? '🔪 <strong>MAFIA!</strong>' : '✅ <strong>Not Mafia</strong>'}
            </div>
            <button class="btn btn-sm btn-primary maf-done-btn" id="maf-detective-done">Continue ➜</button>
          </div>
        ` : canAct ? `
          <div class="maf-action-area">
            <div class="maf-prompt">Choose someone to investigate:</div>
            <div class="maf-target-grid">
              ${data.targets.map(t => `
                <button class="maf-target-btn" data-id="${t.id}">
                  <span class="maf-t-avatar">${t.avatar || '😎'}</span>
                  <span class="maf-t-name">${escapeHtml(t.name)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="maf-waiting">🌙 The Detective is investigating...</div>
        `}
        ${playerList(data)}
        ${eliminatedLog(data.eliminatedHistory)}
        ${actionLogHtml(data.actionLog)}
        <div class="maf-side-btns">
          <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('mafia')">📖 Rules</button>
          ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
        </div>
      </div>
    `;

    if (canAct && !hasResult) {
      document.querySelectorAll('.maf-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('mafia-investigate', { targetId: btn.dataset.id });
          document.querySelectorAll('.maf-target-btn').forEach(b => b.disabled = true);
          btn.classList.add('maf-selected');
        });
      });
    }

    document.getElementById('maf-detective-done')?.addEventListener('click', () => {
      socket.emit('mafia-detective-done');
    });
  }

  // ─── DAY: DISCUSSION ───
  function renderDayDiscuss(data) {
    const summary = data.lastNightSummary;
    let summaryHtml = '';
    if (summary) {
      if (summary.killed) {
        summaryHtml = `<div class="maf-night-summary maf-killed">💀 <strong>${escapeHtml(summary.killed.name)}</strong> was killed during the night!</div>`;
      } else if (summary.saved) {
        summaryHtml = `<div class="maf-night-summary maf-saved">💉 Someone was attacked but the Doctor saved them!</div>`;
      } else {
        summaryHtml = `<div class="maf-night-summary">🌅 A peaceful night — no one was harmed.</div>`;
      }
    }

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-day">
        <div class="maf-header">
          <div class="maf-phase-icon">☀️</div>
          <div class="maf-phase-title">Day ${data.dayNumber} — Discussion</div>
        </div>
        ${roleCard(data)}
        ${summaryHtml}
        <div class="maf-discuss-info">
          <div class="maf-timer" id="maf-timer">⏱ ${data.discussTime || 60}s</div>
          <p>Discuss who you think the Mafia is!</p>
          ${isHost ? '<button class="btn btn-sm btn-accent" id="maf-start-vote">🗳️ Start Vote</button>' : '<p class="maf-text-dim">Waiting for host to start vote...</p>'}
        </div>
        ${playerList(data)}
        ${eliminatedLog(data.eliminatedHistory)}
        ${actionLogHtml(data.actionLog)}
        <div class="maf-side-btns">
          <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('mafia')">📖 Rules</button>
          ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
        </div>
      </div>
    `;

    // Discussion timer
    let remaining = data.discussTime || 60;
    const timerEl = document.getElementById('maf-timer');
    discussTimer = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = `⏱ ${remaining}s`;
      if (remaining <= 10 && timerEl) timerEl.classList.add('maf-timer-warn');
      if (remaining <= 0) {
        clearInterval(discussTimer);
        if (isHost) socket.emit('mafia-start-vote');
      }
    }, 1000);

    document.getElementById('maf-start-vote')?.addEventListener('click', () => {
      clearInterval(discussTimer);
      socket.emit('mafia-start-vote');
    });
  }

  // ─── DAY: VOTE ───
  function renderDayVote(data) {
    clearInterval(discussTimer);
    const canVote = data.canAct && data.isAlive;

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-day">
        <div class="maf-header">
          <div class="maf-phase-icon">🗳️</div>
          <div class="maf-phase-title">Day ${data.dayNumber} — Vote to Eliminate</div>
        </div>
        ${roleCard(data)}
        ${canVote ? `
          <div class="maf-action-area">
            <div class="maf-prompt">Vote for who to eliminate:</div>
            <div class="maf-vote-status">Votes: ${data.votesIn || 0} / ${data.totalVoters || 0}</div>
            <div class="maf-target-grid">
              ${data.targets.map(t => `
                <button class="maf-target-btn maf-vote-btn" data-id="${t.id}">
                  <span class="maf-t-avatar">${t.avatar || '😎'}</span>
                  <span class="maf-t-name">${escapeHtml(t.name)}</span>
                </button>
              `).join('')}
            </div>
            <button class="maf-skip-btn" id="maf-skip-vote">⏭ Skip Vote</button>
          </div>
        ` : `
          <div class="maf-waiting">${data.isAlive ? '⏳ Waiting for all votes...' : '💀 You are eliminated. Watching the vote...'}</div>
          <div class="maf-vote-status" style="text-align:center">Votes: ${data.votesIn || 0} / ${data.totalVoters || 0}</div>
        `}
        ${playerList(data)}
        ${eliminatedLog(data.eliminatedHistory)}
        ${actionLogHtml(data.actionLog)}
        <div class="maf-side-btns">
          <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('mafia')">📖 Rules</button>
          ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
        </div>
      </div>
    `;

    if (canVote) {
      let voted = false;
      document.querySelectorAll('.maf-vote-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (voted) return;
          voted = true;
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('mafia-day-vote', { targetId: btn.dataset.id });
          document.querySelectorAll('.maf-vote-btn').forEach(b => b.disabled = true);
          document.getElementById('maf-skip-vote').disabled = true;
          btn.classList.add('maf-selected');
        });
      });

      document.getElementById('maf-skip-vote')?.addEventListener('click', () => {
        if (voted) return;
        voted = true;
        if (typeof SFX !== 'undefined') SFX.click();
        socket.emit('mafia-day-vote', { targetId: '__skip__' });
        document.querySelectorAll('.maf-vote-btn').forEach(b => b.disabled = true);
        const skipBtn = document.getElementById('maf-skip-vote');
        skipBtn.disabled = true;
        skipBtn.textContent = '⏭ Skipped';
      });
    }
  }

  // ─── VOTE RESULT ───
  function renderVoteResult(data) {
    clearInterval(discussTimer);
    const vr = data.voteResult;

    let resultHtml = '';
    if (vr && vr.eliminated) {
      resultHtml = `<div class="maf-result-card maf-result-guilty">
        💀 <strong>${escapeHtml(vr.eliminated.name)}</strong> was eliminated!
        <div class="maf-reveal-role">Role: ${vr.eliminated.roleIcon || ''} ${escapeHtml(vr.eliminated.role)}</div>
      </div>`;
    } else if (vr && vr.noElimination) {
      resultHtml = `<div class="maf-result-card maf-result-innocent">
        ${vr.tie ? '⚖️ Tied vote!' : '⏭ No majority reached.'} No one was eliminated.
      </div>`;
    }

    // Show vote tally
    let tallyHtml = '';
    if (vr && vr.tally) {
      const entries = Object.entries(vr.tally).sort((a, b) => b[1] - a[1]);
      const tallyItems = entries.map(([id, count]) => {
        const p = data.players.find(pl => pl.id === id);
        return `<div class="maf-tally-item"><strong>${escapeHtml(p ? p.name : '?')}</strong>: ${count} vote${count > 1 ? 's' : ''}</div>`;
      }).join('');
      if (vr.skipCount > 0) {
        tallyHtml = `<div class="maf-tally">${tallyItems}<div class="maf-tally-item">Skip: ${vr.skipCount}</div></div>`;
      } else {
        tallyHtml = `<div class="maf-tally">${tallyItems}</div>`;
      }
    }

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-day">
        <div class="maf-header">
          <div class="maf-phase-icon">📊</div>
          <div class="maf-phase-title">Day ${data.dayNumber} — Vote Results</div>
        </div>
        ${roleCard(data)}
        ${resultHtml}
        ${tallyHtml}
        ${isHost ? '<button class="btn btn-sm btn-primary" id="maf-next-night" style="margin-top:16px">🌙 Next Night ➜</button>' : '<p class="maf-text-dim" style="margin-top:16px">Waiting for host...</p>'}
        ${playerList(data)}
        ${eliminatedLog(data.eliminatedHistory)}
        ${actionLogHtml(data.actionLog)}
        <div class="maf-side-btns">
          <button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('mafia')">📖 Rules</button>
          ${isHost ? '<button class="btn btn-sm btn-danger" onclick="socket.emit(\'end-game-early\')">End Game</button>' : ''}
        </div>
      </div>
    `;

    document.getElementById('maf-next-night')?.addEventListener('click', () => {
      socket.emit('mafia-next-night');
    });
  }

  // ─── GAME OVER ───
  function renderGameOver(data) {
    clearInterval(discussTimer);
    const winLabel = data.winner === 'town' ? '🏘️ Town Wins!' : '🔪 Mafia Wins!';

    const playersHtml = data.players.map(p => {
      const winClass = (data.winner === 'town' && p.team === 'town') || (data.winner === 'mafia' && p.role === 'mafia') ? 'maf-winner' : 'maf-loser';
      return `<div class="maf-final-player ${winClass} ${p.alive ? '' : 'maf-dead'}">
        <span class="maf-p-avatar">${p.avatar || '😎'}</span>
        <span class="maf-p-name">${escapeHtml(p.name)}</span>
        <span class="maf-role-tag">${p.roleIcon} ${escapeHtml(p.roleLabel)}</span>
        ${!p.alive ? '<span class="maf-p-dead">💀</span>' : '<span class="maf-p-alive">✓</span>'}
        <span class="maf-p-score">${p.totalScore} pts</span>
      </div>`;
    }).join('');

    gameView.innerHTML = `
      <div class="maf-game fade-in maf-gameover">
        <div class="maf-header">
          <div class="maf-phase-icon">${data.winner === 'town' ? '🏘️' : '🔪'}</div>
          <div class="maf-phase-title">${winLabel}</div>
        </div>
        <div class="maf-final-players">${playersHtml}</div>
        ${eliminatedLog(data.eliminatedHistory)}
      </div>
    `;
  }

  // ─── SOCKET LISTENERS ───
  if (typeof socket !== 'undefined') {
    socket.on('mafia-state', render);
    socket.on('mafia-update', render);
  }

  if (typeof window !== 'undefined') {
    window.initMafiaGame = render;
    window.cleanupMafiaGame = function () {
      clearInterval(discussTimer);
      if (typeof socket !== 'undefined') {
        socket.off('mafia-state', render);
        socket.off('mafia-update', render);
      }
    };
  }
})();
