/*
 * Gentle ocean-wave background: faint flowing lines behind the page.
 * Usage: <script src="waves.js" defer></script>
 * Pauses when the tab is hidden; draws a still frame for reduced-motion users.
 */
(function () {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');

  const GAP = 22;          // px between wave lines
  const SPEED = 0.00022;   // overall drift speed
  let W = 0, H = 0, DPR = 1, raf = 0, last = 0, t0 = performance.now();

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    draw(performance.now());
  }

  function draw(now) {
    const t = (now - t0) * SPEED;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    const step = 6;
    for (let y0 = -40, i = 0; y0 < H + 40; y0 += GAP, i++) {
      // swells pass through in broad bands, so some lines are a touch darker
      const band = 0.5 + 0.5 * Math.sin(i * 0.35 + t * 0.6);
      ctx.strokeStyle = `rgba(30, 96, 150, ${(0.07 + 0.11 * band).toFixed(3)})`;
      ctx.beginPath();
      for (let x = -step; x <= W + step; x += step) {
        const y = y0
          + 11 * Math.sin(x * 0.0042 + t * 1.0 + i * 0.38)
          + 5 * Math.sin(x * 0.0091 - t * 1.4 + i * 0.75)
          + 1.5 * Math.sin(x * 0.019 + t * 2.1 + i * 1.3);
        x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function loop(now) {
    if (now - last > 33) { draw(now); last = now; }   // ~30 fps is plenty for slow motion
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduce) raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
})();
