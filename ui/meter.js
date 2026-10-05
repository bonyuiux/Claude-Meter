// Claude Meter face. The native shell (Meter.swift) calls meter.update(data) every 15 seconds.
// Opened in a normal browser, it runs on demo data instead: add ?state=ok|close|warn|out|idle&theme=light&mini=1.
//
// The lane is one story: the 5-hour window is a race track.
//   Clawd runs from the start to the RESET flag as time passes (his position = time gone by).
//   A fire chases him (its front = how much of the window you've burned).
//   Fire behind Clawd = you're fine. Fire catches Clawd = you're burning faster than time,
//   and you'll run out before the reset.
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const card = $('card'), lane = $('lane'), laneBox = $('laneBox');
  const ctx = lane.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.meter;
  const post = msg => native && native.postMessage(msg);

  const CELL = 4;             // one sprite pixel = 4 CSS pixels
  const TICK = 150;           // stepped animation, about 7 frames a second
  const CLAWD_ORANGE = '#D97757';
  const CYAN = '#22E0D6', INK = '#0B0A12';
  const FIRE_LOW = '#E0218A', FIRE_MID = '#FF7A1A';   // brand pink at the base, orange in the middle

  // Pixel sprites as text grids (each letter is one pixel). O = Clawd orange, K = eye.
  const SPR = {
    runA:  ['.OOOOOOOOO.', '.OOKOOOKOO.', 'OOOKOOOKOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    runB:  ['.OOOOOOOOO.', '.OOKOOOKOO.', 'OOOKOOOKOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'],
    panic: ['O.OOOOOOO.O', 'OOOKOOOKOOO', '.OOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'],
    sleep: ['.OOOOOOOOO.', '.OOOOOOOOO.', 'OOKKOOOKKOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'],
    zz:    ['XXX', '.X.', 'XXX'],
  };

  const S = { d: null, clawdX: null, fireX: null, frame: 0, hop: 0, colors: {}, sized: false };

  // ---------- data in ----------

  function update(d) {
    const prevMini = root.classList.contains('mini');
    S.d = d;
    applyTheme(d.theme || 'dark');
    root.classList.toggle('mini', !!d.mini);
    $('sizeBtn').setAttribute('aria-label', d.mini ? 'Switch to full size' : 'Switch to mini size');
    $('sizeBtn').title = d.mini ? 'Full size' : 'Mini size';
    $('sizeBtn').innerHTML = d.mini
      ? '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1h6v6H1zM2 3v3h4V3z" fill-rule="evenodd"/></svg>'
      : '<svg viewBox="0 0 8 8" aria-hidden="true"><rect x="1" y="5" width="6" height="2"/></svg>';

    renderText();
    draw();                     // paint the lane straight away, not on the next tick
    if (prevMini !== !!d.mini || !S.sized) reportSize();
  }

  function applyTheme(t) {
    const resolved = t === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
    if (root.dataset.theme !== resolved) { root.dataset.theme = resolved; S.colors = {}; }
  }

  function color(name) {
    if (!S.colors[name]) S.colors[name] = getComputedStyle(root).getPropertyValue(name).trim();
    return S.colors[name];
  }

  // ---------- words and numbers ----------

  const pad = n => String(n).padStart(2, '0');
  function countdown(msLeft) {
    if (msLeft <= 0) return '0m';
    const m = Math.floor(msLeft / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return `${d}d ${h % 24}h`;
    if (h >= 1) return `${h}h ${pad(m % 60)}m`;
    return `${m}m ${pad(Math.floor(msLeft / 1000) % 60)}s`;
  }
  function clock(ms, withDay) {
    const t = new Date(ms);
    const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameDay = t.toDateString() === new Date().toDateString();
    return withDay || !sameDay ? `${t.toLocaleDateString([], { weekday: 'short' })} ${time}` : time;
  }
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
  }
  function elapsed(w) {
    if (!w || !w.startsAt) return 0;
    return Math.min(1, Math.max(0, (Date.now() - w.startsAt) / (w.resetsAt - w.startsAt)));
  }

  // ok: fire well behind · close: fire right behind (Clawd sweats) · warn: fire caught him · out · idle
  function mood() {
    const s = S.d.session || {};
    if (s.idle) return 'idle';
    if (s.percentUsed >= 99.5) return 'out';
    const gap = elapsed(s) * 100 - s.percentUsed;   // how far ahead of the fire Clawd is, in %
    if (gap < 0 || s.emptyAt) return 'warn';
    if (gap < 6 || s.percentUsed > 85) return 'close';
    return 'ok';
  }

  function renderText() {
    const d = S.d, s = d.session || {};
    const used = s.idle ? 0 : s.percentUsed;
    // Round "left" down so it never claims more than you really have.
    $('left').textContent = Math.max(0, Math.floor(100 - used));
    $('plan').textContent = (d.plan ? `${d.plan} · ` : '') + '5-hour limit';

    card.dataset.mood = mood();

    // Weekly: fill = used, right end = the limit, which resets at the time shown under it.
    const w = d.weekly || {};
    if (w.known && !w.idle) {
      const wUsed = Math.min(100, Math.ceil(w.percentUsed));
      $('wFill').style.width = `${wUsed}%`;
      $('wLeft').textContent = `${100 - wUsed}% left`;
      $('wUsed').textContent = `Used ${wUsed}%`;
      $('wReset').textContent = `Resets ${clock(w.resetsAt, true)}`;
    } else {
      $('wFill').style.width = '0%';
      $('wLeft').textContent = '--';
      $('wUsed').textContent = 'Used --';
      $('wReset').textContent = 'Type /sync-meter';
    }

    $('syncBtn').classList.remove('spinning');
    secondTick();
  }

  // Runs every second so the countdown is live between data updates.
  function secondTick() {
    if (!S.d) return;
    const s = S.d.session || {};
    if (s.idle || !s.resetsAt) {
      $('count').textContent = '5h 00m';
      $('resetAt').textContent = 'once you start';
    } else {
      $('count').textContent = countdown(s.resetsAt - Date.now());
      $('resetAt').textContent = `at ${clock(s.resetsAt)}`;
    }
    liveStatus();
  }

  // "● LIVE · updated 20s ago" when the numbers come straight from your account (refreshed every minute).
  // Anything else is shown in pink as NOT LIVE, so a stale number can never pass for a real one.
  const since = ms => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
  };
  function liveStatus() {
    const d = S.d;
    const live = d.live && d.liveAt;
    const last = d.liveAt || d.syncedAt;
    const foot = $('foot'), mini = $('miniLive');
    for (const el of [foot, mini]) { el.classList.toggle('live', !!live); el.classList.toggle('stale', !live); }
    if (live) {
      foot.innerHTML = `<i class="dot"></i><b>Live</b> · updated ${since(d.liveAt)} ago`;
      mini.innerHTML = `<i class="dot"></i>Live · ${since(d.liveAt)} ago`;
    } else {
      const why = d.liveProblem === 'signed-out' ? 'sign in, then sync' : last ? `${since(last)} ago` : 'press sync';
      foot.innerHTML = `<b>Not live</b> · ${why}`;
      mini.innerHTML = `Not live${last ? ` · ${since(last)} ago` : ''}`;
    }
  }

  function reportSize() {
    requestAnimationFrame(() => {
      S.sized = true;
      // + 8 leaves room for the hard shadow
      post({ type: 'size', w: Math.ceil(card.offsetWidth) + 8, h: Math.ceil(card.offsetHeight) + 8 });
    });
  }

  // ---------- the lane ----------

  function sprite(rows, x, y, pal) {
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const col = pal[row[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect((x + c) * CELL, (y + r) * CELL, CELL, CELL);
      }
    });
  }
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * CELL, y * CELL, w * CELL, h * CELL); };
  // Cheap repeatable "random" so flames flicker in steps rather than shimmering.
  const noise = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

  // A wall of flames from the start of the lane up to `front`. Tallest at the front, embers behind.
  function drawFire(front, rows, ground, allAblaze) {
    const tip = root.dataset.theme === 'light' ? '#FFB800' : '#E8FF00';
    const flick = reduce ? 0 : Math.floor(S.frame / 2);
    for (let x = 0; x <= front; x++) {
      const dist = front - x;
      const group = Math.floor(x / 2);   // 2-pixel-wide tongues read better than 1-pixel noise
      let h;
      if (dist < 14 || allAblaze) h = 4 + Math.floor(noise(group, flick) * (rows - 6));
      else h = 1 + Math.floor(noise(group, flick) * 2);
      h = Math.min(h, ground);
      for (let r = 0; r < h; r++) {
        const y = ground - 1 - r;
        const t = r / Math.max(1, h - 1);
        px(x, y, 1, 1, h <= 2 ? FIRE_LOW : t < 0.4 ? FIRE_LOW : t < 0.8 ? FIRE_MID : tip);
      }
    }
  }

  function draw() {
    if (!S.d) return;
    const dpr = window.devicePixelRatio || 1;
    const w = lane.clientWidth, h = lane.clientHeight;
    if (lane.width !== Math.round(w * dpr) || lane.height !== Math.round(h * dpr)) {
      lane.width = Math.round(w * dpr); lane.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = S.d.session || {};
    const m = mood();
    const cols = Math.floor(w / CELL), rows = Math.floor(h / CELL);
    const ground = rows - 1;
    const flagX = cols - 5;
    const x0 = 6, x1 = flagX - 6;            // the stretch Clawd's centre runs along
    const used = s.idle ? 0 : Math.min(100, s.percentUsed);
    const clawdT = x0 + elapsed(s) * (x1 - x0);
    const fireT = used >= 99.5 ? cols : x0 + (used / 100) * (x1 - x0);

    // Step towards the target one chunk per frame (stepped, never eased).
    const stepTo = (cur, target) => {
      if (cur == null || reduce) return target;
      const diff = target - cur;
      const step = Math.max(1, Math.abs(diff) / 6);
      return Math.abs(diff) <= step ? target : cur + Math.sign(diff) * step;
    };
    S.clawdX = stepTo(S.clawdX, clawdT);
    S.fireX = stepTo(S.fireX, fireT);
    const clawdX = Math.round(S.clawdX), fireX = Math.round(S.fireX);

    // Track: dashed ground ahead, scorched ground where the fire has been.
    for (let x = 0; x < flagX; x++) {
      if (!s.idle && x <= fireX) px(x, ground, 1, 1, color('--surface-2'));
      else if (x % 3 === 0) px(x, ground, 1, 1, color('--line-soft'));
    }

    // Finish flag = the reset
    px(flagX, 1, 1, rows - 1, color('--fg'));
    for (let fx = 0; fx < 4; fx++) for (let fy = 0; fy < 3; fy++) {
      px(flagX + 1 + fx, 1 + fy, 1, 1, (fx + fy) % 2 ? color('--bg') : color('--fg'));
    }

    if (!s.idle && used > 0) drawFire(fireX, rows, ground, m === 'out');

    // Clawd = the clock, running for the flag
    const left = clawdX - 5;
    const running = m !== 'idle';
    const frameA = reduce || S.frame % 2 === 0;
    let body = SPR.sleep, lift = 0;
    if (m === 'warn' || m === 'out') {
      body = SPR.panic;
      lift = !reduce && S.frame % 4 < 2 ? 1 : 0;           // hopping on hot ground
    } else if (running) {
      body = frameA ? SPR.runA : SPR.runB;
      lift = frameA ? 0 : 1;                                // running bob
    }
    if (S.hop > 0) { lift += [0, 1, 2, 1][S.hop]; S.hop--; }
    const top = ground - 6 - lift;

    // Speed lines behind him so he reads as running, not standing
    if (running && m !== 'out' && !reduce) {
      const sl = color('--muted');
      px(left - 3 - (S.frame % 2), top + 2, 2, 1, sl);
      px(left - 4 + (S.frame % 2), top + 4, 2, 1, sl);
    }
    // When he's in the flames, a dark outline keeps him readable against the orange fire.
    if (fireX >= left - 1 && !s.idle) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) sprite(body, left + dx, top + dy, { O: INK, K: INK });
    }
    sprite(body, left, top, { O: CLAWD_ORANGE, K: INK });
    if (m === 'idle' && !reduce && S.frame % 10 < 6) sprite(SPR.zz, left + 10, Math.max(0, top - 4), { X: color('--muted') });
    if ((m === 'close' || m === 'warn') && !reduce && S.frame % 4 < 3) {
      px(left + 11, top, 1, 2, CYAN);                       // sweat
      if (S.frame % 4 === 0) px(left + 12, top - 1, 1, 1, CYAN);
    }

    placeTags(clawdX, fireX, s.idle, used, cols);
  }

  function placeTags(clawdX, fireX, idle, used, cols) {
    if (root.classList.contains('mini')) return;
    const now = $('tagNow'), fire = $('tagFire');
    const laneW = laneBox.clientWidth, endW = 46;     // keep clear of the RESET tag
    const centre = (el, cx) => Math.min(laneW - endW - el.offsetWidth, Math.max(0, 2 + cx * CELL - el.offsetWidth / 2));

    const nowLeft = centre(now, clawdX);
    now.style.left = `${nowLeft}px`;

    fire.textContent = `Burned ${Math.round(used)}%`;
    fire.style.visibility = idle || used < 0.5 ? 'hidden' : 'visible';
    // Keep the fire's label on its own side of Clawd's so they never overlap.
    let fireLeft = centre(fire, Math.min(fireX, cols));
    if (fireX <= clawdX) fireLeft = Math.min(fireLeft, nowLeft - fire.offsetWidth - 8);
    else fireLeft = Math.max(fireLeft, nowLeft + now.offsetWidth + 8);
    fireLeft = Math.max(0, Math.min(fireLeft, laneW - endW - fire.offsetWidth));
    fire.style.left = `${fireLeft}px`;
    // No room on either side (e.g. the fire has reached the flag): the big number already says it.
    const overlaps = fireLeft < nowLeft + now.offsetWidth + 4 && fireLeft + fire.offsetWidth + 4 > nowLeft;
    if (overlaps || used >= 99.5) fire.style.visibility = 'hidden';
  }

  // ---------- interaction ----------

  $('sizeBtn').addEventListener('pointerdown', () => post({ type: 'nodrag' }));
  $('syncBtn').addEventListener('pointerdown', () => post({ type: 'nodrag' }));
  $('syncBtn').addEventListener('click', () => {
    $('syncBtn').classList.add('spinning');          // spins until the fresh numbers arrive
    if (native) post({ type: 'sync' });
    else setTimeout(() => update({ ...S.d, live: true, liveAt: Date.now() }), 900);
  });
  $('sizeBtn').addEventListener('click', () => {
    const next = !root.classList.contains('mini');
    if (native) post({ type: 'mini', value: next });
    else update({ ...S.d, mini: next });
  });
  laneBox.addEventListener('click', () => { S.hop = 3; });

  setInterval(() => { S.frame++; draw(); }, TICK);
  setInterval(secondTick, 1000);
  // Recalculate the mood and sentences each minute even if no new data arrives.
  setInterval(() => S.d && update(S.d), 60000);

  window.meter = { update };

  // ---------- demo data for a plain browser ----------
  if (!native) {
    const q = new URLSearchParams(location.search);
    const now = Date.now(), H = 3600e3;
    const states = {
      ok:    { percentUsed: 23, startsAt: now - 2.5 * H, resetsAt: now + 2.5 * H },
      close: { percentUsed: 46, startsAt: now - 2.5 * H, resetsAt: now + 2.5 * H },
      warn:  { percentUsed: 71, startsAt: now - 2.5 * H, resetsAt: now + 2.5 * H, emptyAt: now + 1.2 * H },
      out:   { percentUsed: 100, startsAt: now - 4 * H, resetsAt: now + 1 * H },
      idle:  { idle: true, percentUsed: 0 },
    };
    const session = { kind: 'session', known: true, idle: false, ...states[q.get('state') || 'ok'] };
    update({
      now, plan: 'Pro', syncedAt: now - 12 * 60e3, live: q.get('live') !== '0', liveAt: now - 20e3,
      theme: q.get('theme') || 'dark', mini: q.get('mini') === '1',
      session,
      weekly: { kind: 'weekly', known: true, percentUsed: 40, startsAt: now - 5 * 24 * H, resetsAt: now + 2 * 24 * H },
    });
  }
})();
