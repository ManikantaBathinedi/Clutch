// ─── LUDO CLIENT ───
(function () {
  const gameView = document.getElementById('game-view');
  const isHost = sessionStorage.getItem('isHost') === 'true';

  const BOARD_SIZE = 52;
  const HOME_STRETCH = 6;
  const START_POS = { red: 0, blue: 13, green: 26, yellow: 39 };

  const COLORS = {
    red:    { main: '#E53935', light: '#EF5350', dark: '#B71C1C', bg: '#FFCDD2', glow: 'rgba(229,57,53,0.5)' },
    blue:   { main: '#1E88E5', light: '#42A5F5', dark: '#0D47A1', bg: '#BBDEFB', glow: 'rgba(30,136,229,0.5)' },
    green:  { main: '#43A047', light: '#66BB6A', dark: '#1B5E20', bg: '#C8E6C9', glow: 'rgba(67,160,71,0.5)' },
    yellow: { main: '#FDD835', light: '#FFEE58', dark: '#F57F17', bg: '#FFF9C4', glow: 'rgba(253,216,53,0.5)' }
  };

  const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

  const TRACK = [
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0]
  ];

  const HOME_STRETCH_COORDS = {
    red:   [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    blue:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    green: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
    yellow:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
  };

  const BASE_SLOTS = {
    red:    [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]],
    blue:   [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]],
    green:  [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]],
    yellow: [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]]
  };

  const DICE_DOTS = {
    1: [[1,1]],
    2: [[0,2],[2,0]],
    3: [[0,2],[1,1],[2,0]],
    4: [[0,0],[0,2],[2,0],[2,2]],
    5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
    6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]]
  };

  let currentData = null;
  let diceAnimating = false;
  let pendingUpdate = null;
  let moveAnimating = false;
  let boardRotation = 0;

  function render(data) {
    // If dice or move animation is playing, buffer this update (DON'T overwrite currentData)
    if (diceAnimating || moveAnimating) { pendingUpdate = data; return; }
    var prevData = currentData;
    currentData = data;
    if (data.phase === 'finished') { renderGameOver(data); return; }
    renderBoard(data, prevData);
  }

  function renderDiceSVG(value, size) {
    size = size || 64;
    const dotR = size * 0.09;
    const pad = size * 0.24;
    const mid = size / 2;
    const positions = [[pad,pad],[pad,mid],[pad,size-pad],[mid,pad],[mid,mid],[mid,size-pad],[size-pad,pad],[size-pad,mid],[size-pad,size-pad]];
    const dots = DICE_DOTS[value] || [];
    const dotsSvg = dots.map(([r, c]) => {
      const idx = r * 3 + c;
      const [cy, cx] = positions[idx];
      return '<circle cx="'+cx+'" cy="'+cy+'" r="'+dotR+'" fill="#1a1a2e"/>';
    }).join('');
    return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" class="ludo-dice-svg">'
      + '<defs><linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#e8e8e8"/></linearGradient></defs>'
      + '<rect x="2" y="2" width="'+(size-4)+'" height="'+(size-4)+'" rx="'+(size*0.15)+'" fill="url(#dg)" stroke="#bbb" stroke-width="1.5"/>'
      + dotsSvg + '</svg>';
  }

  /* ── SVG Board Drawing ── */
  var SVG_SIZE = 600;
  var C = SVG_SIZE / 15; // 40

  function svgRect(x,y,w,h,fill,rx,extra) {
    return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'"'+(rx?' rx="'+rx+'"':'')+(extra||'')+'/>';
  }
  function svgCircle(cx,cy,r,fill,stroke,sw) {
    return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"'+(stroke?' stroke="'+stroke+'" stroke-width="'+(sw||1)+'"':'')+'/>';
  }
  function svgText(x,y,txt,fill,sz) {
    return '<text x="'+x+'" y="'+y+'" text-anchor="middle" dominant-baseline="central" font-size="'+(sz||12)+'" fill="'+fill+'" font-weight="bold">'+txt+'</text>';
  }

  function buildBoardSVG() {
    var s = '';
    // Board background (green felt)
    s += svgRect(0,0,SVG_SIZE,SVG_SIZE,'#1a6b30',12);

    // Cross arms (cream path)
    s += svgRect(6*C, 0, 3*C, SVG_SIZE, '#F5F0E1'); // vertical
    s += svgRect(0, 6*C, SVG_SIZE, 3*C, '#F5F0E1'); // horizontal

    // Grid lines on cross cells
    for (var r = 0; r < 15; r++) {
      for (var c = 0; c < 15; c++) {
        var inV = (c >= 6 && c <= 8);
        var inH = (r >= 6 && r <= 8);
        var inBase = (r < 6 && c < 6)||(r < 6 && c > 8)||(r > 8 && c < 6)||(r > 8 && c > 8);
        if ((inV || inH) && !inBase) {
          s += svgRect(c*C, r*C, C, C, 'none', 0, ' stroke="rgba(0,0,0,0.08)" stroke-width="0.5"');
        }
      }
    }

    // Home stretch colored cells
    var hsColors = { red: COLORS.red.main, blue: COLORS.blue.main, green: COLORS.green.main, yellow: COLORS.yellow.main };
    for (var color in HOME_STRETCH_COORDS) {
      var coords = HOME_STRETCH_COORDS[color];
      for (var i = 0; i < coords.length; i++) {
        var hr = coords[i][0], hc = coords[i][1];
        s += svgRect(hc*C+1, hr*C+1, C-2, C-2, hsColors[color], 3, ' opacity="0.45"');
      }
    }

    // Start position highlights
    var starts = { 0:'red', 13:'blue', 26:'green', 39:'yellow' };
    for (var pos in starts) {
      var sc = starts[pos];
      var coord = TRACK[parseInt(pos)];
      s += svgRect(coord[1]*C+1, coord[0]*C+1, C-2, C-2, COLORS[sc].main, 3, ' opacity="0.35"');
      s += svgText((coord[1]+0.5)*C, (coord[0]+0.5)*C, '★', COLORS[sc].dark, 15);
    }

    // Safe squares (non-start)
    for (var si = 0; si < SAFE_SQUARES.length; si++) {
      if (starts[SAFE_SQUARES[si]]) continue;
      var sc2 = TRACK[SAFE_SQUARES[si]];
      s += svgText((sc2[1]+0.5)*C, (sc2[0]+0.5)*C, '✦', '#b8860b', 11);
    }

    // 4 Base areas
    var basePos = { red:{r:0,c:0}, blue:{r:0,c:9}, green:{r:9,c:9}, yellow:{r:9,c:0} };
    for (var bc in basePos) {
      var bp = basePos[bc];
      var col = COLORS[bc];
      var bx = bp.c * C, by = bp.r * C, bs = 6 * C;
      var inset = C * 0.65;
      // Outer colored area
      s += svgRect(bx, by, bs, bs, col.main, 10);
      s += svgRect(bx, by, bs, bs, 'none', 10, ' stroke="'+col.dark+'" stroke-width="2"');
      // Inner white area
      s += svgRect(bx+inset, by+inset, bs-2*inset, bs-2*inset, 'white', 8, ' stroke="'+col.dark+'" stroke-width="1.5"');
      // 4 token circles
      var slots = BASE_SLOTS[bc];
      for (var si2 = 0; si2 < slots.length; si2++) {
        var scx = (slots[si2][1]+0.5)*C, scy = (slots[si2][0]+0.5)*C;
        s += svgCircle(scx, scy, C*0.32, col.bg, col.main, 2);
      }
    }

    // Center home triangles (3x3 area)
    var cx = 7.5*C, cy = 7.5*C, half = 1.5*C;
    // Red - left (enters from left arm)
    s += '<polygon points="'+cx+','+cy+' '+(cx-half)+','+(cy-half)+' '+(cx-half)+','+(cy+half)+'" fill="'+COLORS.red.main+'" opacity="0.85"/>';
    // Blue - top (enters from top arm)
    s += '<polygon points="'+cx+','+cy+' '+(cx-half)+','+(cy-half)+' '+(cx+half)+','+(cy-half)+'" fill="'+COLORS.blue.main+'" opacity="0.85"/>';
    // Green - right (enters from right arm)
    s += '<polygon points="'+cx+','+cy+' '+(cx+half)+','+(cy-half)+' '+(cx+half)+','+(cy+half)+'" fill="'+COLORS.green.main+'" opacity="0.85"/>';
    // Yellow - bottom (enters from bottom arm)
    s += '<polygon points="'+cx+','+cy+' '+(cx-half)+','+(cy+half)+' '+(cx+half)+','+(cy+half)+'" fill="'+COLORS.yellow.main+'" opacity="0.85"/>';
    // Center border
    s += svgRect(6*C, 6*C, 3*C, 3*C, 'none', 0, ' stroke="rgba(0,0,0,0.2)" stroke-width="1"');

    return '<svg viewBox="0 0 '+SVG_SIZE+' '+SVG_SIZE+'" class="ludo-board-svg" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }

  // Cache the board SVG since it never changes
  var boardSVGCache = null;

  function renderBoard(data, prevData) {
    var isMyTurn = data.isMyTurn;

    var playersHtml = data.players.map(function(p) {
      var active = p.id === data.currentPlayerId;
      var col = COLORS[p.color];
      return '<div class="ludo-pi '+(active?'ludo-pi-active':'')+'" style="--pc:'+col.main+';--pc-glow:'+col.glow+'">'
        + '<span class="ludo-pi-dot" style="background:'+col.main+'"></span>'
        + '<span class="ludo-pi-name">'+escapeHtml(p.name)+'</span>'
        + '<span class="ludo-pi-score">'+p.finished+'/4 🏠</span>'
        + '</div>';
    }).join('');

    var turnHtml = '';
    if (isMyTurn) {
      if (data.phase === 'moving') turnHtml = '<div class="ludo-turn ludo-turn-you">🎯 Tap a highlighted token to move!</div>';
      else if (!data.diceRolled) turnHtml = '<div class="ludo-turn ludo-turn-you">🎲 Your turn — roll the dice!</div>';
    } else {
      turnHtml = '<div class="ludo-turn ludo-turn-wait">⏳ '+escapeHtml(data.currentPlayerName || '?')+'\'s turn</div>';
    }

    var diceHtml = '';
    if (isMyTurn && !data.diceRolled && data.phase === 'rolling') {
      diceHtml = '<button class="ludo-roll-btn" id="ludo-roll"><span class="ludo-roll-icon">🎲</span> Roll Dice</button>';
    } else if (data.diceValue) {
      diceHtml = '<div class="ludo-dice-result '+(data.diceValue===6?'ludo-dice-six':'')+'" id="ludo-dice-display">'
        + renderDiceSVG(data.diceValue,56)
        + '<span class="ludo-dice-number">'+data.diceValue+'</span>'
        + '</div>';
    }

    var actionHtml = data.lastAction ? '<div class="ludo-action">'+getActionMsg(data)+'</div>' : '';

    gameView.innerHTML = '<div class="ludo-game fade-in">'
      + '<div class="ludo-header">'
      + '<div class="ludo-top-bar">'+playersHtml+'</div>'
      + turnHtml
      + actionHtml
      + '</div>'
      + '<div class="ludo-board-row">'
      + '<div class="ludo-board-wrap">'
      + '<div class="ludo-board" id="ludo-board" style="'+(boardRotation ? 'transform:rotate('+boardRotation+'deg)' : '')+'"></div>'
      + '</div>'
      + '<div class="ludo-control-card" id="ludo-side-dice">'
      + '<div class="ludo-control-section">' + diceHtml + '</div>'
      + '<div class="ludo-control-divider"></div>'
      + '<button class="ludo-rotate-btn" id="ludo-rotate-btn" title="Rotate board 90°">🔄 Rotate</button>'
      + '</div>'
      + '</div>'
      + '</div>';

    drawSVGBoard(data, prevData);
    attachEvents(data);

    // Rotate button handler
    var rotBtn = document.getElementById('ludo-rotate-btn');
    if (rotBtn) {
      rotBtn.addEventListener('click', function() {
        boardRotation = (boardRotation + 90) % 360;
        var boardEl = document.getElementById('ludo-board');
        if (boardEl) {
          boardEl.style.transform = boardRotation ? 'rotate('+boardRotation+'deg)' : '';
          // Counter-rotate token numbers so text stays readable
          boardEl.querySelectorAll('.ludo-token-num').forEach(function(el) {
            el.style.transform = boardRotation ? 'rotate('+(-boardRotation)+'deg)' : '';
          });
        }
      });
    }
  }

  function drawSVGBoard(data, prevData) {
    var board = document.getElementById('ludo-board');
    if (!board) return;

    if (!boardSVGCache) boardSVGCache = buildBoardSVG();

    // Check for step-by-step move animation
    if (prevData && prevData.players && data.lastAction && !moveAnimating) {
      var la = data.lastAction;
      if (la.type === 'move' || la.type === 'leave-base' || la.type === 'enter-home-stretch' || la.type === 'home' || la.type === 'move-home-stretch') {
        var movedPlayerNew = null;
        var movedPlayerOld = null;
        for (var i = 0; i < data.players.length; i++) {
          if (data.players[i].id === la.player) {
            movedPlayerNew = data.players[i];
            break;
          }
        }
        if (movedPlayerNew) {
          for (var j = 0; j < prevData.players.length; j++) {
            if (prevData.players[j].color === movedPlayerNew.color) {
              movedPlayerOld = prevData.players[j];
              break;
            }
          }
        }
        if (movedPlayerNew && movedPlayerOld && la.token !== undefined) {
          var oldToken = movedPlayerOld.tokens[la.token];
          var newToken = movedPlayerNew.tokens[la.token];
          if (oldToken && newToken && (oldToken.pos !== newToken.pos || oldToken.state !== newToken.state)) {
            startMoveAnimation(board, data, movedPlayerNew.color, la.token, oldToken, newToken);
            return;
          }
        }
      }
    }

    // Normal render (no animation)
    renderTokensOnBoard(board, data, null);
  }

  /* ── Step-by-step move animation ── */
  function computeMovePath(color, tokenIndex, oldToken, newToken) {
    var startPos = START_POS[color];
    var path = [];

    if (oldToken.state === 'base') {
      // Base to start: simple 2-step
      var baseSlot = BASE_SLOTS[color][tokenIndex];
      path.push({ r: baseSlot[0], c: baseSlot[1] });
      var tc = TRACK[startPos];
      if (tc) path.push({ r: tc[0], c: tc[1] });
      return path;
    }

    // Compute relative positions
    var oldRel, newRel;
    if (oldToken.state === 'active') {
      oldRel = (oldToken.pos - startPos + BOARD_SIZE) % BOARD_SIZE;
    } else if (oldToken.state === 'home-stretch') {
      oldRel = oldToken.pos; // Already BOARD_SIZE + idx
    } else {
      return [getTokenPos(newToken, color, tokenIndex)];
    }

    if (newToken.state === 'active') {
      newRel = (newToken.pos - startPos + BOARD_SIZE) % BOARD_SIZE;
      if (newRel < oldRel) newRel += BOARD_SIZE;
    } else if (newToken.state === 'home-stretch') {
      newRel = newToken.pos;
    } else if (newToken.state === 'home') {
      newRel = BOARD_SIZE + HOME_STRETCH;
    } else {
      return [getTokenPos(newToken, color, tokenIndex)];
    }

    for (var rel = oldRel; rel <= newRel; rel++) {
      if (rel >= BOARD_SIZE + HOME_STRETCH) {
        // Home center
        var offsets = { red: [-0.4, -0.4], blue: [-0.4, 0.4], green: [0.4, 0.4], yellow: [0.4, -0.4] };
        var off = offsets[color] || [0, 0];
        path.push({ r: 7 + off[0], c: 7 + off[1] });
      } else if (rel >= BOARD_SIZE) {
        // Home stretch
        var hsIdx = rel - BOARD_SIZE;
        var hc = HOME_STRETCH_COORDS[color][hsIdx];
        if (hc) path.push({ r: hc[0], c: hc[1] });
      } else {
        // Main track
        var absPos = (startPos + (rel % BOARD_SIZE)) % BOARD_SIZE;
        var tc = TRACK[absPos];
        if (tc) path.push({ r: tc[0], c: tc[1] });
      }
    }
    return path;
  }

  function startMoveAnimation(board, data, color, tokenIndex, oldToken, newToken) {
    var path = computeMovePath(color, tokenIndex, oldToken, newToken);
    if (path.length <= 1) {
      renderTokensOnBoard(board, data, null);
      return;
    }

    moveAnimating = true;
    var step = 0;

    function doStep() {
      if (step >= path.length) {
        moveAnimating = false;
        renderTokensOnBoard(board, data, null);
        if (pendingUpdate) {
          var upd = pendingUpdate;
          pendingUpdate = null;
          render(upd);
        }
        return;
      }

      renderTokensOnBoard(board, data, {
        color: color,
        tokenIndex: tokenIndex,
        pos: path[step]
      });

      step++;
      setTimeout(doStep, step === 1 && oldToken.state === 'base' ? 450 : 250);
    }

    doStep();
  }

  function renderTokensOnBoard(board, data, override) {
    if (!board) return;
    if (!boardSVGCache) boardSVGCache = buildBoardSVG();

    // Collect all token positions (with override applied)
    var allTokens = [];
    for (var pi = 0; pi < data.players.length; pi++) {
      var player = data.players[pi];
      for (var ti = 0; ti < player.tokens.length; ti++) {
        var token = player.tokens[ti];
        var pos;
        if (override && override.color === player.color && override.tokenIndex === ti) {
          pos = override.pos;
        } else {
          pos = getTokenPos(token, player.color, ti);
        }
        if (!pos) continue;

        var isMovable = data.isMyTurn && data.phase === 'moving' && !moveAnimating
          && player.color === data.myColor && data.movable.includes(ti);

        allTokens.push({
          player: player, ti: ti, token: token, pos: pos,
          isMovable: isMovable
        });
      }
    }

    // Group by position for stacking detection
    var posMap = {};
    for (var ai = 0; ai < allTokens.length; ai++) {
      var t = allTokens[ai];
      var key = Math.round(t.pos.r * 10) + '_' + Math.round(t.pos.c * 10);
      if (!posMap[key]) posMap[key] = [];
      posMap[key].push(ai);
    }

    // Apply stacking offsets
    var stackOffsets2 = [[-0.3, -0.3], [0.3, -0.3]];
    var stackOffsets3 = [[-0.3, -0.3], [0.3, -0.3], [0, 0.35]];
    var stackOffsets4 = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];

    for (var key2 in posMap) {
      var group = posMap[key2];
      if (group.length > 1) {
        var offArr = group.length === 2 ? stackOffsets2 : group.length === 3 ? stackOffsets3 : stackOffsets4;
        for (var gi = 0; gi < group.length; gi++) {
          var idx = group[gi];
          var off = offArr[gi % offArr.length];
          allTokens[idx].pos = {
            r: allTokens[idx].pos.r + off[0],
            c: allTokens[idx].pos.c + off[1]
          };
        }
      }
    }

    // Build tokens HTML
    var tokensHtml = '';
    var counterRot = boardRotation ? 'transform:rotate('+(-boardRotation)+'deg)' : '';
    for (var bi = 0; bi < allTokens.length; bi++) {
      var item = allTokens[bi];
      var left = ((item.pos.c + 0.5) / 15 * 100).toFixed(2);
      var top = ((item.pos.r + 0.5) / 15 * 100).toFixed(2);
      var cls = 'ludo-token ludo-token-' + item.player.color
        + (item.isMovable ? ' ludo-token-movable' : '')
        + (item.token.state === 'home' ? ' ludo-token-home' : '');

      tokensHtml += '<div class="'+cls+'" style="left:'+left+'%;top:'+top+'%" data-token="'+item.ti+'" data-movable="'+(item.isMovable?'1':'0')+'">'
        + '<span class="ludo-token-num" style="'+counterRot+'">'+(item.ti+1)+'</span></div>';
    }

    board.innerHTML = boardSVGCache + tokensHtml;

    // Attach token click events
    if (!moveAnimating) {
      board.querySelectorAll('[data-movable="1"]').forEach(function(el) {
        el.addEventListener('click', function() {
          if (typeof SFX !== 'undefined') SFX.click();
          socket.emit('ludo-move', { tokenIndex: parseInt(el.dataset.token) });
        });
      });
    }
  }

  function getTokenPos(token, color, idx) {
    if (token.state === 'base') {
      var s = BASE_SLOTS[color][idx];
      return { r: s[0], c: s[1] };
    } else if (token.state === 'active') {
      var tc = TRACK[token.pos];
      if (!tc) return null;
      return { r: tc[0], c: tc[1] };
    } else if (token.state === 'home-stretch') {
      var hsIdx = token.pos - BOARD_SIZE;
      var hc = HOME_STRETCH_COORDS[color][hsIdx];
      if (!hc) return null;
      return { r: hc[0], c: hc[1] };
    } else if (token.state === 'home') {
      // Offset by color AND index so home tokens don't overlap
      var homeBaseOff = { red: [-0.6, -0.6], blue: [-0.6, 0.6], green: [0.6, 0.6], yellow: [0.6, -0.6] };
      var hoff = homeBaseOff[color] || [0, 0];
      var idxOff = [[0, 0], [0.3, 0], [0, 0.3], [0.3, 0.3]];
      var ioff = idxOff[idx] || [0, 0];
      return { r: 7 + hoff[0] + ioff[0], c: 7 + hoff[1] + ioff[1] };
    }
    return null;
  }

  function attachEvents(data) {
    var rollBtn = document.getElementById('ludo-roll');
    if (rollBtn) {
      rollBtn.addEventListener('click', function() {
        if (diceAnimating) return;
        diceAnimating = true;
        pendingUpdate = null;
        if (typeof SFX !== 'undefined') SFX.diceRoll();
        rollBtn.disabled = true;

        // Replace only the dice section content, not the whole card
        var diceCard = document.getElementById('ludo-side-dice');
        var diceSection = diceCard ? diceCard.querySelector('.ludo-control-section') : null;
        if (!diceSection) diceSection = diceCard;
        if (diceSection) {
          diceSection.innerHTML = '<div class="ludo-dice-result ludo-dice-rolling" id="ludo-dice-anim">'
            + renderDiceSVG(1, 52) + '</div>';
        }
        var animEl = document.getElementById('ludo-dice-anim');

        // Emit to server immediately so result arrives during animation
        socket.emit('ludo-roll');

        var count = 0;
        var totalFrames = 15;
        var anim = setInterval(function() {
          var rnd = Math.floor(Math.random() * 6) + 1;
          if (animEl) animEl.innerHTML = renderDiceSVG(rnd, 52);
          count++;
          if (count >= totalFrames) {
            clearInterval(anim);
            waitForResult();
          }
        }, 100);

        function waitForResult() {
          if (pendingUpdate) {
            var upd = pendingUpdate;
            pendingUpdate = null;
            var realValue = upd.diceValue || (upd.lastAction && upd.lastAction.dice);
            // Show the REAL value on the big dice
            if (animEl) {
              animEl.classList.remove('ludo-dice-rolling');
              animEl.innerHTML = renderDiceSVG(realValue || 1, 52)
                + '<span class="ludo-dice-number">' + (realValue || '?') + '</span>';
              if (realValue === 6) animEl.classList.add('ludo-dice-six');
              animEl.classList.add('ludo-dice-landed');
            }
            if (typeof SFX !== 'undefined') SFX.diceReveal();
            // Hold the final value so player clearly sees it, then render board
            setTimeout(function() {
              diceAnimating = false;
              render(upd);
            }, 1000);
          } else {
            setTimeout(waitForResult, 50);
          }
        }
      });
    }
  }

  function getActionMsg(data) {
    var la = data.lastAction;
    if (!la) return '';
    var p = data.players.find(function(pl) { return pl.id === la.player; });
    var name = p ? escapeHtml(p.name) : '?';
    switch (la.type) {
      case 'leave-base': return name + ' moved a token out of base! 🚀';
      case 'move': return la.captured ? name + ' captured ' + escapeHtml(la.captured.playerName) + '\'s token! 💥' : name + ' moved ' + la.dice + ' spaces';
      case 'home': return '🏠 ' + name + '\'s token reached home!';
      case 'enter-home-stretch': return name + ' entered the home stretch! 🔥';
      case 'move-home-stretch': return name + ' moved in the home stretch';
      case 'no-move': return name + ' rolled ' + la.dice + ' — no moves available';
      case 'three-sixes': return name + ' rolled three 6s in a row — turn lost! 😵';
      default: return '';
    }
  }

  function renderGameOver(data) {
    var winner = data.players.find(function(p) { return p.color === data.winnerColor; });
    var wColor = data.winnerColor || 'red';
    var col = COLORS[wColor];
    gameView.innerHTML = '<div class="ludo-game fade-in" style="text-align:center">'
      + '<h2 style="margin-bottom:20px;font-size:1.8rem">🏆 Game Over!</h2>'
      + '<div class="ludo-winner-card" style="border-color:'+col.main+';box-shadow:0 0 30px '+col.glow+'">'
      + '<div style="font-size:3rem;margin-bottom:8px">'+(winner ? winner.avatar : '🎉')+'</div>'
      + '<div style="font-size:1.4rem;font-weight:800;color:'+col.main+'">'+escapeHtml(data.winnerName||'?')+' wins!</div>'
      + '<div style="font-size:0.9rem;color:var(--text-dim);margin-top:6px">All 4 tokens home! 🏠</div>'
      + '</div>'
      + '<div class="ludo-standings">'
      + data.players.map(function(p) {
          return '<div class="ludo-standing-row" style="border-left:4px solid '+COLORS[p.color].main+'">'
            + '<span>'+escapeHtml(p.name)+'</span>'
            + '<span style="color:var(--text-dim)">'+p.finished+'/4 home</span></div>';
        }).join('')
      + '</div>'
      + (isHost ? '<p style="color:var(--text-dim);margin-top:16px;font-size:0.85rem">Returning to lobby shortly...</p>' : '')
      + '</div>';
    if (isHost) setTimeout(function() { socket.emit('ludo-end'); }, 5000);
  }

  var lastSeenDice = null;

  socket.on('ludo-state', function(data) { render(data); });
  socket.on('ludo-update', function(data) {
    // If someone else rolled, show a brief dice animation for spectators
    if (!data.isMyTurn && data.diceValue && data.diceValue !== lastSeenDice && data.phase !== 'finished') {
      lastSeenDice = data.diceValue;
      showDiceAnimation(data.diceValue, function() {
        render(data);
      });
    } else {
      lastSeenDice = data.diceValue || lastSeenDice;
      render(data);
    }
  });

  function showDiceAnimation(finalValue, callback) {
    // Find the dice section inside the control card
    var diceArea = document.getElementById('ludo-side-dice');
    if (!diceArea) { callback(); return; }
    var diceSection = diceArea.querySelector('.ludo-control-section');
    if (!diceSection) diceSection = diceArea;

    diceAnimating = true;
    pendingUpdate = null;

    if (typeof SFX !== 'undefined') SFX.diceRoll();

    // Show animated dice only in section
    diceSection.innerHTML = '<div class="ludo-dice-result ludo-dice-rolling" id="ludo-dice-anim">' + renderDiceSVG(1, 52) + '</div>';
    var animEl = document.getElementById('ludo-dice-anim');
    if (!animEl) { diceAnimating = false; callback(); return; }

    var count = 0;
    var totalFrames = 15;
    var anim = setInterval(function() {
      var rnd = Math.floor(Math.random() * 6) + 1;
      animEl.innerHTML = renderDiceSVG(rnd, 52);
      count++;
      if (count >= totalFrames) {
        clearInterval(anim);
        // Show final value with number
        animEl.classList.remove('ludo-dice-rolling');
        animEl.innerHTML = renderDiceSVG(finalValue, 52)
          + '<span class="ludo-dice-number">' + finalValue + '</span>';
        if (finalValue === 6) animEl.classList.add('ludo-dice-six');
        animEl.classList.add('ludo-dice-landed');
        if (typeof SFX !== 'undefined') SFX.diceReveal();
        setTimeout(function() {
          diceAnimating = false;
          callback();
        }, 1000);
      }
    }, 100);
  }

  window.ludoGame = { render: render };
})();
