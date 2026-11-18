/*
 * Ocean background with real wave physics.
 *
 *  1. Swell: a sum of Gerstner (trochoidal) waves using the deep-water
 *     dispersion relation  omega = sqrt(g * k), so long waves travel faster
 *     than short ones and crests come out sharper than troughs.
 *  2. Ripples: a damped 2D wave equation  h_tt = c^2 * lap(h) - gamma * h_t
 *     solved on a grid with an explicit leapfrog (finite-difference) scheme.
 *     Moving the pointer pushes on the surface; a click drops a splash.
 *     Ripples spread, interfere and fade; a sponge layer at the edges
 *     absorbs them instead of bouncing them back.
 *  3. Floaters: pixel-art fish and math / ML symbols that bob with the swell,
 *     tilt with the surface and slide down the ripple slope, so waves push them.
 *
 * Usage: <script src="waves.js" defer></script>
 * Pauses when the tab is hidden. Reduced-motion users get a still frame.
 */
(function () {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');

  // ---------- look ----------
  const GAP = 22;            // px between drawn surface lines
  const STEP = 6;            // px between samples along a line
  const RGB = '30, 96, 150';

  // ---------- swell: Gerstner waves, deep-water dispersion ----------
  const G = 60;              // gravity in px/s^2, scaled so the swell reads at screen size
  const SWELL = [            // wavelength (px), amplitude (px), direction (deg), steepness Q, phase
    { L: 520, A: 9.0, dir: -8,  Q: 0.55, ph: 0.0 },
    { L: 310, A: 5.5, dir: 12,  Q: 0.60, ph: 1.7 },
    { L: 190, A: 3.0, dir: -22, Q: 0.65, ph: 4.1 },
    { L: 110, A: 1.4, dir: 30,  Q: 0.70, ph: 2.6 },
  ].map((w) => {
    const k = (2 * Math.PI) / w.L;
    const a = (w.dir * Math.PI) / 180;
    return { ...w, k, w: Math.sqrt(G * k), dx: Math.cos(a), dy: Math.sin(a) };
  });

  // ---------- ripple field: damped 2D wave equation ----------
  const CELL = 8;            // grid spacing (px)
  const C = 240;             // ripple speed (px/s)
  const GAMMA = 0.9;         // damping (1/s)
  const SUB = 1 / 120;       // physics substep (s); C*SUB/CELL = 0.25, well inside the CFL limit
  const SPONGE = 10;         // absorbing border width (cells)
  let nx = 0, ny = 0, h = null, hp = null, hn = null, sponge = null;

  let W = 0, H = 0, DPR = 1, raf = 0, lastT = 0, simT = 0, acc = 0;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const onx = nx, ony = ny, old = h;
    nx = Math.ceil(W / CELL) + 3; ny = Math.ceil(H / CELL) + 3;
    h = new Float32Array(nx * ny); hp = new Float32Array(nx * ny); hn = new Float32Array(nx * ny);
    if (old) for (let j = 0; j < Math.min(ny, ony); j++) for (let i = 0; i < Math.min(nx, onx); i++) {
      h[j * nx + i] = hp[j * nx + i] = old[j * onx + i];
    }
    sponge = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = Math.min(i, j, nx - 1 - i, ny - 1 - j);
      sponge[j * nx + i] = d >= SPONGE ? 1 : 0.86 + 0.14 * (d / SPONGE);
    }
    if (!floaters.length) placeFloaters();
    else for (const f of floaters) { f.x = Math.min(f.x, W); f.y = Math.min(f.y, H); }
    draw();
  }

  // leapfrog step:  h+ = 2h - h- + (c dt/dx)^2 lap(h) - gamma dt (h - h-)
  function stepField() {
    const r2 = (C * SUB / CELL) ** 2, damp = GAMMA * SUB;
    for (let j = 1; j < ny - 1; j++) {
      let k = j * nx + 1;
      for (let i = 1; i < nx - 1; i++, k++) {
        const lap = h[k - 1] + h[k + 1] + h[k - nx] + h[k + nx] - 4 * h[k];
        hn[k] = (2 * h[k] - hp[k] + r2 * lap - damp * (h[k] - hp[k])) * sponge[k];
      }
    }
    const t = hp; hp = h; h = hn; hn = t;
  }

  // push on the surface with a smooth Gaussian footprint
  function splat(px, py, amount, radius) {
    const ci = px / CELL + 1, cj = py / CELL + 1, R = Math.ceil(radius * 2.5);
    const i0 = Math.max(1, Math.floor(ci - R)), i1 = Math.min(nx - 2, Math.ceil(ci + R));
    const j0 = Math.max(1, Math.floor(cj - R)), j1 = Math.min(ny - 2, Math.ceil(cj + R));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d2 = ((i - ci) ** 2 + (j - cj) ** 2) / (radius * radius);
      h[j * nx + i] += amount * Math.exp(-d2);
    }
  }

  // bilinear sample of the ripple field at a pixel position
  function field(px, py) {
    let fx = px / CELL + 1, fy = py / CELL + 1;
    if (fx < 0) fx = 0; if (fy < 0) fy = 0;
    if (fx > nx - 2) fx = nx - 2; if (fy > ny - 2) fy = ny - 2;
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * nx + i;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + nx] * (1 - tx) + h[k + nx + 1] * tx) * ty;
  }

  // ---------- surface helpers (used by the floaters) ----------
  // Gerstner displacement of the surface at rest position (x0, y0)
  function swellAt(x0, y0, t) {
    let dx = 0, dy = 0;
    for (const s of SWELL) {
      const th = s.k * (s.dx * x0 + s.dy * y0 * 2.2) - s.w * t + s.ph;
      dx -= s.Q * s.A * s.dx * Math.sin(th);
      dy -= s.A * Math.cos(th);
    }
    return [dx, dy];
  }

  // ---------- floaters: pixel-art fish and symbols riding the surface ----------
  // Each sprite is a pixel map; letters index its palette, '.' is transparent.
  const SPRITES = [
    { kind: 'fish', pal: { o: '#ff8a3d', d: '#d1495b', w: '#fff', k: '#1b1b1b' }, px: [
      '.....dd......',
      '...ooooo...d.',
      '..oooooooo.dd',
      '.owkoooooodd.',
      '.ooooooooodd.',
      '..oooooooo.dd',
      '...ooooo...d.',
      '.....dd......'] },
    { kind: 'fish', pal: { o: '#2ec4b6', s: '#1b6f8a', d: '#1b6f8a', w: '#fff', k: '#1b1b1b' }, px: [
      '....ss........',
      '..osssoo....d.',
      '.wkoosooo..dd.',
      'oooosooooodd..',
      '.oooosooo..dd.',
      '..oossoo....d.',
      '....ss........'] },
    { kind: 'fish', pal: { o: '#ffd23f', d: '#ee6c4d', w: '#fff', k: '#1b1b1b' }, px: [
      '.....dd......',
      '...ooooo...d.',
      '..oooooooo.dd',
      '.owkoooooodd.',
      '.ooooooooodd.',
      '..oooooooo.dd',
      '...ooooo...d.',
      '.....dd......'] },
    { kind: 'fish', pal: { o: '#f78fb3', s: '#8e44ad', d: '#8e44ad', w: '#fff', k: '#1b1b1b' }, px: [
      '....ss........',
      '..osssoo....d.',
      '.wkoosooo..dd.',
      'oooosooooodd..',
      '.oooosooo..dd.',
      '..oossoo....d.',
      '....ss........'] },
    { kind: 'sym', pal: { x: '#3a86ff' }, px: [   // sigma
      'xxxxxxx', 'xx.....', '.xx....', '..xx...', '...xx..', '..xx...', '.xx....', 'xx.....', 'xxxxxxx'] },
    { kind: 'sym', pal: { x: '#8338ec' }, px: [   // integral
      '...xx', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..', 'xx...'] },
    { kind: 'sym', pal: { x: '#e76f51' }, px: [   // pi
      'xxxxxxxx', '.x...x..', '.x...x..', '.x...x..', '.x...x..', 'x....x..', 'x.....xx'] },
    { kind: 'sym', pal: { x: '#2a9d8f' }, px: [   // nabla
      'xxxxxxxxx', 'xx.....xx', '.x.....x.', '.xx...xx.', '..x...x..', '..xx.xx..', '...x.x...', '...xxx...'] },
    { kind: 'sym', pal: { x: '#ff006e' }, px: [   // infinity
      '.xxx...xxx.', 'x...x.x...x', 'x....x....x', 'x...x.x...x', '.xxx...xxx.'] },
    { kind: 'sym', pal: { x: '#fb8500' }, px: [   // lambda
      'xx.....', '..x....', '..x....', '...x...', '...x...', '..x.x..', '..x.x..', '.x...x.', 'x.....xx'] },
    { kind: 'sym', pal: { o: '#3a86ff', x: '#1d3557', p: '#ff006e' }, px: [   // perceptron
      'oo.......', 'oo.x.....', '....x..pp', '.....xxpp', '....x..pp', 'oo.x.....', 'oo.......'] },
    { kind: 'sym', pal: { x: '#2a9d8f', a: '#9aa5b1' }, px: [   // sigmoid
      'a......xxxx', 'a.....x....', 'a....x.....', 'a....x.....', 'a....x.....', 'a....x.....', 'a...x......', 'xxxx.aaaaaa'] },
  ];
  const PIX = 3;   // screen pixels per sprite pixel

  // pre-render each sprite (and a mirrored copy for fish swimming the other way)
  function bake(sp, flip) {
    const w = sp.px[0].length, hgt = sp.px.length;
    const c = document.createElement('canvas');
    c.width = w * PIX; c.height = hgt * PIX;
    const g = c.getContext('2d');
    sp.px.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      g.fillStyle = sp.pal[ch];
      g.fillRect((flip ? w - 1 - i : i) * PIX, j * PIX, PIX, PIX);
    }));
    return c;
  }
  SPRITES.forEach((sp) => { sp.img = bake(sp, false); sp.imgFlip = sp.kind === 'fish' ? bake(sp, true) : sp.img; });

  // seeded random so the layout is the same on every visit
  let seed = 20261118;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const floaters = [];
  function placeFloaters() {
    floaters.length = 0;
    SPRITES.forEach((sp) => {
      floaters.push({
        sp, x: rnd() * W, y: 40 + rnd() * (H - 80),
        vx: 0, vy: 0, ang: 0, spin: 0,
        swim: sp.kind === 'fish' ? (rnd() < 0.5 ? -1 : 1) * (10 + rnd() * 10) : 0,  // fish swim a little
        phase: rnd() * 6.28,
      });
    });
  }

  const PUSH = 650;     // how strongly the surface slope pushes a floater (px/s^2 per unit slope)
  const DRAG = 1.3;     // water drag (1/s)
  const CURRENT = 7;    // slow background current (px/s)

  function stepFloaters(dt, t) {
    for (const f of floaters) {
      // slope of the ripple surface: floaters slide downhill, so a splash pushes them away
      const gx = (field(f.x + CELL, f.y) - field(f.x - CELL, f.y)) / (2 * CELL);
      const gy = (field(f.x, f.y + CELL) - field(f.x, f.y - CELL)) / (2 * CELL);
      let ax = -PUSH * gx, ay = -PUSH * gy;
      // fish swim with a gentle wiggle; everything rides the current
      const target = CURRENT + f.swim;
      ax += (target - f.vx) * 0.6;
      ay += f.swim ? Math.sin(t * 0.7 + f.phase) * 4 : 0;
      f.vx += ax * dt; f.vy += ay * dt;
      const k = Math.exp(-DRAG * dt);
      f.vx = target + (f.vx - target) * k; f.vy *= k;
      f.x += f.vx * dt; f.y += f.vy * dt;
      // a hard push turns a fish around to flee with it
      if (f.swim && Math.abs(f.vx - target) > 40 && Math.sign(f.vx) !== Math.sign(f.swim)) f.swim = -f.swim;
      // spin from the local slope, settling back
      f.spin += (-(gx * 2.5) - f.ang * 2) * dt * 3; f.spin *= Math.exp(-3 * dt); f.ang += f.spin * dt;
      // wrap around the screen
      const m = 50;
      if (f.x < -m) f.x = W + m; else if (f.x > W + m) f.x = -m;
      if (f.y < -m) f.y = H + m; else if (f.y > H + m) f.y = -m;
    }
  }

  function drawFloaters(t) {
    ctx.imageSmoothingEnabled = false;
    for (const f of floaters) {
      const [dx, dy] = swellAt(f.x, f.y, t);
      const r = field(f.x, f.y);
      // tilt with the swell slope plus the ripple response
      const [dx2, dy2] = swellAt(f.x + 6, f.y, t);
      const tilt = Math.atan2(dy2 - dy, 6 + dx2 - dx) * 0.6 + f.ang + Math.sin(t * 1.3 + f.phase) * 0.05;
      const img = f.sp.kind === 'fish' && f.vx > 0 ? f.sp.imgFlip : f.sp.img;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(Math.round(f.x + dx), Math.round(f.y + dy - r));
      ctx.rotate(tilt);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
  }

  // ---------- rendering ----------
  const xs = [], ys = [], es = [];
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    const t = simT;
    for (let y0 = -30, row = 0; y0 < H + 30; y0 += GAP, row++) {
      // 1. surface points: Gerstner swell + ripple field
      let n = 0;
      for (let x0 = -STEP * 4; x0 <= W + STEP * 4; x0 += STEP, n++) {
        let x = x0, y = y0;
        for (const s of SWELL) {
          const th = s.k * (s.dx * x0 + s.dy * y0 * 2.2) - s.w * t + s.ph;
          x -= s.Q * s.A * s.dx * Math.sin(th);    // horizontal sway sharpens crests
          y -= s.A * Math.cos(th);
        }
        const r = field(x0, y0);
        xs[n] = x; ys[n] = y - r; es[n] = r;
      }
      // 2. stroke in short runs so disturbed water reads a little darker
      const base = 0.075 + 0.05 * (0.5 + 0.5 * Math.sin(row * 0.31 - t * 0.5));
      const RUN = 6;
      for (let a = 0; a < n - 1; a += RUN) {
        const b = Math.min(n - 1, a + RUN);
        let e = 0;
        for (let k = a; k <= b; k++) e = Math.max(e, Math.abs(es[k]));
        ctx.strokeStyle = `rgba(${RGB}, ${Math.min(0.42, base + e * 0.035).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(xs[a], ys[a]);
        for (let k = a + 1; k <= b; k++) ctx.lineTo(xs[k], ys[k]);
        ctx.stroke();
      }
    }
    drawFloaters(t);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0);
    lastT = now;
    simT += dt;
    acc += dt;
    while (acc >= SUB) { stepField(); acc -= SUB; }
    stepFloaters(dt, simT);
    draw();
  }
  function start() { if (!raf && !reduce) { lastT = 0; raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  // ---------- pointer coupling ----------
  // Pushing strength scales with pointer speed, like a hand dragged through water.
  let mx = null, my = null, mt = 0;
  window.addEventListener('pointermove', (e) => {
    if (reduce) return;
    const now = performance.now();
    if (mx !== null) {
      const dtm = Math.max(8, now - mt);
      const dist = Math.hypot(e.clientX - mx, e.clientY - my);
      const speed = dist / dtm;                          // px per ms
      const amt = Math.min(5, speed * 2.2);
      const steps = Math.max(1, Math.ceil(dist / (CELL * 1.5)));   // fill in fast strokes
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        splat(mx + (e.clientX - mx) * f, my + (e.clientY - my) * f, amt / steps, 1.6);
      }
    }
    mx = e.clientX; my = e.clientY; mt = now;
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (!reduce) splat(e.clientX, e.clientY, 14, 2.4);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { mx = my = null; });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
})();
