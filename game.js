(() => {
  'use strict';
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1;

  /* ================= BOARD ================= */
  // portrait: the grid fills the screen edge to edge; landscape: a square as tall as the screen.
  // column counts are odd so every lane runs down the middle of a cell
  const MIN_COLS = 21, MIN_PLAY_ROWS = 24, EDGE = 8, LANE_GAP = 6;
  // lane lengths are the same on every screen: ~5 average rolls for an outer kill, 4 for the middle
  const OUTER_DIST = 16, MID_DIST = 12;
  const FIT_DIST = 18;                                  // landscape squares are sized so this many span the screen
  let COLS = 21, ROWS = 31;
  let LANE_C = [4.5, 10.5, 16.5];                       // lane centres, in cells
  // nose rows: the middle rockets sit two squares further forward
  const NOSE = { blue: [], red: [] };
  const DIR = { blue: 1, red: -1 };                     // which way each side fires
  const WINS = 2;
  const VOLLEY_MS = 70;
  const laneDist = l => NOSE.red[l] - NOSE.blue[l];
  const other = p => (p === 'red' ? 'blue' : 'red');

  // palettes: blue is the MONOLITH ship, red is its mirror
  const PAL = {
    blue: { H: '#cbe9fb', L: '#9fd0ef', M: '#6ea9d4', S: '#3d6f9c', D: '#0b1c33', E: '#3d6f9c', W: '#8ee6ff' },
    red: { H: '#ffd6dc', L: '#f4a3ad', M: '#d9707e', S: '#9c3d4c', D: '#2a0b12', E: '#9c3d4c', W: '#ff5c8a' }
  };
  const ACC = { blue: '#8ee6ff', red: '#ff5c8a' };
  const RIPPLE_MS = 800;
  const BLAST = ['#ff8a30', '#ffd86a', '#ff5cc8', '#ffffff'];   // explosion sparks
  const HOT = '#fff6c8', COOL_MS = 450;                         // fresh laser blocks land white-yellow and cool
  const DANGER = { red: '#ff5c8a', blue: '#86c5ec' };            // cockpit warning, each side in its own colours
  const FLAME = { blue: ['#4fd0ff', '#e6fbff'], red: ['#ec7a8e', '#ffc4ce'] };   // engine wash: [outer, hot core]; red's are a richer take on the hull pinks

  // 17x16 sprite from MONOLITH: H hull-lit, L hull, M wing, S shadow, D cockpit, W weapon-tint
  const SHIP_SPR = [
    '........L........',
    '.......WLW.......',
    '.......HLH.......',
    '...WW.HLLLH.WW...',
    '...MM.HLLLH.MM...',
    '...MMHLDDDLHMM...',
    '...MMHLDDDLHMM...',
    '...MMHLDDDLHMM...',
    '...MMHLLLLLHMM...',
    '...MMHLLLLLHMM...',
    '...MMHLLLLLHMM...',
    '...SSSLLLLLSSS...',
    '....S.LLLLL.S....',
    '.....LLLLLLL.....',
    '.....SSSSSSS.....',
    '......EE.EE......'
  ];
  // muzzles in sprite coords [row, col]: nose pair, then the four fin guns
  const MUZZLES = [[1, 7], [1, 9], [3, 3], [3, 4], [3, 12], [3, 13]];

  /* ================= PIXEL ICONS ================= */
  const PIPS = { 1: [[4, 4]], 2: [[2, 2], [6, 6]], 3: [[2, 2], [4, 4], [6, 6]], 4: [[2, 2], [6, 2], [2, 6], [6, 6]],
    5: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]], 6: [[2, 2], [6, 2], [2, 4], [6, 4], [2, 6], [6, 6]] };
  const REPLAY = [
    '...XXX.X.',
    '.XX...XX.',
    '.X...XXX.',
    'X........',
    'X.......X',
    'X.......X',
    '.X.....X.',
    '.XX...XX.',
    '...XXX...'
  ];
  const PERSON = ['.XXX.', '.XXX.', '..X..', 'XXXXX', '.XXX.', '.X.X.', '.X.X.'];
  const ROBOT = ['..X..', 'XXXXX', 'X.X.X', 'XXXXX', '.XXX.', 'XXXXX', '.X.X.'];
  const SPK_ON = ['...X.....', '..XX..X..', 'XXXX...X.', 'XXXX...X.', 'XXXX...X.', '..XX..X..', '...X.....'];
  const SPK_OFF = ['...X.....', '..XX.....', 'XXXX.X.X.', 'XXXX..X..', 'XXXX.X.X.', '..XX.....', '...X.....'];

  /* ================= SOUND (from MONOLITH) ================= */
  let ac = null, master = null, noiseBuf = null, muted = false;
  function initAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain(); master.gain.value = .32;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .12;
    master.connect(comp); comp.connect(ac.destination);
    const n = ac.sampleRate * .5;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  function tone({ f = 440, f2 = f, type = 'square', dur = .08, gain = .2, delay = 0 }) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  function noise({ dur = .1, gain = .2, f = 1400, f2 = f, q = 1, delay = 0 }) {
    if (!ac || muted || !noiseBuf) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, f2), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + .02);
  }
  const sfxFire = () => tone({ f: 960, f2: 280, type: 'square', dur: .06, gain: .13 });
  const sfxTick = () => noise({ f: 3200, f2: 1400, dur: .035, gain: .06, q: 1.4 });
  const sfxDie = () => tone({ f: 300 + Math.random() * 200, f2: 120, type: 'square', dur: .03, gain: .06 });
  function sfxBlast() {
    noise({ f: 900, f2: 120, dur: .3, gain: .2, q: .5 });
    tone({ f: 150, f2: 38, type: 'sine', dur: .32, gain: .16 });
    for (let i = 0; i < 4; i++) noise({ f: 1500, f2: 260, dur: .09, gain: .1, q: .9, delay: .05 + i * .06 });
  }
  function sfxOver() {
    [0, .14, .28, .5].forEach((d, i) => tone({ f: 420 * (i + 1) / 2, f2: 140 * (i + 1), type: 'square', dur: .3, gain: .14, delay: d }));
  }

  /* ================= LAYOUT ================= */
  const ICON_PAD = 22;
  let cell = 20, PX = 6, bx = 0, by = 0, die = { x: 0, y: 0, u: 6 }, iconU = 3;
  let stars = [];
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    layout(!S || !S.trail.red.concat(S.trail.blue).some(Boolean));
    makeStars(); makeNebula();
  }
  function layout(fresh) {
    iconU = Math.max(2, Math.round(Math.min(W, H) / 160));
    const top = ICON_PAD + 7 * iconU + 8, bottom = Math.max(110, Math.round(H * .15));
    const odd = n => (n % 2 ? n : n - 1);
    const u = Math.max(4, Math.round(Math.min(bottom * .55, 81) / 9));
    die = { u, x: Math.round(W / 2 - u * 4.5), y: Math.round(H - bottom + (bottom - u * 9) / 2) };
    const fwd = (OUTER_DIST - MID_DIST) / 2;
    // rows a formation can use in a grid of n rows of size c (hull + engine wash ≈ 20 sprite px);
    // red's middle rocket, `fwd` rows ahead of its outer pair, has to stay clear of the die
    const room = (n, c) => {
      const top0 = Math.round((H - c * n) / 2), reach = Math.ceil(20 * PX / c);
      return { reach, redOuterMax: Math.min(n - reach, Math.floor((die.y - 6 - 20 * PX - top0) / c) + fwd) };
    };
    // sprite pixels snap to device pixels, so they can be fractional CSS px and stay crisp
    const setPX = c => { PX = Math.max(1, Math.round(c * .15 * DPR)) / DPR; };

    let gap = LANE_GAP;
    if (W >= H) {
      // landscape: a square grid. Rockets keep their on-screen size while the squares grow
      // until the 18-square lanes reach from the top of the screen to the bottom
      const base = Math.max(6, Math.floor((H - top - bottom) / MIN_PLAY_ROWS));
      setPX(base);
      if (fresh) {
        ROWS = odd(Math.floor((H - 2 * EDGE) / base)); cell = base;
        for (let n = ROWS - 2; n >= 9; n -= 2) {
          const c = Math.floor((H - 2 * EDGE) / n), r = room(n, c);
          if (r.redOuterMax - r.reach < FIT_DIST) break;
          ROWS = n; cell = c;
        }
        COLS = ROWS;
      } else {
        cell = Math.max(6, Math.floor((H - 2 * EDGE) / ROWS));
      }
      // keep the lanes the same distance apart on screen as with the base squares
      gap = Math.max(4, Math.round(LANE_GAP * base / cell));
    } else {
      // portrait: the grid fills the screen; the fixed-length lanes sit centred in it
      if (fresh) {
        cell = Math.max(6, Math.floor(Math.min((W - 2 * EDGE) / MIN_COLS, (H - top - bottom) / MIN_PLAY_ROWS)));
        COLS = odd(Math.floor((W - 2 * EDGE) / cell));
        ROWS = Math.floor((H - 2 * EDGE) / cell);
      } else {
        // mid-game resize: keep the same squares, just rescale them
        cell = Math.max(6, Math.floor(Math.min((W - 2 * EDGE) / COLS, (H - 2 * EDGE) / ROWS)));
      }
      setPX(cell);
    }
    bx = Math.round((W - cell * COLS) / 2);
    by = Math.round((H - cell * ROWS) / 2);
    if (fresh) {
      LANE_C = [COLS / 2 - gap, COLS / 2, COLS / 2 + gap];
      const { reach, redOuterMax } = room(ROWS, cell);
      const blueOuter = reach + Math.max(0, Math.floor((redOuterMax - reach - OUTER_DIST) / 2));
      const redOuter = Math.min(redOuterMax, blueOuter + OUTER_DIST);
      NOSE.blue = [blueOuter, blueOuter + fwd, blueOuter];
      NOSE.red = [redOuter, redOuter - fwd, redOuter];
    }
  }
  function makeStars() {
    stars = [];
    const n = Math.round((W * H) / 5200);
    for (let i = 0; i < n; i++) {
      const d = Math.random();
      const k = Math.random();
      const col = k < .07 ? '#ffd59a' : k < .12 ? '#ffb8cc' : d > .75 ? '#cfe6ff' : '#7f9fd0';   // a few warm amber and soft pink
      stars.push({ x: Math.random() * W, y: Math.random() * H, z: d, s: Math.round(d * 1.7 + .3), v: d * 6 + 1, tw: Math.random() * 6.28, col });
    }
  }
  // a few small blocky clouds: 4-6 faint squares on a tiny lattice with gaps between them, one or two in bright white,
  // some of them rounded (a slightly bigger square with its corner pixels knocked off)
  let nebula = [];
  // now and then a cluster glints and throws off a little pixel shooting star
  let meteors = [], meteorT = 4000;
  const nebOffset = n => [Math.round(Math.sin(clock / 45000 + n.ph) * n.q * 1.5), Math.round(Math.cos(clock / 60000 + n.ph) * n.q)];
  function launchMeteor() {
    const n = nebula[Math.floor(Math.random() * nebula.length)];
    if (!n) return;
    const [dx, dy] = nebOffset(n);
    const a = Math.floor(Math.random() * 4) * Math.PI / 2, v = .07 + Math.random() * .04;   // straight up, down, left or right; px per ms
    meteors.push({ x: n.cx + dx, y: n.cy + dy, vx: Math.round(Math.cos(a)) * v, vy: Math.round(Math.sin(a)) * v, t: 0, life: 1800 + Math.random() * 900 });
    n.glint = 1;
  }
  function makeNebula() {
    nebula = [];
    const u = Math.max(1, Math.round(Math.min(W, H) / 300) - 1);   // corner cut
    const q = 3 * u, qr = 4 * u, step = q;                  // neighbours touch or overlap, no gaps
    const spots = [[.22, .2], [.78, .55], [.35, .85]];
    for (const [fx, fy] of spots) {
      const cx = Math.round((fx + (Math.random() - .5) * .15) * W), cy = Math.round((fy + (Math.random() - .5) * .1) * H);
      // grown outward from one point: each new dot sticks to a random earlier one, leaning one way,
      // with a pixel of jitter, so no two clusters come out symmetrical
      const lean = Math.random() * 6.28, n = 4 + Math.floor(Math.random() * 3), bright = 1 + Math.floor(Math.random() * 2);
      const pts = [[0, 0]];
      while (pts.length < n) {
        const [bx0, by0] = pts[Math.floor(Math.random() * pts.length)];
        const a = lean + (Math.random() - .5) * 2.6;
        const d = step * (.8 + Math.random() * .4);
        pts.push([Math.round(bx0 + Math.cos(a) * d + (Math.random() - .5) * 2 * u), Math.round(by0 + Math.sin(a) * d + (Math.random() - .5) * 2 * u)]);
      }
      const sq = pts.map(([ox, oy], i) => {
        const round = Math.random() < .4, sz = round ? qr : q;
        return {
          x: Math.round(cx + ox - sz / 2), y: Math.round(cy + oy - sz / 2), s: sz, cut: round ? u : 0,
          a: i < bright ? .35 + Math.random() * .25 : .08 + Math.random() * .08
        };
      });
      sq.reverse();                                          // centre drawn last, on top
      nebula.push({ sq, ph: Math.random() * 6.28, q, cx, cy, glint: 0 });
    }
  }

  addEventListener('resize', resize);

  const laneX = l => Math.round(bx + LANE_C[l] * cell);
  const noseY = (p, l) => by + NOSE[p][l] * cell;
  const shipLeft = l => laneX(l) - Math.round(8.5 * PX);
  // centre of sprite pixel (r, c) on screen; blue is drawn flipped, nose down
  function spritePt(p, l, r, c) {
    return { x: shipLeft(l) + (c + .5) * PX, y: p === 'red' ? noseY(p, l) + (r + .5) * PX : noseY(p, l) - (r + .5) * PX };
  }
  function shipBox(p, l) {
    return { x: shipLeft(l), y: p === 'red' ? noseY(p, l) : noseY(p, l) - 16 * PX, w: 17 * PX, h: 16 * PX };
  }

  /* ================= STATE ================= */
  let mode = 'cpu';             // 'cpu': you are red, the computer is blue; 'pvp': pass and play
  let S;                        // game state
  let slugs = [], sparks = [], debris = [], rings = [], shake = 0, flash = 0, clock = 0;

  function newGame() {
    S = {
      turn: 'red', roll: null, face: null, rollT: 0, faceT: 0,
      trail: { red: [0, 0, 0], blue: [0, 0, 0] },
      alive: { red: [true, true, true], blue: [true, true, true] },
      kills: { red: 0, blue: 0 },
      shot: null, winner: null, cpuTimer: null,
      cleared: [null, null, null], // per lane: when its lasers started fading after a kill
      landT: { red: [[], [], []], blue: [[], [], []] }   // when each laser block landed, for its cooling glow
    };
    slugs = []; sparks = []; debris = []; rings = []; shake = 0; flash = 0;
  }

  const isCpu = p => mode === 'cpu' && p === 'blue';
  const validLanes = p => [0, 1, 2].filter(l => S.alive[p][l] && S.alive[other(p)][l]);
  const canRoll = () => !S.winner && !S.roll && !S.rollT && !S.shot && !isCpu(S.turn);
  const canFire = () => !S.winner && S.roll && !S.shot && !isCpu(S.turn);

  /* ================= TURN FLOW ================= */
  function roll() {
    if (S.winner || S.roll || S.rollT || S.shot) return;
    S.rollT = 520; S.faceT = 0;
  }

  function fire(l) {
    const p = S.turn;
    if (!S.roll || S.shot || !validLanes(p).includes(l)) return;
    const n = Math.min(S.roll, laneDist(l) - S.trail[p][l]);
    S.shot = { p, l, start: S.trail[p][l], sent: 0, left: n, timer: 0, inflight: 0, hit: false };
  }

  function volley() {
    const { p, l } = S.shot;
    const dir = DIR[p], col = ACC[p];
    const speed = cell / 9;                               // px per ms
    const goal = S.shot.start + (++S.shot.sent);
    const nx = laneX(l), ny = noseY(p, l);
    // the round that actually extends the line
    slugs.push({ x: nx, y: ny, vx: 0, vy: dir * speed, col, real: true, p, l, goal, goalY: ny + dir * (goal - .5) * cell });
    S.shot.inflight++;
    // the rest of the guns fire too, MONOLITH-style, and burn out
    MUZZLES.forEach(([r, c]) => {
      const m = spritePt(p, l, r, c);
      const spread = ((c - 8) / 8) * .06 + (Math.random() - .5) * .015;
      slugs.push({ x: m.x, y: m.y, vx: Math.sin(spread) * speed, vy: dir * speed * Math.cos(spread), col, life: 160 + Math.random() * 60, max: 220 });
      sparks.push({ x: m.x, y: m.y, vx: (Math.random() - .5) * 1.2, vy: -dir * 1.6, l: .7, c: col });
    });
    shake = Math.min(shake + .9, 12);
    sfxFire();
  }

  function land(s) {
    S.trail[s.p][s.l] = s.goal;
    S.landT[s.p][s.l][s.goal] = clock;
    S.shot.inflight--;
    for (let i = 0; i < 3; i++) sparks.push({ x: s.x, y: s.goalY, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, l: 1, c: s.col });
    // lasers never overlap: a block pushed into the enemy's streak knocks one block off its tip
    const o = other(s.p), over = S.trail[s.p][s.l] + S.trail[o][s.l] - laneDist(s.l);
    if (over > 0) {
      S.trail[o][s.l] = Math.max(0, S.trail[o][s.l] - over);
      for (let i = 0; i < 4; i++) sparks.push({ x: s.x, y: s.goalY, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, l: 1, c: ACC[o] });
    }
    sfxTick();
    if (s.goal >= laneDist(s.l)) destroy(other(s.p), s.l, s.p);
  }

  function destroy(p, l, by_) {
    S.alive[p][l] = false;
    S.cleared[l] = clock;                               // both lasers in this lane fade away
    S.kills[by_]++;
    S.shot.hit = true;
    explode(p, l);
  }

  // the blast itself: pixel debris, sparks, ripples, shake, flash and sound (no change to the game)
  function explode(p, l) {
    const pal = PAL[p];
    const box = shipBox(p, l), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    // every hull pixel flies straight out from the middle of the rocket, so the debris spreads in a rough circle
    for (let r = 0; r < SHIP_SPR.length; r++) for (let c = 0; c < 17; c++) {
      const ch = SHIP_SPR[r][c]; if (ch === '.') continue;
      const pt = spritePt(p, l, r, c);
      const a = Math.atan2(pt.y - cy, pt.x - cx) + (Math.random() - .5) * .9, v = .6 + Math.random() * 1.2;
      debris.push({ x: pt.x, y: pt.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, col: pal[ch], s: PX });
    }
    for (let i = 0; i < 36; i++) sparks.push({ x: cx, y: cy, vx: (Math.random() - .5) * 9, vy: (Math.random() - .5) * 9, l: 1, c: BLAST[i % BLAST.length] });
    // concentric ripples in the downed rocket's colour: all start together, nested one inside the other,
    // and spread out as a set, the outer ones fainter
    for (let k = 0; k < 2; k++) rings.push({ x: cx, y: cy, r0: cell * (.4 + k * .8), r: 0, t: 0, a: 1 - k * .35, col: ACC[p] });
    shake = Math.min(shake + 12, 18); flash = 1;
    sfxBlast();
  }

  function endShot() {
    const { p, hit } = S.shot;
    S.shot = null;
    if (S.kills[p] >= WINS) {
      S.winner = p; S.roll = null;
      setTimeout(sfxOver, 500);
      return;
    }
    S.cpuTimer = setTimeout(() => {
      S.turn = other(p); S.roll = null; S.face = null;
      if (isCpu(S.turn)) cpuTurn();
    }, hit ? 900 : 350);
  }

  function cpuTurn() {
    S.cpuTimer = setTimeout(() => {
      roll();
      S.cpuTimer = setTimeout(() => fire(cpuChoice()), 520 + 650);
    }, 650);
  }
  function cpuChoice() {
    const p = S.turn, lanes = validLanes(p);
    const rem = l => laneDist(l) - S.trail[p][l];
    const kill = lanes.find(l => rem(l) <= S.roll);
    if (kill !== undefined) return kill;
    const sorted = lanes.slice().sort((a, b) => rem(a) - rem(b));
    return Math.random() < .8 ? sorted[0] : sorted[Math.floor(Math.random() * sorted.length)];
  }

  function start() {
    if (S && S.cpuTimer) clearTimeout(S.cpuTimer);
    newGame();
    layout(true);
  }

  /* ================= UPDATE ================= */
  function step(dt) {
    const f = dt / 16.67;
    clock += dt;

    if (S.rollT > 0) {
      S.rollT -= dt; S.faceT -= dt;
      if (S.faceT <= 0) { S.face = 1 + Math.floor(Math.random() * 6); S.faceT = 60; sfxDie(); }
      if (S.rollT <= 0) { S.rollT = 0; S.roll = S.face = 1 + Math.floor(Math.random() * 6); sfxDie(); }
    }

    if (S.shot) {
      S.shot.timer -= dt;
      if (S.shot.left > 0 && S.shot.timer <= 0) { volley(); S.shot.left--; S.shot.timer = VOLLEY_MS; }
    }

    for (let i = slugs.length - 1; i >= 0; i--) {
      const s = slugs[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.real) {
        if (DIR[s.p] * (s.y - s.goalY) >= 0) { slugs.splice(i, 1); land(s); }
      } else if ((s.life -= dt) <= 0) slugs.splice(i, 1);
    }
    if (S.shot && S.shot.left === 0 && S.shot.inflight === 0) endShot();

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx * f; s.y += s.vy * f; s.vx *= .97; s.vy *= .97; s.l -= .04 * f;
      if (s.l <= 0) sparks.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.t += dt;
      const k = Math.min(1, g.t / RIPPLE_MS);
      g.r = g.r0 + k * cell * 1.6;                       // keeps drifting outward at a steady pace
      g.l = Math.pow(1 - k, 1.5);                         // while fading away
      if (k >= 1) rings.splice(i, 1);
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.x += d.vx * f; d.y += d.vy * f; d.vx *= .96; d.vy *= .96; d.l -= .016 * f;
      if (d.l <= 0) debris.splice(i, 1);
    }
    // the winner's surviving rockets keep popping fireworks
    if (S.winner && Math.random() < .08 * f) {
      const ls = [0, 1, 2].filter(l => S.alive[S.winner][l]);
      const l = ls[Math.floor(Math.random() * ls.length)], b = shipBox(S.winner, l);
      for (let i = 0; i < 10; i++) sparks.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, l: 1, c: ACC[S.winner] });
    }
    for (const s of stars) { s.y += s.v * dt / 1000; if (s.y > H) { s.y = -2; s.x = Math.random() * W; } }
    if ((meteorT -= dt) <= 0) { launchMeteor(); meteorT = 6000 + Math.random() * 9000; }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.t >= m.life) meteors.splice(i, 1);
    }
    for (const n of nebula) n.glint *= Math.pow(.93, f);
    shake *= Math.pow(.86, f); flash *= Math.pow(.85, f);
  }

  /* ================= DRAW ================= */
  const snap = v => Math.round(v * DPR) / DPR;
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function mix(a, b, t) {
    const A = hexRGB(a), B = hexRGB(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  }
  // how close the enemy laser in this lane is to a kill: 0 = safe (7+ squares away) .. 1 = next square hits
  let dangerPreview = false;   // E key: show the warning on red's left and blue's middle rocket
  function danger(p, l) {
    // preview sweeps slowly from a gentle glow to the urgent pulse
    if (dangerPreview && ((p === 'red' && l === 0) || (p === 'blue' && l === 1))) return .2 + .8 * (.5 + .5 * Math.sin(clock / 1500));
    const o = other(p);
    if (S.winner || !S.alive[o][l]) return 0;
    const rem = laneDist(l) - S.trail[o][l];
    return rem <= 6 ? (7 - rem) / 6 : 0;
  }
  function px(x, y, w, h) { ctx.fillRect(snap(x), snap(y), snap(w), snap(h)); }
  function bitmap(rows, x, y, u, col) {
    ctx.fillStyle = col;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++)
      if (rows[r][c] === 'X') px(x + c * u, y + r * u, u, u);
  }

  function drawShip(p, l) {
    const pal = PAL[p], ox = shipLeft(l), ny = noseY(p, l), red = p === 'red';
    // cockpit pulses a warning colour when an enemy laser is one roll away, faster the closer it gets
    const dz = danger(p, l);
    const cockpit = dz ? mix(pal.D, DANGER[p], (.5 + .5 * Math.sin(clock / (dz > .6 ? 70 : 140))) * (.45 + .55 * dz)) : pal.D;
    // engine wash, whole pixels, directly under the two inline nozzles
    [6, 9].forEach(c => {
      const h = PX * (2 + Math.floor(Math.random() * 3));
      const y0 = red ? ny + 16 * PX : ny - 16 * PX - h;
      ctx.fillStyle = FLAME[p][0]; px(ox + c * PX, y0, 2 * PX, h);
      const h2 = Math.max(PX, Math.round(h * .55 / PX) * PX);
      ctx.fillStyle = FLAME[p][1]; px(ox + c * PX + PX / 2, red ? y0 : y0 + h - h2, PX, h2);
    });
    for (let r = 0; r < SHIP_SPR.length; r++) {
      const row = SHIP_SPR[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]; if (ch === '.') continue;
        ctx.fillStyle = ch === 'D' ? cockpit : pal[ch];
        px(ox + c * PX, red ? ny + r * PX : ny - (r + 1) * PX, PX, PX);
      }
    }
  }

  function drawBrackets(p, l, col) {
    const b = shipBox(p, l), m = PX * 2, len = PX * 3, t = PX;
    const x0 = b.x - m, y0 = b.y - m, x1 = b.x + b.w + m, y1 = b.y + b.h + m;
    ctx.fillStyle = col;
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      px(sx > 0 ? x : x - len, sy > 0 ? y : y - t, len, t);
      px(sx > 0 ? x : x - t, sy > 0 ? y : y - len, t, len);
    }
  }

  // one laser block in the middle of the i-th cell along a lane; the trail and the roll preview share it
  function laneSquare(p, l, i) {
    const tw = Math.max(2, PX) * 2;
    px(laneX(l) - tw / 2, noseY(p, l) + DIR[p] * (i - .5) * cell - tw / 2, tw, tw);
  }

  const LASER_FADE_MS = 700;
  function drawTrail(p, l) {
    const len = S.trail[p][l]; if (!len) return;
    const fade = S.cleared[l] === null ? 1 : 1 - (clock - S.cleared[l]) / LASER_FADE_MS;
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    ctx.shadowBlur = 8;
    for (let i = 1; i <= len; i++) {
      // fresh blocks land white-hot and cool to the player's colour
      const t = S.landT[p][l][i], heat = t === undefined ? 0 : Math.max(0, 1 - (clock - t) / COOL_MS) ** 2;   // a quick laser flash
      ctx.fillStyle = heat > 0 ? mix(ACC[p], HOT, heat) : ACC[p];
      ctx.shadowColor = heat > .3 ? HOT : ACC[p];
      laneSquare(p, l, i);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function drawDie() {
    const { x, y, u } = die;
    const p = S.winner || S.turn;
    const bob = canRoll() && Math.floor(clock / 380) % 2 ? -u : 0;
    const jit = S.rollT > 0 ? [(Math.random() - .5) * u * 2, (Math.random() - .5) * u * 2] : [0, 0];
    const dx = x + jit[0], dy = y + jit[1] + bob;
    const dim = isCpu(S.turn) && !S.winner;
    ctx.globalAlpha = dim ? .55 : 1;
    // shadow block, then face with the corners knocked off
    ctx.fillStyle = PAL[p].S;
    px(dx + u, dy + u, 7 * u, 9 * u); px(dx, dy + 2 * u, 9 * u, 6 * u);
    ctx.fillStyle = ACC[p];
    px(dx + u, dy, 7 * u, 8 * u); px(dx, dy + u, 9 * u, 6 * u);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; px(dx + u, dy, 7 * u, u / 2);
    if (S.winner) bitmap(REPLAY, dx, dy - u / 2, u, '#04030a');
    else if (S.face) { ctx.fillStyle = '#04030a'; for (const [c, r] of PIPS[S.face]) px(dx + c * u, dy + r * u - u / 2, u, u); }
    else { ctx.fillStyle = '#04030a'; px(dx + 4 * u, dy + 3.5 * u, u, u); }
    ctx.globalAlpha = 1;
  }

  // top corners: sound toggle and mode toggle
  const soundRect = () => ({ x: ICON_PAD, y: ICON_PAD, w: 9 * iconU, h: 7 * iconU });
  const modeRect = () => ({ x: W - ICON_PAD - 11 * iconU, y: ICON_PAD, w: 11 * iconU, h: 7 * iconU });
  function drawIcons() {
    const sr = soundRect(), mr = modeRect();
    bitmap(muted ? SPK_OFF : SPK_ON, sr.x, sr.y, iconU, '#5f7fae');
    bitmap(PERSON, mr.x, mr.y, iconU, ACC.red);
    bitmap(mode === 'cpu' ? ROBOT : PERSON, mr.x + 6 * iconU, mr.y, iconU, ACC.blue);
  }

  function draw() {
    ctx.fillStyle = '#04030a'; ctx.fillRect(0, 0, W, H);
    for (const n of nebula) {
      // slow drift, a pixel at a time
      const [dx, dy] = nebOffset(n);
      for (const b of n.sq) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, b.a + n.glint * .5)})`;
        const x = b.x + dx, y = b.y + dy, k = b.cut;
        if (k) { px(x + k, y, b.s - 2 * k, b.s); px(x, y + k, k, b.s - 2 * k); px(x + b.s - k, y + k, k, b.s - 2 * k); }
        else px(x, y, b.s, b.s);
      }
    }
    // shooting stars: tiny same-size pixels snapped to a pixel grid, so the trail steps like a pixel line,
    // dimming in a few hard steps instead of tapering
    const MP = 2, STEPS = [.95, .6, .6, .35, .35, .35, .15, .15];
    for (const m of meteors) {
      const fade = Math.min(1, m.t / 120) * Math.min(1, (m.life - m.t) / 300), sp = Math.hypot(m.vx, m.vy);
      const seen = new Set();
      for (let k = 0; k < STEPS.length; k++) {
        const d = k * MP / sp;
        const gx = Math.round((m.x - m.vx * d) / MP) * MP, gy = Math.round((m.y - m.vy * d) / MP) * MP;
        if (seen.has(gx + ',' + gy)) continue;
        seen.add(gx + ',' + gy);
        ctx.fillStyle = `rgba(255,255,255,${(fade * STEPS[k]).toFixed(3)})`;
        px(gx, gy, MP, MP);
      }
    }
    for (const s of stars) {
      // the brightest stars twinkle a little more
      const tw = Math.sin(clock / 600 + s.tw);
      ctx.globalAlpha = (.25 + s.z * .75) * (s.z > .85 ? .65 + .35 * tw : .75 + .25 * tw);
      ctx.fillStyle = s.col;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    if (shake > .1) ctx.translate(Math.round((Math.random() - .5) * shake), Math.round((Math.random() - .5) * shake));

    // faint grid, inner lines only (no outer border)
    ctx.fillStyle = 'rgba(170,176,190,.08)';
    for (let c = 1; c < COLS; c++) ctx.fillRect(bx + c * cell, by, 1, ROWS * cell);
    for (let r = 1; r < ROWS; r++) ctx.fillRect(bx, by + r * cell, COLS * cell, 1);

    for (const p of ['blue', 'red']) for (let l = 0; l < 3; l++) drawTrail(p, l);

    // where this roll would reach
    const lanes = canFire() ? validLanes(S.turn) : [];
    if (lanes.length && Math.floor(clock / 260) % 2) {
      const p = S.turn;
      ctx.fillStyle = ACC[p]; ctx.globalAlpha = .5;
      for (const l of lanes) {
        const to = Math.min(S.trail[p][l] + S.roll, laneDist(l));
        for (let i = S.trail[p][l] + 1; i <= to; i++) laneSquare(p, l, i);
      }
      ctx.globalAlpha = 1;
    }

    for (const p of ['blue', 'red']) for (let l = 0; l < 3; l++) if (S.alive[p][l]) drawShip(p, l);
    if (lanes.length && Math.floor(clock / 300) % 3) for (const l of lanes) drawBrackets(S.turn, l, ACC[S.turn]);

    for (const d of debris) { ctx.globalAlpha = Math.max(0, d.l); ctx.fillStyle = d.col; px(d.x - d.s / 2, d.y - d.s / 2, d.s, d.s); }
    ctx.globalAlpha = 1;

    // square slugs, even pixel sizes, glowing
    const q = Math.max(4, Math.round(PX * 1.2 / 2) * 2);
    for (const b of slugs) {
      ctx.globalAlpha = b.real ? 1 : Math.max(0, b.life / b.max);
      ctx.fillStyle = b.col; ctx.shadowColor = b.col; ctx.shadowBlur = 10;
      px(b.x - q / 2, b.y - q / 2, q, q);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    for (const s of sparks) { ctx.globalAlpha = Math.max(0, s.l); ctx.fillStyle = s.c; px(s.x, s.y, 3, 3); }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ripples sit outside the screen shake so they only ever move outward
    for (const g of rings) {
      ctx.globalAlpha = Math.max(0, g.l) * g.a; ctx.fillStyle = g.col;
      const d = PX * 2, u = PX * 2.7, R = Math.max(1, Math.round(g.r / u));
      const seen = new Set();
      for (let i = 0, n = Math.max(8, R * 8); i < n; i++) {
        const a = i / n * 6.28, gx = Math.round(Math.cos(a) * R), gy = Math.round(Math.sin(a) * R);
        if (seen.has(gx * 999 + gy)) continue;
        seen.add(gx * 999 + gy);
        px(g.x + gx * u - d / 2, g.y + gy * u - d / 2, d, d);
      }
    }
    ctx.globalAlpha = 1;

    drawDie();
    drawIcons();
    if (flash > .01) { ctx.fillStyle = `rgba(255,220,180,${flash * .25})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ================= INPUT ================= */
  const inside = (x, y, r, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    initAudio();
    const x = e.clientX, y = e.clientY;
    if (inside(x, y, soundRect(), 10)) { muted = !muted; return; }
    if (inside(x, y, modeRect(), 10)) { mode = mode === 'cpu' ? 'pvp' : 'cpu'; start(); return; }
    if (inside(x, y, { x: die.x, y: die.y, w: die.u * 9, h: die.u * 9 }, 16)) {
      if (S.winner) start(); else if (canRoll()) roll();
      return;
    }
    if (canFire()) {
      // tap a rocket, or anywhere in its lane
      for (const l of validLanes(S.turn)) {
        if (Math.abs(x - laneX(l)) <= cell * 3.2 && y >= by && y < die.y) { fire(l); return; }
      }
    }
  });
  addEventListener('keydown', e => {
    initAudio();
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (S.winner) start(); else if (canRoll()) roll(); }
    if (['1', '2', '3'].includes(e.key) && canFire()) fire(+e.key - 1);
    // E: toggle a preview of the danger glow; X: replay the explosion on blue's middle rocket
    if (e.key === 'e' || e.key === 'E') dangerPreview = !dangerPreview;
    if (e.key === 'x' || e.key === 'X') explode('blue', 1);
  });

  /* ================= LOOP ================= */
  // rAF drives it; the interval keeps it ticking where rAF is throttled
  let last = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(100, now - last); last = now;
    step(dt); draw();
  }
  function raf() { tick(); requestAnimationFrame(raf); }
  setInterval(() => { if (performance.now() - last > 100) tick(); }, 50);

  resize(); start(); requestAnimationFrame(raf);
})();
