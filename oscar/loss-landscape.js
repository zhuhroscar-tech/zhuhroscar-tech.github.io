/*
 * Loss landscape — interactive steepest descent with exact line search.
 * Usage:  <div class="ll"></div>  <script src="loss-landscape.js" defer></script>
 * Colors: set --ll-bg, --ll-fg and --ll-contour (an "r, g, b" triplet) on the div.
 * Click to drop a start point, drag the start or a valley, hover for the
 * descent direction, press R (while hovering) to replay.
 */
(function () {
  const CSS = `
  /* ---- component ---- */
  .ll {
    --ll-bg: #13100d;
    --ll-fg: #efe9e1;
    --ll-contour: 239, 233, 225;   /* rgb triplet used for contour dots */
    position: relative;
    width: 100%;
    max-width: 960px;
    aspect-ratio: 16 / 10;
    background: var(--ll-bg);
    color: var(--ll-fg);
    font: 12px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    overflow: hidden;
  }
  .ll canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }
  .ll canvas.ll-grab { cursor: grab; }
  .ll canvas.ll-grabbing { cursor: grabbing; }
  .ll-hint {
    position: absolute; right: 12px; top: 10px; opacity: .5; text-align: right;
  }
  @media (max-width: 560px) {
    .ll { aspect-ratio: 4 / 5; font-size: 11px; }
    .ll-hint { display: none; }
  }
`;

  function injectCSS() {
    if (document.getElementById('ll-style')) return;
    const st = document.createElement('style');
    st.id = 'll-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function initLossLandscape(root) {
    if (root.dataset.llReady) return;
    root.dataset.llReady = '1';
    if (!root.hasAttribute('role')) {
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', 'Interactive loss surface: click to choose a starting point and watch steepest descent with line search zig-zag downhill.');
    }
    root.innerHTML = '<canvas></canvas><div class="ll-hint">click to drop a start · drag start or a valley · R replay</div>';
    const cv = root.querySelector('canvas');
    const ctx = cv.getContext('2d');

    // ---------- settings ----------
    const STEPS = 160;          // optimizer steps per run
    const SPEED = 140;          // steps animated per second (higher = faster)
    const LEVELS = 26;          // number of contour lines
    const CELL = 6;             // marching-squares cell size (px)

    // Valleys (Gaussian wells). fx, fy = position as fraction of width/height.
    const wells = [
      // a = depth, s = width, r = narrowness (1 = round), ang = tilt in radians
      { fx: 0.30, fy: 0.46, a: 1.00, s: 0.16, r: 0.35, ang: 0.55,  label: 'valley' },
      { fx: 0.72, fy: 0.40, a: 0.80, s: 0.11, r: 0.45, ang: -0.9,  label: 'valley' },
      { fx: 0.56, fy: 0.80, a: 0.45, s: 0.07, r: 1.00, ang: 0,     label: 'local min' },
    ];
    const start = { fx: 0.10, fy: 0.14 };

    const OPTS = [
      { id: 'line', name: 'Gradient search', on: true, dash: [3, 2.5], kinks: true, marker: 'circle' },
    ];

    // ---------- state ----------
    let W = 0, H = 0, A = 0.625, DPR = 1;
    let contourLayer = null;
    let paths = {};
    let step = 0, playing = false, lastT = 0;
    let hover = null, drag = null, frameQueued = false;
    let fg = '#efe9e1', bg = '#13100d', contourRGB = '239,233,225';

    // ---------- the loss surface ----------
    // Domain: x in [0,1], y in [0,A] where A = H/W, so pixels = domain * W.
    function f(x, y) {
      let v = 0.9 * ((x - 0.5) ** 2 + (y - A / 2) ** 2)
            + 0.03 * Math.sin(11 * x + 1) * Math.cos(9 * y + 0.5);
      for (const w of wells) {
        const dx = x - w.fx, dy = y - w.fy * A;
        const c = Math.cos(w.ang), sn = Math.sin(w.ang);
        const u = c * dx + sn * dy, q = (-sn * dx + c * dy) / w.r;
        v -= w.a * Math.exp(-(u * u + q * q) / (2 * w.s * w.s));
      }
      return v;
    }
    function grad(x, y) {
      const h = 1e-4;
      return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)];
    }

    // ---------- optimizers ----------
    // Steepest descent with exact line search: walk along -gradient until the
    // loss stops falling, stop at that minimum, recompute the gradient, turn.
    // Each new direction is perpendicular to the last → visible zig-zag kinks.
    function lineSearch(x, y) {
      const pts = [[x, y]];
      const cx = (v) => Math.min(1, Math.max(0, v)), cy = (v) => Math.min(A, Math.max(0, v));
      for (let k = 0; k < 40; k++) {
        const [gx, gy] = grad(x, y), gn = Math.hypot(gx, gy);
        if (gn < 1e-3) break;
        const dx = -gx / gn, dy = -gy / gn;
        const at = (t) => f(cx(x + dx * t), cy(y + dy * t));
        // march forward to bracket the first minimum along the line
        const h = 0.004;
        let t = 0, prev = f(x, y), lo = -1, hi = -1;
        while (t < 1.2) {
          const v = at(t + h);
          if (v > prev) { lo = Math.max(0, t - h); hi = t + h; break; }
          prev = v; t += h;
        }
        if (hi < 0) { lo = Math.max(0, t - h); hi = t; }
        // golden-section refine inside the bracket
        let a = lo, b = hi;
        for (let i = 0; i < 30; i++) {
          const m1 = a + 0.381966 * (b - a), m2 = b - 0.381966 * (b - a);
          if (at(m1) < at(m2)) b = m2; else a = m1;
        }
        const tt = (a + b) / 2;
        if (tt < 1e-4) break;
        x = cx(x + dx * tt); y = cy(y + dy * tt);
        pts.push([x, y]);
      }
      // cumulative length, so the dot travels at constant speed along the kinks
      pts.L = [0];
      for (let i = 1; i < pts.length; i++)
        pts.L.push(pts.L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return pts;
    }

    function run(id, x, y) { return lineSearch(x, y); }
    function computePaths() {
      const x0 = start.fx, y0 = start.fy * A;
      for (const o of OPTS) paths[o.id] = run(o.id, x0, y0);
    }

    // ---------- contours (marching squares, drawn as dots) ----------
    const CASES = {
      1: [3, 2], 2: [2, 1], 3: [3, 1], 4: [0, 1], 5: [0, 1, 3, 2], 6: [0, 2], 7: [3, 0],
      8: [3, 0], 9: [0, 2], 10: [0, 3, 2, 1], 11: [0, 1], 12: [3, 1], 13: [2, 1], 14: [3, 2],
    };
    function buildContours() {
      const nx = Math.ceil(W / CELL), ny = Math.ceil(H / CELL);
      const vals = new Float32Array((nx + 1) * (ny + 1));
      let mn = Infinity, mxv = -Infinity;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const v = f((i * CELL) / W, (j * CELL) / W);
        vals[j * (nx + 1) + i] = v;
        if (v < mn) mn = v; if (v > mxv) mxv = v;
      }
      contourLayer = contourLayer || document.createElement('canvas');
      contourLayer.width = Math.round(W * DPR); contourLayer.height = Math.round(H * DPR);
      const c = contourLayer.getContext('2d');
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, W, H);
      c.lineCap = 'round';
      c.lineWidth = 1.25;
      c.setLineDash([0.01, 3.2]);

      for (let k = 1; k < LEVELS; k++) {
        const t = k / LEVELS;
        const lev = mn + (mxv - mn) * t;
        c.strokeStyle = `rgba(${contourRGB},${(0.62 - 0.42 * t).toFixed(3)})`;
        c.beginPath();
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = vals[j * (nx + 1) + i], b = vals[j * (nx + 1) + i + 1];
          const cc = vals[(j + 1) * (nx + 1) + i + 1], d = vals[(j + 1) * (nx + 1) + i];
          const idx = (a > lev ? 8 : 0) | (b > lev ? 4 : 0) | (cc > lev ? 2 : 0) | (d > lev ? 1 : 0);
          const segs = CASES[idx];
          if (!segs) continue;
          const x0 = i * CELL, y0 = j * CELL;
          const edge = (e) => {
            switch (e) {
              case 0: return [x0 + CELL * (lev - a) / (b - a), y0];
              case 1: return [x0 + CELL, y0 + CELL * (lev - b) / (cc - b)];
              case 2: return [x0 + CELL * (lev - d) / (cc - d), y0 + CELL];
              default: return [x0, y0 + CELL * (lev - a) / (d - a)];
            }
          };
          for (let s = 0; s < segs.length; s += 2) {
            const p = edge(segs[s]), q = edge(segs[s + 1]);
            c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]);
          }
        }
        c.stroke();
      }
      // snap each valley marker to the true local minimum near its center
      for (const w of wells) {
        let x = w.fx, y = w.fy * A;
        for (let i = 0; i < 300; i++) { const [gx, gy] = grad(x, y); x -= 0.002 * gx; y -= 0.002 * gy; }
        w.mx = x * W; w.my = y * W;
      }
    }

    // ---------- drawing ----------
    function px(p) { return [p[0] * W, p[1] * W]; }

    function headOf(pts, s) {
      const i = Math.min(Math.floor(s), STEPS), t = s - i;
      if (i >= STEPS) return pts[STEPS];
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }

    // where an optimizer is at animation time s: last full vertex n + interpolated head
    function pathAt(o, s) {
      const pts = paths[o.id];
      s = Math.min(s, STEPS);
      if (!o.kinks) return { n: Math.floor(s), head: headOf(pts, s) };
      if (pts.length < 2) return { n: 0, head: pts[0] };
      const L = pts.L, target = L[L.length - 1] * s / STEPS;
      let i = 0;
      while (i < L.length - 2 && L[i + 1] < target) i++;
      const t = Math.min(1, (target - L[i]) / (L[i + 1] - L[i] || 1));
      return { n: i, head: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t] };
    }

    function draw() {
      frameQueued = false;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      if (contourLayer) ctx.drawImage(contourLayer, 0, 0, W, H);

      ctx.font = getComputedStyle(root).font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // valleys
      for (const w of wells) {
        const x = w.mx, y = w.my;
        ctx.fillStyle = fg;
        ctx.globalAlpha = drag && drag.well === w ? 1 : 0.75;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.fillText(w.label, x, y + 8);
      }
      ctx.globalAlpha = 1;

      // paths + rolling dots
      for (const o of OPTS) {
        if (!o.on) continue;
        const pts = paths[o.id];
        const { n, head } = pathAt(o, step);
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(o.dash);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        let p = px(pts[0]); ctx.moveTo(p[0], p[1]);
        for (let i = 1; i <= n; i++) { p = px(pts[i]); ctx.lineTo(p[0], p[1]); }
        const h = px(head);
        ctx.lineTo(h[0], h[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (o.kinks) {            // mark each turn of the line search
          ctx.lineWidth = 1.2;
          for (let i = 1; i <= n; i++) {
            const k = px(pts[i]);
            ctx.beginPath(); ctx.arc(k[0], k[1], 2.6, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(h[0], h[1], 3.5, 0, Math.PI * 2); ctx.fill();
      }

      // start marker
      const sx = start.fx * W, sy = start.fy * H;
      ctx.strokeStyle = fg; ctx.lineWidth = 1.3; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 3, sy + 3); ctx.lineTo(sx + 3, sy - 3); ctx.stroke();
      ctx.fillStyle = fg; ctx.textBaseline = 'bottom';
      ctx.fillText('start', sx, sy - 10);

      // hover readout
      if (hover && !drag) {
        // descent arrow: points along −gradient, longer where the slope is steeper
        const hx = hover.x / W, hy = hover.y / W;
        const v = f(hx, hy);
        const [gx, gy] = grad(hx, hy);
        const gn = Math.hypot(gx, gy);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = fg; ctx.fillStyle = fg;
        ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(hover.x, hover.y, 1.8, 0, Math.PI * 2); ctx.fill();
        let ux = 0, uy = -1;
        if (gn > 1e-6) {
          ux = -gx / gn; uy = -gy / gn;
          const len = Math.min(48, 12 + 9 * gn);
          const x0 = hover.x + ux * 5, y0 = hover.y + uy * 5;
          const x1 = hover.x + ux * (5 + len), y1 = hover.y + uy * (5 + len);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
          // arrowhead
          const ah = 6, aw = 0.45;
          const ang = Math.atan2(uy, ux);
          ctx.moveTo(x1, y1); ctx.lineTo(x1 - ah * Math.cos(ang - aw), y1 - ah * Math.sin(ang - aw));
          ctx.moveTo(x1, y1); ctx.lineTo(x1 - ah * Math.cos(ang + aw), y1 - ah * Math.sin(ang + aw));
          ctx.stroke();
        }
        // value label on the opposite side of the arrow so they never overlap
        ctx.textAlign = ux > 0 ? 'right' : 'left';
        ctx.textBaseline = uy > 0 ? 'bottom' : 'top';
        ctx.fillText(v.toFixed(3), hover.x - (ux > 0 ? 8 : -8), hover.y - (uy > 0 ? 6 : -6));
        ctx.globalAlpha = 1;
      }

      // step counter
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = fg; ctx.globalAlpha = 0.8;
      ctx.fillText(`step ${Math.min(Math.floor(step), STEPS)}/${STEPS}`, W - 12, H - 12);
      ctx.globalAlpha = 1;

    }

    function requestDraw() {
      if (!frameQueued) { frameQueued = true; requestAnimationFrame(tick); }
    }
    function tick(t) {
      if (playing) {
        if (!lastT) lastT = t;
        step += ((t - lastT) / 1000) * SPEED;
        lastT = t;
        if (step >= STEPS) { step = STEPS; playing = false; }
      }
      draw();
      if (playing) requestDraw();
    }
    function play() {
      step = 0; lastT = 0; playing = true; requestDraw();
    }

    // ---------- interaction ----------
    function local(e) {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function hitTest(p) {
      if (Math.hypot(p.x - start.fx * W, p.y - start.fy * H) < 14) return { start: true };
      for (const w of wells) if (Math.hypot(p.x - w.mx, p.y - w.my) < 14) return { well: w, ox: w.fx * W - p.x, oy: w.fy * H - p.y };
      return null;
    }
    let rebuildQueued = false;
    function queueRebuild() {
      if (rebuildQueued) return;
      rebuildQueued = true;
      requestAnimationFrame(() => {
        rebuildQueued = false;
        buildContours(); computePaths(); step = STEPS; draw();
      });
    }

    cv.addEventListener('pointerdown', (e) => {
      const p = local(e);
      cv.setPointerCapture(e.pointerId);
      const hit = hitTest(p);
      if (hit && hit.well) {
        drag = hit;
      } else {
        drag = { start: true };
        start.fx = p.x / W; start.fy = p.y / H;
        computePaths(); step = STEPS; playing = false;
      }
      cv.className = 'll-grabbing';
      requestDraw();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = local(e);
      hover = p;
      if (drag) {
        const fx = Math.min(0.98, Math.max(0.02, p.x / W));
        const fy = Math.min(0.98, Math.max(0.02, p.y / H));
        if (drag.start) {
          start.fx = fx; start.fy = fy;
          computePaths(); step = STEPS; requestDraw();
        } else {
          drag.well.fx = Math.min(0.98, Math.max(0.02, (p.x + drag.ox) / W));
          drag.well.fy = Math.min(0.98, Math.max(0.02, (p.y + drag.oy) / H));
          queueRebuild();
        }
      } else {
        cv.className = hitTest(p) ? 'll-grab' : '';
        requestDraw();
      }
    });
    function endDrag() {
      if (!drag) return;
      drag = null;
      cv.className = '';
      play();
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', () => { hover = null; requestDraw(); });

    let inside = false;
    root.addEventListener('pointerenter', () => { inside = true; });
    root.addEventListener('pointerleave', () => { inside = false; });
    window.addEventListener('keydown', (e) => {
      if (!inside) return;            // only react while the pointer is over the widget
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') play();
    });

    // ---------- sizing & theme ----------
    function readTheme() {
      const cs = getComputedStyle(root);
      fg = cs.getPropertyValue('--ll-fg').trim() || fg;
      bg = cs.getPropertyValue('--ll-bg').trim() || bg;
      contourRGB = cs.getPropertyValue('--ll-contour').trim() || contourRGB;
    }
    function resize() {
      const r = root.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height); A = H / W;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      readTheme();
      buildContours();
      computePaths();
      requestDraw();
    }
    new ResizeObserver(resize).observe(root);
    resize();

    // autoplay the first time it scrolls into view
    let played = false;
    new IntersectionObserver((entries) => {
      if (!played && entries.some((en) => en.isIntersecting)) { played = true; play(); }
    }, { threshold: 0.3 }).observe(root);
  }

  function boot() {
    injectCSS();
    document.querySelectorAll('.ll').forEach(initLossLandscape);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
