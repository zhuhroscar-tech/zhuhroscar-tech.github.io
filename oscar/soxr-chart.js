/*
 * SOXR-10 interactive chart — strategy vs SOXX and SPY, with a drawdown panel.
 * Usage:
 *   <div class="sx" data-src="../soxr-10/assets/data.json"> <img ...fallback...> </div>
 *   <script src="soxr-chart.js" defer></script>
 * Reads the same data.json the SOXR-10 write-up publishes. Until it loads (or if
 * it fails) the fallback image inside the div stays visible.
 * Interactions: hover for values · drag across the chart to zoom · double-click
 * or pick a range to reset · click a legend entry to hide/show a line.
 */
(function () {
  const CSS = `
  .sx { position: relative; width: 100%; color: #000;
        font: 10px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        user-select: none; -webkit-user-select: none; }
  .sx-bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin: 0 0 4px; }
  .sx-bar button { all: unset; cursor: pointer; padding: 1px 0; }
  .sx-bar button:focus-visible { outline: 1px dashed #000; outline-offset: 2px; }
  .sx-ranges button { margin-right: 8px; opacity: .45; }
  .sx-ranges button[aria-pressed="true"] { opacity: 1; text-decoration: underline; text-underline-offset: 2px; }
  .sx-legend button { margin-left: 8px; display: inline-flex; align-items: center; gap: 4px; }
  .sx-legend button[aria-pressed="false"] { opacity: .3; }
  .sx-legend i { display: inline-block; width: 12px; height: 2px; }
  .sx canvas { display: block; width: 100%; aspect-ratio: 400 / 270; cursor: crosshair; touch-action: pan-y; }
  `;

  const SERIES = [
    { id: 'strategy', name: 'SOXR-10', color: '#2f6f57', width: 1.6 },
    { id: 'soxx',     name: 'SOXX',    color: '#d4892a', width: 1.1 },
    { id: 'spy',      name: 'SPY',     color: '#4a6fc4', width: 1.1 },
  ];
  const RANGES = [
    { id: 'replay',      label: '2025–26 replay' },
    { id: 'walkforward', label: '2016–24 backtest' },
    { id: 'full',        label: 'full' },
  ];

  function injectCSS() {
    if (document.getElementById('sx-style')) return;
    const st = document.createElement('style');
    st.id = 'sx-style'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}`;
  const pct = (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';

  function init(root, data) {
    const h = data.history;
    const dates = h.dates;
    const raw = {};
    SERIES.forEach((s) => (raw[s.id] = h.series[s.id]));
    const seg = h.segments;
    const idxOf = (d) => { const i = dates.indexOf(d); return i < 0 ? 0 : i; };

    root.innerHTML = '';
    const bar = document.createElement('div'); bar.className = 'sx-bar';
    const rangesEl = document.createElement('div'); rangesEl.className = 'sx-ranges';
    const legendEl = document.createElement('div'); legendEl.className = 'sx-legend';
    bar.append(rangesEl, legendEl);
    const cv = document.createElement('canvas');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'SOXR-10 strategy net asset value and drawdown versus SOXX and SPY. Hover for values, drag to zoom.');
    root.append(bar, cv);
    const ctx = cv.getContext('2d');

    let lo = 0, hi = dates.length - 1, rangeId = 'replay';
    const on = { strategy: true, soxx: true, spy: true };
    let hover = -1, brush = null, W = 0, H = 0, DPR = 1, view = null;

    RANGES.forEach((r) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = r.label;
      b.addEventListener('click', () => setRange(r.id));
      r.btn = b; rangesEl.appendChild(b);
    });
    SERIES.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button';
      b.setAttribute('aria-pressed', 'true');
      b.innerHTML = `<i style="background:${s.color}"></i>${s.name}`;
      b.addEventListener('click', () => {
        if (on[s.id] && Object.values(on).filter(Boolean).length === 1) return; // keep at least one
        on[s.id] = !on[s.id]; b.setAttribute('aria-pressed', String(on[s.id])); draw();
      });
      legendEl.appendChild(b);
    });

    function setRange(id) {
      rangeId = id;
      const [a, b] = seg[id];
      lo = idxOf(a); hi = idxOf(b);
      RANGES.forEach((r) => r.btn.setAttribute('aria-pressed', String(r.id === id)));
      hover = -1; draw();
    }
    function setZoom(a, b) {
      if (b - a < 10) return;
      lo = a; hi = b; rangeId = null;
      RANGES.forEach((r) => r.btn.setAttribute('aria-pressed', 'false'));
      draw();
    }

    // rebased values (10 at the window start) and drawdowns within the window
    function compute() {
      const out = {};
      for (const s of SERIES) {
        const v = raw[s.id], base = v[lo], nav = [], dd = [];
        let peak = -Infinity;
        for (let i = lo; i <= hi; i++) {
          const x = (v[i] / base) * 10; nav.push(x);
          peak = Math.max(peak, x); dd.push(x / peak - 1);
        }
        out[s.id] = { nav, dd };
      }
      return out;
    }

    function niceTicks(min, max, n) {
      const span = max - min || 1, raw = span / n;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
      const t = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) t.push(+v.toFixed(10));
      return t;
    }

    function dateTicks() {
      const n = hi - lo, months = n / 21;
      const every = months > 60 ? 24 : months > 30 ? 12 : months > 14 ? 6 : months > 6 ? 3 : 1;
      const t = [];
      for (let i = lo + 1; i <= hi; i++) {
        const a = dates[i - 1], b = dates[i];
        if (a.slice(5, 7) !== b.slice(5, 7)) {
          const m = +b.slice(5, 7) - 1, y = +b.slice(0, 4);
          if ((y * 12 + m) % every === 0) t.push({ i, label: every >= 12 ? b.slice(0, 4) : `${MONTHS[m]} ${b.slice(2, 4)}` });
        }
      }
      return t;
    }

    function draw() {
      const r = cv.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(W * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = getComputedStyle(root).font;

      const v = compute();
      const L = 26, R = 4, T = 4, gap = 12, B = 16;
      const plotH = H - T - B - gap, topH = plotH * 0.68, botH = plotH - topH;
      const top = { y0: T, y1: T + topH }, bot = { y0: T + topH + gap, y1: T + topH + gap + botH };
      const x0 = L, x1 = W - R, n = hi - lo;
      const X = (i) => x0 + ((i - lo) / n) * (x1 - x0);

      let mn = Infinity, mx = -Infinity, dmn = 0;
      for (const s of SERIES) if (on[s.id]) {
        for (const x of v[s.id].nav) { if (x < mn) mn = x; if (x > mx) mx = x; }
        for (const d of v[s.id].dd) if (d < dmn) dmn = d;
      }
      const log = mx / mn > 4;                 // long windows: log scale reads better
      if (log) { const k = Math.pow(mx / mn, 0.05); mn /= k; mx *= k; }
      else { const pad = (mx - mn) * 0.06; mn -= pad; mx += pad; }
      const f = log ? Math.log : (x) => x;
      const Y = (x) => top.y1 - ((f(x) - f(mn)) / (f(mx) - f(mn))) * (top.y1 - top.y0);
      dmn = Math.min(-0.05, dmn * 1.08);
      const YD = (d) => bot.y0 + (d / dmn) * (bot.y1 - bot.y0);
      view = { X, x0, x1, n };

      // grid + axes
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      let yt = log ? [5, 10, 20, 50, 100, 200, 500].filter((t) => t >= mn && t <= mx) : niceTicks(mn, mx, 4);
      if (log && yt.length < 2) yt = niceTicks(mn, mx, 3);
      for (const t of yt) { const y = Math.round(Y(t)) + .5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(String(t), x0 - 4, y); }
      for (const t of niceTicks(dmn, 0, 2)) { const y = Math.round(YD(t)) + .5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(t === 0 ? '0' : Math.round(t * 100) + '%', x0 - 4, y); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const t of dateTicks()) { const w = ctx.measureText(t.label).width / 2; const x = Math.min(x1 - w, Math.max(x0 + w, X(t.i))); ctx.fillText(t.label, x, bot.y1 + 4); }
      // panel labels, inside the plot at the left
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(log ? 'value of 10 (log scale)' : 'value of 10', x0 + 3, top.y0 + 1);
      ctx.fillText('drawdown', x0 + 3, bot.y1 - 12);

      // lines (strategy drawn last so it sits on top)
      for (const s of [...SERIES].reverse()) {
        if (!on[s.id]) continue;
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineJoin = 'round';
        const step = Math.max(1, Math.floor(n / (x1 - x0) / 1.5));
        for (const [arr, map] of [[v[s.id].nav, Y], [v[s.id].dd, YD]]) {
          ctx.beginPath();
          for (let k = 0; k <= n; k += step) { const x = X(lo + k), y = map(arr[k]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.lineTo(X(hi), map(arr[n])); ctx.stroke();
        }
      }

      // brush
      if (brush && Math.abs(brush.b - brush.a) > 2) {
        ctx.fillStyle = 'rgba(0,0,0,.07)';
        ctx.fillRect(Math.min(brush.a, brush.b), top.y0, Math.abs(brush.b - brush.a), bot.y1 - top.y0);
      }

      // hover readout
      if (hover >= lo && hover <= hi && !brush) {
        const k = hover - lo, x = Math.round(X(hover)) + .5;
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, top.y0); ctx.lineTo(x, bot.y1); ctx.stroke();
        const rows = [fmtDate(dates[hover])];
        for (const s of SERIES) if (on[s.id]) {
          const nav = v[s.id].nav[k], dd = v[s.id].dd[k];
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(x, Y(nav), 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x, YD(dd), 2, 0, Math.PI * 2); ctx.fill();
          rows.push({ s, text: `${s.name.padEnd(8)}${nav.toFixed(2).padStart(6)} ${pct(nav / 10 - 1).padStart(7)}  dd ${(dd * 100).toFixed(1)}%` });
        }
        const lh = 13, bw = Math.max(...rows.map((r) => ctx.measureText(typeof r === 'string' ? r : r.text).width)) + 12, bh = rows.length * lh + 6;
        let bx = x + 8; if (bx + bw > x1) bx = x - 8 - bw; bx = Math.max(0, Math.min(W - bw, bx));
        const by = top.y0 + 2;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        rows.forEach((r, j) => {
          ctx.fillStyle = typeof r === 'string' ? '#000' : r.s.color;
          ctx.fillText(typeof r === 'string' ? r : r.text, bx + 6, by + 4 + j * lh);
        });
      }
    }

    // ---- interaction ----
    const idxAt = (px) => {
      if (!view) return -1;
      const t = (px - view.x0) / (view.x1 - view.x0);
      return Math.max(lo, Math.min(hi, Math.round(lo + t * view.n)));
    };
    const localX = (e) => e.clientX - cv.getBoundingClientRect().left;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      brush = { a: localX(e), b: localX(e), id: e.pointerId, touch: e.pointerType !== 'mouse' };
      if (!brush.touch) cv.setPointerCapture(e.pointerId);
      hover = idxAt(localX(e)); draw();
    });
    cv.addEventListener('pointermove', (e) => {
      const x = localX(e);
      hover = idxAt(x);
      if (brush && !brush.touch) brush.b = x;
      draw();
    });
    const end = (e) => {
      if (!brush) return;
      const a = Math.min(brush.a, brush.b), b = Math.max(brush.a, brush.b), wasTouch = brush.touch;
      brush = null;
      if (!wasTouch && b - a > 8) { setZoom(idxAt(a), idxAt(b)); hover = -1; }
      draw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', () => { brush = null; draw(); });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !brush) { hover = -1; draw(); } });
    cv.addEventListener('dblclick', () => setRange(rangeId || 'replay'));
    new ResizeObserver(() => draw()).observe(cv);

    setRange('replay');
  }

  function boot() {
    injectCSS();
    document.querySelectorAll('.sx[data-src]').forEach((root) => {
      if (root.dataset.sxReady) return;
      root.dataset.sxReady = '1';
      fetch(root.dataset.src)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((d) => init(root, d))
        .catch(() => { /* keep the fallback image */ });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
