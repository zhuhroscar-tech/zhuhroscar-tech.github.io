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
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0);
    lastT = now;
    simT += dt;
    acc += dt;
    while (acc >= SUB) { stepField(); acc -= SUB; }
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
