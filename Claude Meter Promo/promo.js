// Claude Meter — 20 second promo, "arcade attract mode".
// Everything is drawn from one function, render(t), so the browser preview and the exported MP4
// (render.swift calls window.__frame(i)) are frame-for-frame identical.
//
// Timeline (20 s, slow enough to read every caption)
//   0.0  power on → the pain: "How much Claude is left?" + 27 usage checks today
//   4.6  one calm desktop shot: Claude chat + Claude Code both working
//          4.6  live numbers: usage from both flies into the meter, which ticks down, "● LIVE · updated 0s ago"
//          9.0  "THINKING… ×2": Clawd shows both are thinking
//         13.8  "DONE!" (Chat): Clawd celebrates
//  17.4  end card with the GitHub link → power off (loops)
(() => {
  const W = 1080, H = 1350, FPS = 30, DUR = 20;
  const C = {
    ink: '#0B0A12', bg2: '#141122', surf: '#1D1A2D', surf2: '#2A2640', line: '#3A3554',
    fg: '#F2F0FF', text2: '#C9C6DA', muted: '#9A96B0', lime: '#E8FF00', violet: '#7C5CFF',
    cyan: '#22E0D6', pink: '#E0218A', pinkText: '#FF5CAD', orange: '#FF7A1A', clawd: '#D97757', dark: '#0E0E0B',
  };

  const canvas = document.getElementById('v');
  const ctx = canvas.getContext('2d');
  // The game world is drawn on a 180×225 buffer and blown up 6× for real chunky pixels.
  const PX = 6, LW = W / PX, LH = H / PX;
  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lc = low.getContext('2d');

  // ---------- small helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, x) => a + (b - a) * x;
  const outExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const noise = (a, b = 0) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const tick = (t, fps = 12) => Math.floor(t * fps);          // stepped animation clock
  const blink = (t, hz = 2) => Math.floor(t * hz * 2) % 2 === 0;
  // piecewise-linear keyframes: [[t, v], ...]
  const keys = (t, k) => {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], seg(t, k[i - 1][0], k[i][0]));
    return k[k.length - 1][1];
  };
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  function spr(c, rows, x, y, s, pal) {
    rows.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        const col = pal[row[i]];
        if (col) { c.fillStyle = col; c.fillRect(Math.round(x + i * s), Math.round(y + r * s), s, s); }
      }
    });
  }

  // Text on the full-resolution layer. `track` is letter spacing in px, `chroma` a pink/cyan split.
  function text(str, x, y, o = {}) {
    const { font = 'Geist Pixel', size = 40, weight = '', color = C.fg, align = 'left', track = 0, chroma = 0, shadow = null, alpha = 1 } = o;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px "${font}"`;
    ctx.textBaseline = 'alphabetic';
    const widths = [...str].map(ch => ctx.measureText(ch).width);
    const total = track ? widths.reduce((a, b) => a + b, 0) + track * (widths.length - 1) : ctx.measureText(str).width;
    const left = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const pass = (dx, dy, col) => {
      ctx.fillStyle = col;
      if (!track) { ctx.textAlign = 'left'; ctx.fillText(str, left + dx, y + dy); return; }
      let cx = left;
      [...str].forEach((ch, i) => { ctx.fillText(ch, cx + dx, y + dy); cx += widths[i] + track; });
    };
    if (shadow) pass(shadow[0], shadow[1], shadow[2]);
    if (chroma) { pass(-chroma, 0, C.pink); pass(chroma, 0, C.cyan); }
    pass(0, 0, color);
    ctx.restore();
    return total;
  }

  // ---------- sprites (one letter = one pixel) ----------
  const SPR = {
    runA:  ['.OOOOOOOOO.', '.OOKOOOKOO.', 'OOOKOOOKOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    runB:  ['.OOOOOOOOO.', '.OOKOOOKOO.', 'OOOKOOOKOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'],
    panic: ['O.OOOOOOO.O', 'OOOKOOOKOOO', '.OOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'],
    cheer: ['O.OOOOOOO.O', 'OOOKOOOKOOO', '.OOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    look:  ['.OOKOOOKOO.', '.OOKOOOKOO.', 'OOOOOOOOOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    arrow: ['X.....', 'XX....', 'XWX...', 'XWWX..', 'XWWWX.', 'XWWWWX', 'XWWXXX', 'XXWX..', '...XX.'],
  };
  const CLAWD = { O: C.clawd, K: C.ink };

  // A wall of flames from x=ox up to `front` (in cells). Tallest at the front, embers behind.
  function fire(c, ox, groundY, front, maxH, t, cell = 1, allAblaze = false) {
    const flick = tick(t, 10);
    for (let x = 0; x <= front; x++) {
      const dist = front - x, g = Math.floor(x / 2);
      let h = (dist < 34 || allAblaze)
        ? Math.round((0.35 + 0.65 * noise(g, flick)) * maxH * (allAblaze ? 0.8 : 1 - dist / 48))
        : 1 + Math.floor(noise(g, flick) * 3);
      h = Math.max(1, h);
      for (let r = 0; r < h; r++) {
        const p = r / Math.max(1, h - 1);
        rect(c, (ox + x) * cell, (groundY - 1 - r) * cell, cell, cell, h <= 2 ? C.pink : p < 0.4 ? C.pink : p < 0.8 ? C.orange : C.lime);
      }
    }
    // embers drifting up off the front
    for (let i = 0; i < 16; i++) {
      const ex = ox + front - Math.floor(noise(i, 3) * 26);
      const rise = (t * 18 + noise(i, 7) * 60) % (maxH * 1.6);
      if (ex < ox) continue;
      rect(c, ex * cell, Math.round(groundY - maxH * 0.3 - rise) * cell, cell, cell, i % 3 ? C.orange : C.lime);
    }
  }

  // ---------- CRT overlay (built once) ----------
  const scan = document.createElement('canvas'); scan.width = W; scan.height = H;
  {
    const s = scan.getContext('2d');
    for (let y = 0; y < H; y += 4) { s.fillStyle = 'rgba(0,0,0,0.26)'; s.fillRect(0, y + 2, W, 2); }
    const g = s.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
  }
  function crt(t) {
    ctx.drawImage(scan, 0, 0);
    const band = (t * 260) % (H + 240) - 240;                  // slow rolling bar
    ctx.fillStyle = 'rgba(242,240,255,0.035)'; ctx.fillRect(0, band, W, 160);
    ctx.fillStyle = `rgba(242,240,255,${0.012 * noise(tick(t, 30))})`; ctx.fillRect(0, 0, W, H);
  }

  // Horizontal tear on every hard cut, like a cabinet switching scenes.
  const CUTS = [4.6, 17.4];
  function tear(t) {
    for (const cut of CUTS) {
      const d = t - cut;
      if (d < 0 || d > 0.14) continue;
      const f = tick(d, 30);
      for (let i = 0; i < 9; i++) {
        const y = Math.floor(noise(i, f + 1) * H), h = 20 + Math.floor(noise(i, f + 9) * 90);
        const dx = (noise(i, f + 4) - 0.5) * 160;
        ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
      }
    }
  }

  // ---------- captions ----------
  const CAPS = [
    [1.2, 4.55, 'I kept opening the usage page to check how much Claude I had left.'],
    [4.9, 8.95, 'Now the meter shows my real usage, live, across chat and Claude Code.'],
    [9.25, 13.75, 'When Claude is thinking, in chat or in code, Clawd lets me know.'],
    [14.05, 17.35, "And when it's done, he celebrates, so I can stop checking."],
  ];
  function wrap(str, max) {
    const words = str.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > max && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
    return lines;
  }
  function captions(t) {
    const cap = CAPS.find(c => t >= c[0] && t < c[1]);
    if (!cap) return;
    const shown = Math.floor(seg(t, cap[0], cap[0] + cap[2].length / 55) * cap[2].length);   // typewriter
    ctx.save();
    ctx.font = '600 44px "Geist"';
    const lines = wrap(cap[2], 900);
    const lh = 58, boxH = lines.length * lh + 44, top = 1290 - boxH;
    rect(ctx, 60 + 10, top + 10, W - 120, boxH, C.violet);           // hard shadow, it's the world
    rect(ctx, 60, top, W - 120, boxH, C.ink);
    ctx.strokeStyle = C.lime; ctx.lineWidth = 4; ctx.strokeRect(62, top + 2, W - 124, boxH - 4);
    let left = shown;
    lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1;
      ctx.fillStyle = C.fg; ctx.textAlign = 'center';
      // keep each line centred on its final width so letters don't slide while typing
      const full = ctx.measureText(ln).width;
      ctx.textAlign = 'left';
      ctx.fillText(part, W / 2 - full / 2, top + 22 + 44 + i * lh);
    });
    ctx.restore();
  }

  // ---------- HUD bits ----------
  function arcadeHud(t, credit) {
    text('1UP', 60, 74, { font: 'Geist Mono', weight: 700, size: 28, color: blink(t, 1.5) ? C.lime : C.ink, track: 4 });
    text('HI-SCORE', W / 2, 74, { font: 'Geist Mono', weight: 700, size: 28, color: C.pinkText, align: 'center', track: 4 });
    text(`CREDIT ${credit}`, W - 60, 74, { font: 'Geist Mono', weight: 700, size: 28, color: C.muted, align: 'right', track: 4 });
    text('000100', 60, 120, { size: 40, color: C.fg });
    text('999999', W / 2, 120, { size: 40, color: C.fg, align: 'center' });
  }
  const pad = n => String(n).padStart(2, '0');
  const fmtLeft = e => { const m = Math.round((1 - e) * 300); return `${Math.floor(m / 60)}H ${pad(m % 60)}M`; };

  // ---------- scenes ----------
  function sceneHook(t) {
    rect(ctx, 0, 0, W, H, C.ink);
    // starfield on the low layer
    lc.clearRect(0, 0, LW, LH);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(noise(i, 1) * LW), y = Math.floor(noise(i, 2) * 150) + 20;
      if ((tick(t, 6) + i) % 7 === 0) continue;
      rect(lc, x, y, 1, 1, i % 9 === 0 ? C.violet : C.surf2);
    }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, W, H);
    arcadeHud(t, 0);

    const lines = ['HOW MUCH', 'CLAUDE IS', 'LEFT?'];
    const total = lines.join('').length;
    let n = Math.floor(seg(t, 0.45, 1.5) * total);
    lines.forEach((ln, i) => {
      const s = ln.slice(0, Math.max(0, n)); n -= ln.length;
      text(s, 60, 360 + i * 150, { size: 150, color: i === 2 ? C.lime : C.fg, chroma: 5 });
    });

    // the habit counter
    if (t > 1.35) {
      const count = Math.floor(lerp(0, 27, outExpo(seg(t, 1.4, 2.7))));
      const slam = t < 1.5 ? 1.25 : 1;
      ctx.save(); ctx.translate(W - 60, 930); ctx.scale(slam, slam);
      text(`${count}×`, 0, 0, { size: 230, color: C.pinkText, align: 'right', shadow: [12, 12, C.violet] });
      ctx.restore();
      text('USAGE CHECKS TODAY', W - 60, 1000, { font: 'Geist Mono', weight: 700, size: 30, color: C.muted, align: 'right', track: 5 });
    }
  }

  function widget(x, y, s, t, used, liveAgo = 0, flash = 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const Wc = 352, Hc = 274;
    rect(ctx, 6, 6, Wc, Hc, C.violet);
    rect(ctx, 0, 0, Wc, Hc, C.ink);
    ctx.strokeStyle = C.fg; ctx.lineWidth = 2; ctx.strokeRect(1, 1, Wc - 2, Hc - 2);
    const mono = (str, xx, yy, size, col, align = 'left', weight = 700) =>
      text(str, xx, yy, { font: 'Geist Mono', weight, size, color: col, align, track: size * 0.14 });
    rect(ctx, 14, 12, 60, 19, C.lime); mono('CLAUDE', 20, 26, 9.5, C.dark);
    mono('PRO · 5-HOUR LIMIT', 82, 26, 10, C.muted);
    rect(ctx, 316 + 2, 10 + 2, 24, 24, C.violet); rect(ctx, 316, 10, 24, 24, C.surf);
    ctx.strokeStyle = C.fg; ctx.strokeRect(317, 11, 22, 22); rect(ctx, 322, 25, 12, 4, C.fg);
    const left = Math.floor(100 - used);
    const w = text(`${left}`, 13, 92, { size: 52, color: flash > 0 ? C.fg : C.lime });
    mono('%', 21 + w, 76, 10, C.fg); mono('LEFT', 21 + w, 90, 10, C.fg);
    mono('RESETS IN', 338, 58, 10, C.muted, 'right');
    text('2h 29m', 338, 86, { size: 26, color: C.fg, align: 'right' });
    mono('AT 20:20', 338, 101, 9.5, C.muted, 'right');
    // lane
    rect(ctx, 14, 112, 324, 52, C.bg2); ctx.strokeStyle = C.surf2; ctx.strokeRect(15, 113, 322, 50);
    ctx.save(); ctx.translate(16, 114);
    const cols = 80, ground = 11, flagX = cols - 5, x0 = 6, x1 = flagX - 6;
    const e = 0.5 + (t - 4.6) * 0.004;
    const front = Math.round(x0 + used / 100 * (x1 - x0)), cxw = Math.round(x0 + e * (x1 - x0));
    for (let xx = 0; xx < flagX; xx++) rect(ctx, xx * 4, ground * 4, 4, 4, xx <= front ? C.surf2 : (xx % 3 ? 'transparent' : C.surf2));
    rect(ctx, flagX * 4, 4, 4, (ground) * 4, C.fg);
    for (let fx = 0; fx < 4; fx++) for (let fy = 0; fy < 3; fy++) rect(ctx, (flagX + 1 + fx) * 4, (1 + fy) * 4, 4, 4, (fx + fy) % 2 ? C.ink : C.fg);
    fire(ctx, 0, ground, front, 8, t, 4);
    const run = tick(t, 7) % 2;
    spr(ctx, run ? SPR.runA : SPR.runB, (cxw - 5) * 4, (ground - 6 - run) * 4, 4, CLAWD);
    rect(ctx, (cxw - 8 - run) * 4, (ground - 4) * 4, 8, 4, C.muted);
    ctx.restore();
    mono(`BURNED ${Math.round(used)}%`, 16 + front * 4 - 30, 180, 8.5, C.pinkText, 'center');
    mono('NOW', 16 + cxw * 4, 180, 8.5, C.fg, 'center');
    mono('RESET', 338, 180, 8.5, C.muted, 'right');
    // weekly
    mono('WEEKLY LIMIT', 14, 206, 10, C.fg);
    text('60% left', 338, 207, { size: 16, color: C.fg, align: 'right' });
    rect(ctx, 14, 214, 324, 14, C.fg); rect(ctx, 16, 216, 320, 10, C.bg2); rect(ctx, 16, 216, 128, 10, C.lime);
    mono('USED 40%', 14, 244, 10, C.muted); mono('RESETS SUN 17:50', 338, 244, 10, C.muted, 'right');
    rect(ctx, 14, 252, 324, 2, C.surf2);
    rect(ctx, 14, 261, 6, 6, C.lime);
    const lw = mono('LIVE', 25, 267, 8.5, C.lime);
    mono(`· UPDATED ${liveAgo}S AGO`, 31 + lw, 267, 8.5, C.muted, 'left', 600);
    mono('© 2026 BON YEUNG', 338, 267, 8.5, C.muted, 'right', 600);
    ctx.restore();
  }

  function bubble(x, y, s, t, state, since, count = 1, label = '') {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const pop = [0.4, 0.75, 1.08, 1][Math.min(3, tick(since, 30))];
    ctx.translate(20, 44); ctx.scale(pop, pop); ctx.translate(-20, -44);
    const done = state === 'done';
    const word = done ? 'DONE!' : 'THINKING' + '.'.repeat(1 + (tick(t, 4) % 3));
    ctx.font = '700 12px "Geist Mono"';
    const bw = 76 + (done ? 60 : 110) + (!done && count > 1 ? 34 : 0);
    rect(ctx, 4, 4, bw, 44, C.violet);
    rect(ctx, 0, 0, bw, 44, done ? C.lime : C.ink);
    ctx.strokeStyle = done ? C.dark : C.fg; ctx.lineWidth = 2; ctx.strokeRect(1, 1, bw - 2, 42);
    // pixel tail
    [[14, 44, 14], [16, 46, 10], [18, 48, 6], [20, 50, 2]].forEach(([tx, ty, tw]) => rect(ctx, tx, ty, tw, 2, done ? C.dark : C.fg));
    [[16, 44, 10], [18, 46, 6], [20, 48, 2]].forEach(([tx, ty, tw]) => rect(ctx, tx, ty, tw, 2, done ? C.lime : C.ink));
    const lift = done ? [0, 2, 3, 2][tick(t, 10) % 4] : 0;
    spr(ctx, done ? SPR.cheer : SPR.look, 10, 12 - lift * 1.5 + (done ? 0 : 0), 3, CLAWD);
    if (done) for (let i = 0; i < 6; i++) if ((i + tick(t, 8)) % 3) rect(ctx, [3, 40, 4, 41, 20, 30][i], [3, 4, 36, 34, -6, -5][i], 3, 3, [C.violet, C.pink, C.cyan, C.violet, C.pink, C.cyan][i]);
    text(word, 54, done && label ? 22 : 28, { font: 'Geist Mono', weight: 700, size: 12, color: done ? C.dark : C.fg, track: 1.7 });
    if (done && label) text(label.toUpperCase(), 54, 35, { font: 'Geist Mono', weight: 700, size: 8, color: C.dark, track: 1.2 });
    if (!done && count > 1) {
      rect(ctx, bw - 40, 14, 30, 17, C.lime);
      text(`×${count}`, bw - 25, 27, { font: 'Geist Mono', weight: 700, size: 11, color: C.dark, align: 'center' });
    }
    ctx.restore();
  }

  // Usage "packets" fly from each app into the meter; each arrival ticks the number down.
  const PULSES = [[5.1, 'chat'], [5.9, 'code'], [6.7, 'chat'], [7.4, 'code'], [8.1, 'chat']];
  const FLY = 0.55;
  const MS = 1.8, MX = Math.round((W - 352 * MS) / 2), MY = 560;      // clear of the caption box      // the meter's place and size

  function appWindow(x, y, w, h, title, body) {
    rect(ctx, x + 12, y + 12, w, h, 'rgba(0,0,0,0.45)');
    rect(ctx, x, y, w, h, C.surf); rect(ctx, x, y, w, 50, C.surf2);
    [0, 1, 2].forEach(i => rect(ctx, x + 18 + i * 24, y + 19, 12, 12, C.line));
    text(title, x + w / 2, y + 33, { font: 'Geist', weight: 600, size: 22, color: C.fg, align: 'center' });
    ctx.save(); ctx.beginPath(); ctx.rect(x, y + 50, w, h - 50); ctx.clip(); body(x, y + 50, w, h - 50); ctx.restore();
  }

  function sceneMeter(t) {
    // ordered-dither wallpaper: ink into deep violet
    lc.clearRect(0, 0, LW, LH);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const v = y / LH * 0.9 + Math.sin(x / 26) * 0.05;
      rect(lc, x, y, 1, 1, v * 16 > bayer[(y % 4) * 4 + (x % 4)] ? '#24194F' : C.ink);
    }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, W, H);

    const thinking = t >= 9.0 && t < 13.8, done = t >= 13.8;
    const working = t < 9.0;
    // Claude chat: a question, then a reply that writes itself
    appWindow(40, 70, 480, 330, 'Claude', (x, y, w) => {
      rect(ctx, x + w - 250, y + 26, 220, 64, C.violet);
      rect(ctx, x + w - 236, y + 44, 170, 9, C.fg); rect(ctx, x + w - 236, y + 64, 120, 9, C.fg);
      const lines = done ? 5 : working ? Math.min(5, 1 + Math.floor((t - 4.6) * 1.1)) : 2;
      for (let i = 0; i < lines; i++) rect(ctx, x + 28, y + 120 + i * 30, 150 + noise(i, 3) * 250, 10, C.line);
      if (thinking) [0, 1, 2].forEach(i => { if ((tick(t, 4) + i) % 3) rect(ctx, x + 28 + i * 22, y + 200, 12, 12, C.lime); });
      if (done) text('Done', x + 300, y + 262, { font: 'Geist Mono', weight: 700, size: 22, color: C.lime });
    });
    // Claude Code: lines of work, then thinking
    appWindow(560, 70, 480, 330, 'Claude Code', (x, y, w) => {
      const lines = working ? Math.min(7, 2 + Math.floor((t - 4.6) * 1.4)) : 7;
      for (let i = 0; i < lines; i++) rect(ctx, x + 28 + (i % 3 ? 28 : 0), y + 26 + i * 30, 90 + noise(i, 9) * 280, 10, i % 4 === 1 ? C.violet : C.line);
      if (!working) {
        const spin = '|/-\\'[tick(t, 8) % 4];
        text(`${spin} Thinking`, x + 260, y + 262, { font: 'Geist Mono', weight: 700, size: 22, color: C.orange });
      }
    });

    // usage flying into the meter (the live-sync beat)
    const target = [MX + 40 * MS, MY + 70 * MS];
    let arrived = 0, lastArrival = 4.6;
    for (const [at, from] of PULSES) {
      const p = seg(t, at, at + FLY);
      if (t >= at + FLY) { arrived++; lastArrival = at + FLY; continue; }
      if (t < at) continue;
      const src = from === 'chat' ? [280, 400] : [800, 400];
      const q = Math.floor(p * 8) / 8;                                  // stepped flight
      const px = lerp(src[0], target[0], q), py = lerp(src[1], target[1], q);
      for (let k = 0; k < 3; k++) rect(ctx, px - k * 14 * (target[0] > src[0] ? 1 : -1), py + k * 10, 14, 14, k ? C.orange : C.lime);
      text(from === 'chat' ? 'CHAT' : 'CODE', src[0], src[1] + 44, { font: 'Geist Mono', weight: 700, size: 24, color: C.lime, align: 'center', track: 4, alpha: 1 - p });
    }
    const used = 28 + arrived * 2;
    const flash = t - lastArrival < 0.2 && arrived > 0 ? 1 : 0;
    const ago = Math.floor(t - lastArrival);
    widget(MX, MY, MS, t, used, ago, flash);
    if (working && t > 4.9) {
      const on = tick(t, 3) % 2 === 0;
      const box = (x, y, w, h) => {
        const L = 26, T = 6;
        [[x, y, L, T], [x, y, T, L], [x + w - L, y, L, T], [x + w - T, y, T, L],
         [x, y + h - T, L, T], [x, y + h - L, T, L], [x + w - L, y + h - T, L, T], [x + w - T, y + h - L, T, L]]
          .forEach(([a, b, c, d]) => rect(ctx, a, b, c, d, on ? C.lime : C.cyan));
      };
      box(MX + 4 * MS, MY + 40 * MS, 128 * MS, 62 * MS);                     // the number
      box(MX + 6 * MS, MY + 254 * MS, 190 * MS, 20 * MS);                    // ● LIVE · updated
    }

    // the status bubble pops out of the meter
    // bigger than life so it reads on a phone
    if (thinking) bubble(MX, MY - 142, 2.6, t, 'thinking', t - 9.0, 2);
    if (done) bubble(MX, MY - 142, 2.6, t, 'done', t - 13.8, 1, 'Chat');
  }

  function sceneEnd(t) {
    rect(ctx, 0, 0, W, H, C.ink);
    const d = t - 17.4;
    text('CLAUDE', W / 2, 380, { size: 210, color: C.lime, align: 'center', chroma: 6, shadow: [14, 14, C.violet] });
    text('METER', W / 2, 590, { size: 210, color: C.lime, align: 'center', chroma: 6, shadow: [14, 14, C.violet] });
    if (d > 0.25) text('Free and open source, for Mac.', W / 2, 700, { font: 'Geist', weight: 600, size: 46, color: C.fg, align: 'center' });
    if (d > 0.5) {
      rect(ctx, 100 + 10, 760 + 10, W - 200, 104, C.violet);
      rect(ctx, 100, 760, W - 200, 104, C.lime);
      text('github.com/bonyuiux/Claude-Meter', W / 2, 828, { font: 'Geist Mono', weight: 700, size: 40, color: C.dark, align: 'center' });
    }
    if (d > 0.75) text('Made by Bon Yeung', W / 2, 950, { font: 'Geist', weight: 600, size: 40, color: C.text2, align: 'center' });
    // a little race running along the bottom, forever
    lc.clearRect(0, 0, LW, LH);
    const g = 205, loopX = Math.floor((t * 22) % 230) - 30;
    rect(lc, 0, g, LW, 1, C.line);
    fire(lc, 0, g, Math.max(0, loopX - 22), 12, t);
    spr(lc, tick(t, 14) % 2 ? SPR.runA : SPR.runB, loopX - 5, g - 6 - (tick(t, 14) % 2), 1, CLAWD);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, W, H);
    text('Unofficial fan project. Not affiliated with Anthropic.', W / 2, 1300, { font: 'Geist Mono', weight: 500, size: 22, color: C.muted, align: 'center' });
  }

  // ---------- frame ----------
  function render(t) {
    t = ((t % DUR) + DUR) % DUR;
    ctx.save();
    if (t < 4.6) sceneHook(t);
    else if (t < 17.4) sceneMeter(t);
    else sceneEnd(t);
    ctx.restore();
    captions(t);
    tear(t);
    crt(t);
    // CRT power on (start) and off (end) so the loop feels like a cabinet cycling
    const on = seg(t, 0, 0.45), off = seg(t, 19.6, 20);
    if (on < 1 || off > 0) {
      const k = on < 1 ? on : 1 - off;
      const steps = Math.floor(k * 6) / 6;
      const h = steps < 0.34 ? 6 : H * (steps - 0.33) * 1.5, w = steps < 0.34 ? W * steps * 3 : W;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(W / 2 - w / 2, H / 2 - h / 2, w, h); ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore();
      if (steps < 0.34) { ctx.fillStyle = C.fg; ctx.fillRect(W / 2 - w / 2, H / 2 - 3, w, 6); }
    }
  }

  // ---------- playback + export hooks ----------
  const fontsReady = Promise.all([
    document.fonts.load('150px "Geist Pixel"'),
    document.fonts.load('700 30px "Geist Mono"'), document.fonts.load('600 30px "Geist Mono"'), document.fonts.load('500 30px "Geist Mono"'),
    document.fonts.load('600 44px "Geist"'), document.fonts.load('500 24px "Geist"'),
  ]).then(() => document.fonts.ready);
  window.__ready = fontsReady;
  window.__frame = (i, quality = 0.93) => { render(i / FPS); return canvas.toDataURL('image/jpeg', quality); };
  window.__meta = { W, H, FPS, DUR };

  if (!window.__export) {
    const q = new URLSearchParams(location.search);
    let paused = q.has('t'), t0 = performance.now() - (parseFloat(q.get('t')) || 0) * 1000, frozen = parseFloat(q.get('t')) || 0;
    fontsReady.then(() => {
      const loop = now => {
        const t = paused ? frozen : (now - t0) / 1000;
        render(Math.floor(t * FPS) / FPS);          // stick to the 30 fps grid, same as the export
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    addEventListener('keydown', e => {
      if (e.key === ' ') { if (paused) { t0 = performance.now() - frozen * 1000; } else { frozen = (performance.now() - t0) / 1000; } paused = !paused; e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (!paused) { frozen = (performance.now() - t0) / 1000; paused = true; } frozen += (e.key === 'ArrowRight' ? 1 : -1) / FPS; }
    });
  }
})();
