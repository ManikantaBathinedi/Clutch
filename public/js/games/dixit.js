// ─── DIXIT CLIENT ───
(function () {
  let state = null;
  let selectedHandCard = null;
  let selectedVoteCard = null;
  let lastPhase = null;
  let clueText = '';

  function render() {
    const gv = document.getElementById('game-view');
    if (!gv || !state) return;

    const { phase, round, clue, isStoryteller, storytellerName, myHand, playedCards,
            hasPlayed, hasVoted, players, targetScore, lastRoundScoring, winner,
            myPlayedCardIndex, myVotedIndex } = state;

    // Reset selections on phase change
    const phaseChanged = phase !== lastPhase;
    if (phaseChanged) {
      selectedHandCard = null;
      selectedVoteCard = null;
      lastPhase = phase;
    }

    const isHost = sessionStorage.getItem('isHost') === 'true';

    let html = `<div class="dixit-container fade-in">`;

    // ── Scoreboard Header ──
    html += `<div class="dixit-scoreboard">`;
    html += `<div class="dixit-round-info">Round ${round} &bull; Target: ${targetScore} pts</div>`;
    html += `<div class="dixit-players-bar">`;
    for (const p of players) {
      html += `<div class="dixit-player-chip ${p.isStoryteller ? 'storyteller' : ''} ${p.id === socket.id ? 'me' : ''}">
        <span class="dixit-avatar">${p.avatar}</span>
        <span class="dixit-pname">${p.name}${p.isStoryteller ? ' 📖' : ''}</span>
        <span class="dixit-pscore">${p.score}</span>
        ${phase === 'playing' && p.hasPlayed ? '<span class="dixit-check">✓</span>' : ''}
        ${phase === 'voting' && p.hasVoted ? '<span class="dixit-check">✓</span>' : ''}
      </div>`;
    }
    html += `</div></div>`;

    // ── Phase Banner ──
    html += `<div class="dixit-phase-banner">`;
    if (phase === 'storytelling') {
      if (isStoryteller) {
        html += `<h2>🎨 You are the Storyteller!</h2>
          <p>Select a card from your hand, enter a clue, then submit.</p>`;
      } else {
        html += `<h2>📖 ${escHtml(storytellerName)} is the Storyteller</h2>
          <p>Waiting for them to choose a card and give a clue...</p>`;
      }
    } else if (phase === 'playing') {
      html += `<div class="dixit-clue-display">Clue: <strong>"${escHtml(clue)}"</strong></div>`;
      if (isStoryteller) {
        html += `<p>Waiting for other players to play their cards...</p>`;
      } else if (hasPlayed) {
        html += `<p>✅ Card played! Waiting for others...</p>`;
      } else {
        html += `<p>Select a card from your hand that matches the clue, then confirm.</p>`;
      }
    } else if (phase === 'voting') {
      html += `<div class="dixit-clue-display">Clue: <strong>"${escHtml(clue)}"</strong></div>`;
      if (isStoryteller) {
        html += `<p>Players are voting on which card is yours...</p>`;
      } else if (hasVoted) {
        html += `<p>✅ Vote cast! Waiting for others...</p>`;
      } else {
        html += `<p>Select the card you think is the storyteller's, then confirm your vote.</p>`;
      }
    } else if (phase === 'scoring') {
      html += `<div class="dixit-clue-display">Clue: <strong>"${escHtml(clue)}"</strong></div>`;
      if (typeof SFX !== 'undefined' && phaseChanged) SFX.roundResults();
      if (winner) {
        const winnerP = players.find(p => p.id === winner);
        html += `<h2>🏆 ${winnerP ? escHtml(winnerP.name) : 'Someone'} wins!</h2>`;
      } else {
        html += `<h2>Round Results</h2>`;
      }
    } else if (phase === 'finished') {
      const winnerP = players.find(p => p.id === winner);
      html += `<h2>🏆 ${winnerP ? escHtml(winnerP.name) : 'Someone'} wins the game!</h2>`;
    }
    html += `</div>`;

    // ── Clue Input (Storyteller in storytelling phase) ──
    if (phase === 'storytelling' && isStoryteller) {
      html += `<div class="dixit-clue-input">
        <input type="text" id="dixit-clue-text" class="game-input" placeholder="Enter your clue..." maxlength="100" value="${escHtml(clueText)}" oninput="window.dixitClueInput(this.value)" />
        ${selectedHandCard !== null ? '<button class="dixit-btn dixit-confirm-action" onclick="window.dixitConfirmCard()">✨ Submit Clue & Card</button>' : '<span class="dixit-hint">← Select a card below first</span>'}
      </div>`;
    }

    // ── Played Cards (Voting / Scoring) ──
    if ((phase === 'voting' || phase === 'scoring') && playedCards.length > 0) {
      html += `<div class="dixit-played-area">`;
      html += `<h3>Played Cards</h3>`;
      html += `<div class="dixit-played-grid">`;
      for (let i = 0; i < playedCards.length; i++) {
        const pc = playedCards[i];
        const isMyCard = phase === 'voting' && !isStoryteller && myPlayedCardIndex === i;
        const canVote = phase === 'voting' && !isStoryteller && !hasVoted && !isMyCard;
        const isSelected = selectedVoteCard === i;
        const isVoted = hasVoted && myVotedIndex === i;
        const isStory = pc.isStorytellers;

        let cardClasses = 'dixit-played-card dixit-card-reveal';
        if (canVote) cardClasses += ' votable';
        if (isMyCard) cardClasses += ' own-card';
        if (isSelected) cardClasses += ' selected';
        if (isVoted) cardClasses += ' voted';
        if (isStory) cardClasses += ' storyteller-card';

        html += `<div class="${cardClasses}" style="animation-delay:${i * 0.12}s"
                      ${canVote ? `onclick="window.dixitVote(${i})"` : ''}>
          <div class="dixit-card-art">${pc.card}</div>
          ${phase === 'scoring' ? `
            <div class="dixit-card-owner">${escHtml(pc.playerName || '')}${isStory ? ' 📖' : ''}</div>
            <div class="dixit-card-votes">${pc.votes && pc.votes.length > 0 ? pc.votes.map(n => escHtml(n)).join(', ') : 'No votes'}</div>
          ` : ''}
          ${isMyCard ? '<div class="dixit-own-label">Your card</div>' : ''}
          ${canVote && !isSelected ? '<div class="dixit-vote-label">Click to select</div>' : ''}
          ${isSelected ? '<div class="dixit-vote-label dixit-selected-text">✓ Selected</div>' : ''}
          ${isVoted ? '<div class="dixit-vote-label dixit-voted-text">✓ Your vote</div>' : ''}
        </div>`;
      }
      html += `</div>`;
      // Confirm vote button
      if (phase === 'voting' && !isStoryteller && !hasVoted && selectedVoteCard !== null) {
        html += `<div style="text-align:center;margin-top:12px">
          <button class="dixit-btn dixit-confirm-action" onclick="window.dixitConfirmVote()">✅ Confirm Vote</button>
        </div>`;
      }
      html += `</div>`;
    }

    // ── Scoring Breakdown ──
    if (phase === 'scoring' && lastRoundScoring) {
      html += `<div class="dixit-scoring-breakdown">`;
      if (lastRoundScoring.allOrNone) {
        html += `<div class="dixit-scoring-note">${lastRoundScoring.votesForStoryteller === 0 ? 'Nobody' : 'Everyone'} found the storyteller's card — storyteller gets 0, everyone else gets 2!</div>`;
      } else {
        html += `<div class="dixit-scoring-note">${lastRoundScoring.votesForStoryteller} player(s) found the storyteller's card — storyteller & correct voters get 3 points!</div>`;
      }
      html += `<div class="dixit-scoring-list">`;
      for (const p of players) {
        const pts = lastRoundScoring.playerScores[p.id] || 0;
        html += `<span class="dixit-scoring-item ${pts > 0 ? 'gained dixit-score-pop' : ''}">${escHtml(p.name)} +${pts}</span>`;
      }
      html += `</div>`;
      if (!winner && isHost) {
        html += `<button class="dixit-btn dixit-next-btn" onclick="window.dixitNextRound()">Next Round →</button>`;
      } else if (!winner && !isHost) {
        html += `<div class="dixit-hint">Waiting for host to start next round...</div>`;
      }
      html += `</div>`;
    }

    // ── My Hand ──
    if (myHand.length > 0 && phase !== 'finished') {
      const canPlay = (phase === 'storytelling' && isStoryteller) || (phase === 'playing' && !isStoryteller && !hasPlayed);
      html += `<div class="dixit-hand-area">`;
      html += `<h3>Your Hand</h3>`;
      html += `<div class="dixit-hand">`;
      for (let i = 0; i < myHand.length; i++) {
        const isSelected = selectedHandCard === i;
        html += `<div class="dixit-hand-card ${canPlay ? 'playable' : ''} ${isSelected ? 'selected' : ''} dixit-card-enter" style="animation-delay:${i * 0.08}s"
                      ${canPlay ? `onclick="window.dixitSelectCard(${i})"` : ''}>
          <div class="dixit-card-art">${myHand[i]}</div>
          ${isSelected ? '<div class="dixit-selected-label">✓ Selected</div>' : ''}
        </div>`;
      }
      html += `</div>`;
      // Confirm play button (for playing phase)
      if (phase === 'playing' && !isStoryteller && !hasPlayed && selectedHandCard !== null) {
        html += `<div style="text-align:center;margin-top:10px">
          <button class="dixit-btn dixit-confirm-action" onclick="window.dixitConfirmCard()">🃏 Play This Card</button>
        </div>`;
      }
      html += `</div>`;
    }

    // ── Footer: Rules + End Game ──
    html += `<div class="dixit-footer" style="text-align:center;margin-top:12px">`;
    if (isHost) {
      html += `<button class="btn btn-sm btn-danger" onclick="socket.emit('end-game-early')">End Game</button> `;
    }
    html += `<button class="btn btn-sm" onclick="window.showGameRules && window.showGameRules('dixit')">📖 Rules</button>`;
    html += `</div>`;

    html += `</div>`;
    gv.innerHTML = html;
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  window.dixitClueInput = function (val) {
    clueText = val;
  };

  window.dixitSelectCard = function (index) {
    if (!state) return;
    if (typeof SFX !== 'undefined') SFX.cardPlay();
    if (state.phase === 'storytelling' && state.isStoryteller) {
      // Save clue text before re-render
      const input = document.getElementById('dixit-clue-text');
      if (input) clueText = input.value;
      selectedHandCard = selectedHandCard === index ? null : index;
      render();
    } else if (state.phase === 'playing' && !state.isStoryteller && !state.hasPlayed) {
      selectedHandCard = selectedHandCard === index ? null : index;
      render();
    }
  };

  window.dixitConfirmCard = function () {
    if (!state || selectedHandCard === null) return;
    if (state.phase === 'storytelling' && state.isStoryteller) {
      const input = document.getElementById('dixit-clue-text');
      const clue = input ? input.value.trim() : clueText.trim();
      if (!clue) {
        alert('Please enter a clue first!');
        if (input) input.focus();
        return;
      }
      socket.emit('dixit-submit-clue', { clue, cardIndex: selectedHandCard });
      selectedHandCard = null;
      clueText = '';
    } else if (state.phase === 'playing' && !state.isStoryteller && !state.hasPlayed) {
      socket.emit('dixit-play-card', { cardIndex: selectedHandCard });
      selectedHandCard = null;
    }
  };

  window.dixitVote = function (index) {
    if (!state || state.phase !== 'voting' || state.hasVoted || state.isStoryteller) return;
    if (state.myPlayedCardIndex === index) return;
    selectedVoteCard = selectedVoteCard === index ? null : index;
    render();
  };

  window.dixitConfirmVote = function () {
    if (!state || state.phase !== 'voting' || state.hasVoted || state.isStoryteller) return;
    if (selectedVoteCard === null) return;
    if (typeof SFX !== 'undefined') SFX.click();
    socket.emit('dixit-vote', { cardIndex: selectedVoteCard });
    selectedVoteCard = null;
  };

  window.dixitNextRound = function () {
    socket.emit('dixit-next-round');
  };

  socket.on('dixit-state', function (data) {
    state = data;
    lastPhase = null;
    render();
  });

  socket.on('dixit-update', function (data) {
    state = data;
    render();
  });

  socket.on('game-over', function (data) {
    state = null;
    if (typeof SFX !== 'undefined') SFX.gameOver();
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const gv = document.getElementById('game-view');
    if (!gv) return;
    const winner = data && data.players && data.players[0] ? data.players[0] : null;
    gv.innerHTML = `
      <div class="results-container fade-in">
        <div class="result-header">
          <div style="font-size: 1rem; color: var(--accent); font-family: var(--font-display, inherit); font-weight: 800; letter-spacing: 4px; margin-bottom: 8px;">GAME OVER</div>
          <h2 style="font-size: 1.4rem; font-weight: 700;">${winner ? escHtml(winner.name) + ' wins!' : 'Game Over!'}</h2>
        </div>
        <ul class="leaderboard" id="dixit-final-lb"></ul>
        ${isHost ? '<button class="btn btn-sm btn-secondary mt-20" id="dixit-lobby-btn">Back to Lobby</button>' : '<p style="color:var(--text-dim);margin-top:16px">Waiting for host...</p>'}
      </div>
    `;
    if (data && data.players) {
      const lb = document.getElementById('dixit-final-lb');
      data.players.forEach((p, i) => {
        const li = document.createElement('li');
        li.className = 'leaderboard-item';
        li.style.animationDelay = i * 0.1 + 's';
        const rankClass = i < 3 ? 'rank-' + (i + 1) : '';
        li.innerHTML = '<span class="rank ' + rankClass + '">' + p.rank + '</span><span class="lb-name">' + escHtml(p.name) + '</span><span class="lb-score">' + p.score.toLocaleString() + '</span>';
        lb.appendChild(li);
      });
    }
    document.getElementById('dixit-lobby-btn')?.addEventListener('click', () => {
      socket.emit('back-to-lobby');
    });
  });
})();
