// ===== 2048 Cyberpunk Game Engine =====
(() => {
  'use strict';

  const SIZE = 4;
  const SWIPE_MIN = 30;

  // Respect prefers-reduced-motion
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOVE_MS = reducedMotion ? 0 : 150;
  const FADE_MS = reducedMotion ? 0 : 250;
  const POP_MS = reducedMotion ? 0 : 250;
  const MERGE_POP_MS = reducedMotion ? 0 : 300;

  // DOM
  const gridBoard = document.getElementById('grid-board');
  const tileLayer = document.getElementById('tile-layer');
  const scoreEl = document.getElementById('score');
  const bestScoreEl = document.getElementById('best-score');
  const overlayEl = document.getElementById('game-overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnContinue = document.getElementById('btn-continue');
  const btnRestart = document.getElementById('btn-restart');

  // State
  let grid = [];
  let score = 0;
  let bestScore = 0;
  let gameOver = false;
  let won = false;
  let keepPlaying = false;
  let moving = false;
  let uid = 0;

  // ==================== Init ====================
  function init() {
    bestScore = parseInt(localStorage.getItem('2048_bestScore')) || 0;
    if (!loadState()) newGame();
    bindInputs();
  }

  function newGame() {
    grid = emptyGrid();
    score = 0;
    gameOver = false;
    won = false;
    keepPlaying = false;
    moving = false;
    hideOverlay();
    spawnTile();
    spawnTile();
    renderTiles(true);
    updateScoreDisplay();
    saveState();
  }

  // ==================== Grid helpers ====================
  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function emptyCells() {
    const cells = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!grid[r][c]) cells.push({ r, c });
    return cells;
  }

  function spawnTile() {
    const cells = emptyCells();
    if (!cells.length) return null;
    const { r, c } = cells[Math.floor(Math.random() * cells.length)];
    const tile = { id: ++uid, value: Math.random() < 0.9 ? 2 : 4, row: r, col: c, isNew: true, isMerged: false };
    grid[r][c] = tile;
    return tile;
  }

  // ==================== Move ====================
  function move(dir) {
    if (moving || gameOver) return false;

    const reverse = dir === 'down' || dir === 'right';
    const horizontal = dir === 'left' || dir === 'right';
    const order = reverse ? [3, 2, 1, 0] : [0, 1, 2, 3];

    const movements = [];
    const merges = [];
    let moved = false;
    let gained = 0;
    const mergedCells = new Set();

    for (const i of order) {
      for (const j of order) {
        const tile = horizontal ? grid[i]?.[j] : grid[j]?.[i];
        if (!tile) continue;

        const origR = tile.row;
        const origC = tile.col;
        let r = origR, c = origC;

        while (true) {
          const nr = r + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0);
          const nc = c + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0);
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) break;
          const target = grid[nr][nc];
          if (!target) { r = nr; c = nc; }
          else if (target.value === tile.value && !mergedCells.has(`${nr},${nc}`)) { r = nr; c = nc; break; }
          else break;
        }

        if (r !== origR || c !== origC) {
          moved = true;
          const target = grid[r][c];
          grid[origR][origC] = null;

          if (target && target.value === tile.value) {
            mergedCells.add(`${r},${c}`);
            gained += tile.value * 2;
            movements.push({ tile, origR, origC, toR: r, toC: c });
            merges.push({ survivor: target, consumed: tile, newValue: tile.value * 2, atR: r, atC: c });
          } else {
            grid[r][c] = tile;
            movements.push({ tile, origR, origC, toR: r, toC: c });
          }
        }
      }
    }

    if (!moved) return false;

    moving = true;
    score += gained;

    // Animate from original positions
    renderMovement(movements, merges);

    // After slide animation
    setTimeout(() => {
      // Apply merges
      for (const m of merges) {
        m.survivor.value = m.newValue;
        m.survivor.isMerged = true;
        m.survivor.isNew = false;
        grid[m.atR][m.atC] = m.survivor;
      }

      // New tile
      spawnTile();

      // Render final state
      renderTiles();

      // Merge animations (scale pulse + consumed fade)
      animateMerges(merges);

      updateScoreDisplay();

      // Win check
      if (!won && !keepPlaying && hasValue(2048)) {
        won = true;
        setTimeout(() => showOverlay('won'), 300);
      }

      // Game over check
      if (isGameOver()) {
        gameOver = true;
        setTimeout(() => showOverlay('gameover'), 500);
      }

      saveState();

      setTimeout(() => {
        moving = false;
        for (let r = 0; r < SIZE; r++)
          for (let c = 0; c < SIZE; c++)
            if (grid[r][c]) grid[r][c].isMerged = false;
      }, Math.max(MERGE_POP_MS, POP_MS) + 200);

    }, MOVE_MS + 30);

    return true;
  }

  // ==================== Rendering ====================
  function cellPos(row, col) {
    const cs = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
    const cg = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-gap'));
    const gp = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-pad'));
    return { x: gp + col * (cs + cg), y: gp + row * (cs + cg) };
  }

  function createTileEl(tile, row, col) {
    const pos = cellPos(row, col);
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.value = tile.value;
    el.dataset.id = tile.id;
    el.textContent = tile.value;
    el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    return { el, pos };
  }

  function renderTiles(skipPopIn) {
    tileLayer.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = grid[r][c];
        if (!tile) continue;
        const { el, pos } = createTileEl(tile, r, c);

        if (!skipPopIn && tile.isNew) {
          el.style.opacity = '0';
          el.style.transform += ' scale(0)';
          tileLayer.appendChild(el);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = `transform ${POP_MS}ms cubic-bezier(0.175,0.885,0.32,1.275), opacity ${POP_MS}ms ease`;
            el.style.opacity = '1';
            el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1)`;
            tile.isNew = false;
          }));
        } else {
          tile.isNew = false;
          tileLayer.appendChild(el);
        }
      }
    }
  }

  function renderMovement(movements, merges) {
    tileLayer.innerHTML = '';

    const consumedIds = new Set(merges.map(m => m.consumed.id));
    const rendered = new Set();

    for (const mv of movements) {
      const { tile, origR, origC, toR, toC } = mv;
      const startPos = cellPos(origR, origC);
      const endPos = cellPos(toR, toC);

      if (consumedIds.has(tile.id)) {
        // Consumed tile: render at origin, animate to merge target + fade
        const { el } = createTileEl(tile, origR, origC);
        tileLayer.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.transition = `transform ${MOVE_MS}ms ease-in-out, opacity ${FADE_MS}ms ease`;
          el.style.transform = `translate(${endPos.x}px, ${endPos.y}px)`;
          el.style.opacity = '0';
        }));
      } else {
        // Sliding tile: render at origin, animate to destination
        const { el } = createTileEl(tile, origR, origC);
        tileLayer.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.transition = `transform ${MOVE_MS}ms ease-in-out`;
          el.style.transform = `translate(${endPos.x}px, ${endPos.y}px)`;
        }));
      }
      rendered.add(tile.id);
    }

    // Static tiles (didn't move)
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = grid[r][c];
        if (!tile || rendered.has(tile.id)) continue;
        const { el } = createTileEl(tile, r, c);
        tileLayer.appendChild(el);
      }
    }
  }

  function animateMerges(merges) {
    for (const m of merges) {
      const el = tileLayer.querySelector(`[data-id="${m.survivor.id}"]`);
      if (!el) continue;

      // Update value + visual
      el.textContent = m.newValue;
      el.dataset.value = m.newValue;

      const pos = cellPos(m.atR, m.atC);

      // Scale pulse
      el.style.transition = `transform ${MERGE_POP_MS / 2}ms cubic-bezier(0.175,0.885,0.32,1.275)`;
      el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1.2)`;
      setTimeout(() => {
        el.style.transition = `transform ${MERGE_POP_MS / 2}ms ease`;
        el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1)`;
      }, MERGE_POP_MS / 2);
    }

    // Remove consumed tile elements
    for (const m of merges) {
      const cel = tileLayer.querySelector(`[data-id="${m.consumed.id}"]`);
      if (cel) cel.remove();
    }
  }

  // ==================== Score ====================
  function updateScoreDisplay() {
    scoreEl.textContent = score;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('2048_bestScore', bestScore);
    }
    bestScoreEl.textContent = bestScore;

    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), 150);
  }

  // ==================== Win / Lose ====================
  function hasValue(target) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (grid[r][c]?.value >= target) return true;
    return false;
  }

  function isGameOver() {
    if (emptyCells().length > 0) return false;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c]?.value;
        if (c < SIZE - 1 && grid[r][c + 1]?.value === v) return false;
        if (r < SIZE - 1 && grid[r + 1]?.[c]?.value === v) return false;
      }
    return true;
  }

  // ==================== Overlay ====================
  function showOverlay(type) {
    overlayEl.classList.remove('game-over', 'won');
    if (type === 'gameover') {
      overlayEl.classList.add('game-over', 'visible');
      overlayTitle.textContent = 'Game Over';
      overlayText.textContent = `Final Score: ${score}`;
      btnContinue.style.display = 'none';
    } else {
      overlayEl.classList.add('won', 'visible');
      overlayTitle.textContent = 'You Reached 2048!';
      overlayText.textContent = `Score: ${score}`;
      btnContinue.style.display = '';
    }
  }

  function hideOverlay() {
    overlayEl.classList.remove('visible', 'game-over', 'won');
  }

  // ==================== Input ====================
  function bindInputs() {
    document.addEventListener('keydown', (e) => {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right'
      };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    });

    let tx = 0, ty = 0;
    gridBoard.addEventListener('touchstart', (e) => {
      tx = e.touches[0].clientX; ty = e.touches[0].clientY;
    }, { passive: true });

    gridBoard.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });

    btnRestart.addEventListener('click', () => { localStorage.removeItem('2048_state'); newGame(); });
    btnContinue.addEventListener('click', () => { keepPlaying = true; hideOverlay(); });
  }

  // ==================== Save / Load ====================
  function saveState() {
    localStorage.setItem('2048_state', JSON.stringify({
      grid: grid.map(row => row.map(c => c ? c.value : 0)),
      score, bestScore, gameOver, won, keepPlaying
    }));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('2048_state');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s.grid || s.grid.length !== SIZE) return false;

      score = s.score || 0;
      bestScore = Math.max(s.bestScore || 0, parseInt(localStorage.getItem('2048_bestScore')) || 0);
      gameOver = !!s.gameOver;
      won = !!s.won;
      keepPlaying = !!s.keepPlaying;

      grid = emptyGrid();
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          const v = s.grid[r][c];
          if (v) grid[r][c] = { id: ++uid, value: v, row: r, col: c, isNew: false, isMerged: false };
        }

      renderTiles(true);
      updateScoreDisplay();
      if (gameOver) setTimeout(() => showOverlay('gameover'), 300);
      else if (won && !keepPlaying) setTimeout(() => showOverlay('won'), 300);
      return true;
    } catch { return false; }
  }

  init();
})();
