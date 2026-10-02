// The pop-out status bubble: Clawd shows what Claude is doing.
//   working → "Thinking…" (Clawd looks up and taps his feet)
//   done    → "Done!" (Clawd jumps with confetti; Meter.swift hides it after a few seconds)
//   waiting → "Needs you" (Clawd waves; Claude is waiting for a permission)
// Opened in a browser it shows a demo: bubble.html?state=done&side=below&theme=light
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const box = $('bubble'), canvas = $('sprite'), ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CELL = 3, COLS = 15, ROWS = 11;
  const ORANGE = '#D97757', INK = '#0B0A12';
  const CONFETTI = ['#E8FF00', '#22E0D6', '#E0218A', '#7C5CFF'];

  // O = Clawd, K = eye. Same character as the lane, with a few poses.
  const SPR = {
    lookUp:  ['.OOKOOOKOO.', '.OOKOOOKOO.', 'OOOOOOOOOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    lookUp2: ['.OOKOOOKOO.', '.OOKOOOKOO.', 'OOOOOOOOOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'],
    cheer:   ['O.OOOOOOO.O', 'OOOKOOOKOOO', '.OOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'],
    waveA:   ['O.OOOOOOOO.', 'OOOKOOOKOOO', '.OOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    waveB:   ['..OOOOOOOO.', 'OOOKOOOKOOO', 'OOOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
  };

  let state = 'working', frame = 0;
  const words = { working: 'Thinking', done: 'Done!', waiting: 'Needs you' };

  function sprite(rows, x, y) {
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '.') continue;
        ctx.fillStyle = row[c] === 'K' ? INK : ORANGE;
        ctx.fillRect((x + c) * CELL, (y + r) * CELL, CELL, CELL);
      }
    });
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== COLS * CELL * dpr) { canvas.width = COLS * CELL * dpr; canvas.height = ROWS * CELL * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);
    const f = reduce ? 0 : frame;
    if (state === 'done') {
      const lift = [0, 2, 3, 2][f % 4];
      sprite(SPR.cheer, 2, 4 - lift);
      // Confetti that twinkles in steps around him
      for (let i = 0; i < 6; i++) {
        if ((i + f) % 3 === 0) continue;
        ctx.fillStyle = CONFETTI[(i + f) % CONFETTI.length];
        const x = [0, 13, 1, 14, 6, 9][i], y = [1, 0, 6, 5, 0, 1][i];
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    } else if (state === 'waiting') {
      sprite(Math.floor(f / 2) % 2 ? SPR.waveA : SPR.waveB, 2, 4);
    } else {
      sprite(Math.floor(f / 3) % 2 ? SPR.lookUp : SPR.lookUp2, 2, 4);
    }
    $('dots').textContent = state === 'working' ? '.'.repeat(1 + (Math.floor(f / 3) % 3)) : '';
  }

  function show(next, theme, side) {
    const resolved = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : (theme || 'dark');
    root.dataset.theme = resolved;
    box.dataset.side = side || 'above';
    const changed = next !== state || !box.classList.contains('on');
    state = next;
    box.dataset.state = state;
    $('text').textContent = words[state] || '';
    if (changed) { box.classList.remove('on'); void box.offsetWidth; box.classList.add('on'); }   // replay the pop
    draw();
  }
  function hide() { box.classList.remove('on'); }

  setInterval(() => { frame++; if (box.classList.contains('on')) draw(); }, 150);
  window.bubble = { show, hide };

  if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bubble)) {
    const q = new URLSearchParams(location.search);
    if (q.get('state')) show(q.get('state'), q.get('theme') || 'dark', q.get('side') || 'above');
  }
})();
