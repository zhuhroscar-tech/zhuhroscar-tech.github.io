(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const pct = (x, d = 1, sign = true) => x == null || !isFinite(x) ? "—" : (sign ? (x >= 0 ? "+" : "−") : (x < 0 ? "−" : "")) + Math.abs(x * 100).toFixed(d) + "%";
const pctU = (x, d = 1) => pct(x, d, false);
const usd = (x, d = 0) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fdate = (s, o = { month: "short", day: "numeric", year: "numeric" }) => new Date(s + "T12:00:00").toLocaleDateString("en-US", o);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const cls = (x) => x == null ? "" : x >= 0 ? "pos" : "neg";
const NS = "http://www.w3.org/2000/svg";
const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const tx = (p, a, s, c) => { const t = el("text", a, p); t.textContent = s; if (c) t.setAttribute("class", c); return t; };
const title = (node, s) => node.appendChild(Object.assign(document.createElementNS(NS, "title"), { textContent: s }));

// Series as a data sheet draws them: the device in copper, references in ink with dash patterns.
const SER = [
  { k: "strategy", short: "SOXR-10", name: "Strategy, net of costs", color: "--cu", w: 2.4, lbl: "cu" },
  { k: "soxx", short: "SOXX", name: "SOXX buy-and-hold", color: "--ink2", w: 1.1 },
  { k: "ewm", short: "Matched basket", name: "All 30 stocks at the strategy's exposure", color: "--ink2", w: 1.3, dash: "6 4" },
  { k: "spy", short: "SPY", name: "SPY buy-and-hold", color: "--ink2", w: 1.3, dash: "1.5 3" }];
const SEG = { full: "Feb 2016 – Oct 2026", walkforward: "2016–2024 walk-forward", replay: "2025–Oct 2026 replay" };

let D;
const redraw = [];
const onTheme = (f) => redraw.push(f);
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => redraw.forEach(f => f()), 150); });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => redraw.forEach(f => f()));
new MutationObserver(() => redraw.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* ---------------- figures ---------------- */
function plot(host, o) {
  host.innerHTML = "";
  const cw = host.clientWidth || 1000, narrow = cw < 480, trueScale = cw < 760;
  const W = trueScale ? Math.max(300, cw) : 1000;
  const H = trueScale ? Math.round(o.hs ? o.hs : Math.max(o.h * 0.95, W * (narrow && o.curveLabels ? 1.15 : 0.7))) : o.h;
  const ends_ = o.curveLabels && !narrow;
  const m = { l: trueScale ? 50 : 62, r: ends_ ? (trueScale ? 118 : 168) : 14, t: 14, b: o.xTitle && !trueScale ? 46 : 28 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.label }, host);
  const n = o.dates.length, x = (i) => m.l + (W - m.l - m.r) * i / Math.max(1, n - 1);
  const vis = o.series.filter(s => !s.hidden), all = vis.flatMap(s => s.values).filter(isFinite);
  let lo = o.min ?? Math.min(...all), hi = o.max ?? Math.max(...all);
  if (o.log) hi *= 1.12; else if (o.headroom) hi += (hi - lo) * o.headroom;
  let ticks = o.ticks(lo, hi); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1));
  if (narrow && ticks.length > 4) ticks = ticks.filter((_, i) => i % 2 === 0);
  const f = o.log ? Math.log : (v) => v, y = (v) => m.t + (H - m.t - m.b) * (1 - (f(v) - f(lo)) / (f(hi) - f(lo)));
  (o.bands || []).forEach(b => { const i0 = o.dates.findIndex(d => d >= b.from); if (i0 < 0) return;
    el("rect", { x: x(i0), y: m.t, width: x(n - 1) - x(i0), height: H - m.t - m.b, fill: css("--tint") }, svg);
    tx(svg, { x: x(i0) + 6, y: H - m.b - 8 }, trueScale ? b.label.split(" ").at(-1) : b.label, "lbl"); });
  if (o.frame) el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", stroke: css("--ink"), "stroke-width": 1 }, svg);
  else el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: css("--ink"), "stroke-width": 1.2 }, svg);
  ticks.forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: css("--fine") }, svg);
    tx(svg, { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, o.tick(t)); });
  const yearly = n > 500, every = trueScale && yearly ? (W < 640 ? 2 : 1) : 1;
  o.dates.forEach((d, i) => { const k = yearly ? d.slice(0, 4) : d.slice(0, 7); if (i && o.dates[i - 1].slice(0, k.length) === k) return;
    if (!yearly && +d.slice(5, 7) % (trueScale ? 6 : 3) !== 1) return;
    if (yearly && +d.slice(0, 4) % every) return;
    el("line", { x1: x(i), x2: x(i), y1: H - m.b, y2: H - m.b + 5, stroke: css("--ink") }, svg);
    tx(svg, { x: x(i), y: H - m.b + 16, "text-anchor": "middle" }, yearly ? d.slice(0, 4) : fdate(d, { month: "short", year: "2-digit" })); });
  if (o.xTitle && !trueScale) tx(svg, { x: (m.l + W - m.r) / 2, y: H - 8, "text-anchor": "middle" }, o.xTitle, "lbl");
  if (o.yTitle && !trueScale) tx(svg, { x: 14, y: (m.t + H - m.b) / 2, transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})`, "text-anchor": "middle" }, o.yTitle, "lbl");
  vis.slice().reverse().forEach(s => { let p = ""; s.values.forEach((v, i) => { if (isFinite(v)) p += (p ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); });
    if (s.area) el("path", { d: p + `L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: css(s.color), "fill-opacity": .28, stroke: "none" }, svg);
    el("path", { d: p, fill: "none", stroke: css(s.color), "stroke-width": s.w, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    if (s.markMin) { let im = 0; s.values.forEach((v, i) => { if (v < s.values[im]) im = i; });
      el("circle", { cx: x(im), cy: y(s.values[im]), r: 3.5, fill: css("--paper"), stroke: css(s.color), "stroke-width": 1.8 }, svg);
      tx(svg, { x: x(im) + (im > n * .5 ? -8 : 8), y: y(s.values[im]) + 4, "text-anchor": im > n * .5 ? "end" : "start" }, `${s.short} ${o.fmt(s.values[im])}, ${fdate(o.dates[im], { month: "short", year: "numeric" })}`, "lbl" + (s.lbl ? " " + s.lbl : "")); } });
  if (ends_) {   // datasheet-style labels at the curve ends, nudged apart
    const ends = vis.map(s => ({ s, yy: y(s.values[n - 1]) })).sort((a, b) => a.yy - b.yy);
    const gapL = narrow ? 19 : 17; for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < gapL) ends[i].yy = ends[i - 1].yy + gapL;
    ends.forEach(e => { el("line", { x1: x(n - 1) + 2, x2: x(n - 1) + 12, y1: y(e.s.values[n - 1]), y2: e.yy, stroke: css("--ink2") }, svg);
      tx(svg, { x: x(n - 1) + 15, y: e.yy + 4 }, `${trueScale && e.s.k === "ewm" ? "Matched" : e.s.short} ${o.tick(e.s.values[n - 1])}`, "lbl" + (e.s.lbl ? " " + e.s.lbl : "")); });
  }
  const cross = el("line", { y1: m.t, y2: H - m.b, stroke: css("--ink2"), visibility: "hidden", "stroke-dasharray": "2 2" }, svg);
  const dots = vis.map(s => el("circle", { r: 3.5, fill: css("--paper"), stroke: css(s.color), "stroke-width": 1.8, visibility: "hidden" }, svg));
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
  const move = (ev) => { const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (W - m.l - m.r) * (n - 1))));
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
    vis.forEach((s, j) => { dots[j].setAttribute("cx", x(i)); dots[j].setAttribute("cy", y(s.values[i])); dots[j].setAttribute("visibility", "visible"); });
    tip.innerHTML = `<div class="row"><b>${fdate(o.dates[i])}</b></div>` + vis.map(s => `<div class="row"><span>${s.short}</span><b>${o.fmt(s.values[i])}</b></div>`).join("") + (o.extra ? o.extra(i) : "");
    tip.hidden = false; const hr = host.getBoundingClientRect(); let L = ev.clientX - hr.left + 14;
    if (L + tip.offsetWidth > hr.width) L = ev.clientX - hr.left - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, L) + "px"; tip.style.top = Math.max(0, ev.clientY - hr.top - tip.offsetHeight - 10) + "px"; };
  const leave = () => { cross.setAttribute("visibility", "hidden"); dots.forEach(d => d.setAttribute("visibility", "hidden")); tip.hidden = true; };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", leave);
}
const step = (lo, hi, k = 5) => { const raw = (hi - lo) / k, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(f => f * p).find(s => s >= raw); };
const lin = (lo, hi) => { const s = step(lo, hi), o = []; for (let v = Math.floor(lo / s) * s; v <= hi + 1e-9; v += s) o.push(+v.toFixed(6)); return o; };
const logT = (lo, hi) => { const o = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) [1, 2, 5].forEach(f => { const v = f * 10 ** e; if (v >= lo * .8 && v <= hi * 1.25) o.push(v); }); return o; };

function slice(seg) {
  const H = D.history, [a, b] = H.segments[seg];
  const i0 = H.dates.findIndex(d => d >= a); let i1 = H.dates.length - 1; while (H.dates[i1] > b) i1--;
  const out = { dates: H.dates.slice(i0, i1 + 1), exposure: H.exposure.slice(i0, i1 + 1), s: {} };
  for (const k in H.series) { const v = H.series[k].slice(i0, i1 + 1); out.s[k] = v.map(z => 10 * z / v[0]); }
  return out;
}
const dd = (v) => { let pk = -Infinity; return v.map(z => { pk = Math.max(pk, z); return z / pk - 1; }); };
function navFigures(root, opts = {}) {
  const st = { seg: opts.seg || "full" };
  root.innerHTML = `${opts.buttons === false ? "" : `<div class="btns" role="group" aria-label="Period">${Object.keys(SEG).map(k => `<button type="button" data-seg="${k}" aria-pressed="${k === st.seg}">${SEG[k]}</button>`).join("")}</div>`}
    <figure><figcaption><span class="sn">Figure ${opts.fig || "6-1"}.</span>NAV per unit vs time</figcaption>
      <div class="key">${SER.map(z => `<span><i style="border-top-color:var(${z.color});${z.dash ? "border-top-style:dotted" : ""}${z.k === "strategy" ? ";border-top-width:3px" : ""}"></i>${z.short}</span>`).join("")}</div>
      <div class="plot nav"></div></figure>
    ${opts.dd ? `<figure><figcaption><span class="sn">Figure ${opts.ddfig || "6-2"}.</span>Drawdown from previous peak vs time</figcaption><div class="plot dd"></div></figure>` : ""}`;
  const draw = () => { const s = slice(st.seg), log = st.seg === "full";
    const ser = SER.map(z => ({ ...z, values: s.s[z.k] }));
    const bands = st.seg === "full" ? [{ from: D.history.segments.replay[0], label: "frozen-model replay" }] : [];
    plot($(".nav", root), { h: opts.h || 380, label: "NAV per unit", dates: s.dates, series: ser, curveLabels: true, bands, log,
      ticks: log ? logT : lin, tick: (v) => "$" + (v >= 100 ? v.toFixed(0) : v % 1 ? v.toFixed(2) : v.toFixed(0)), fmt: (v) => "$" + v.toFixed(2),
      yTitle: `NAV per unit ($${log ? ", log scale" : ""})`, xTitle: "Date (start = $10)",
      extra: (i) => `<div class="row"><span>Exposure</span><b>${(s.exposure[i] * 100).toFixed(0)}%</b></div>` });
    if (opts.dd) plot($(".dd", root), { h: 220, label: "Drawdown", dates: s.dates, series: ser.map(z => ({ ...z, values: dd(z.values) })), curveLabels: true, bands,
      min: -0.5, max: 0, ticks: () => [-0.5, -0.4, -0.3, -0.2, -0.1, 0], tick: (v) => (v * 100).toFixed(0) + "%", fmt: (v) => pct(v), yTitle: "Drawdown (%)" });
  };
  root.querySelectorAll("[data-seg]").forEach(b => b.addEventListener("click", () => { st.seg = b.dataset.seg;
    root.querySelectorAll("[data-seg]").forEach(z => z.setAttribute("aria-pressed", z === b)); draw(); }));
  draw(); onTheme(draw);
}

function transferPlot(host) {   // invested share vs trailing sector volatility: the regulator's transfer curve
  host.innerHTML = "";
  const cw = host.clientWidth || 560, W = Math.max(300, Math.min(cw, 760)), H = Math.round(Math.min(360, W * 0.62)), m = { l: 50, r: 16, t: 14, b: 40 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Invested share versus 20-day sector volatility" }, host);
  const xmax = 1.2, x = (v) => m.l + (W - m.l - m.r) * v / xmax, y = (v) => m.t + (H - m.t - m.b) * (1 - v);
  [0, .2, .4, .6, .8, 1].forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: css("--fine") }, svg); tx(svg, { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, (t * 100) + "%"); });
  [0, .2, .4, .6, .8, 1, 1.2].forEach(t => { el("line", { x1: x(t), x2: x(t), y1: H - m.b, y2: H - m.b - 5, stroke: css("--ink") }, svg); tx(svg, { x: x(t), y: H - m.b + 16, "text-anchor": "middle" }, (t * 100).toFixed(0) + "%"); });
  el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", stroke: css("--ink") }, svg);
  tx(svg, { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle" }, "Trailing 20-day volatility of the 30-stock basket (annualized)", "lbl");
  let d = ""; for (let v = 0.005; v <= xmax; v += 0.005) { const e = Math.min(1, Math.max(0.2, 0.22 / v)); d += (d ? "L" : "M") + x(v).toFixed(1) + "," + y(e).toFixed(1); }
  el("line", { x1: x(0.22), x2: x(0.22), y1: m.t, y2: H - m.b, stroke: css("--ink2"), "stroke-dasharray": "3 3" }, svg);
  tx(svg, { x: x(0.22) + 5, y: m.t + 14 }, "22% target");
  el("line", { x1: m.l, x2: W - m.r, y1: y(0.2), y2: y(0.2), stroke: css("--ink2"), "stroke-dasharray": "3 3" }, svg);
  tx(svg, { x: m.l + 8, y: y(0.2) + 16, "text-anchor": "start" }, "20% floor");
  el("path", { d, fill: "none", stroke: css("--cu"), "stroke-width": 2.4 }, svg);
  const pts = [[0.22 / D.live.target_exposure, D.live.target_exposure, "Oct 19, 2026 (live)"], [0.22 / 0.22, 0.22, "Mar 2020 low"]];
  pts.forEach(([v, e, l], i) => { el("circle", { cx: x(v), cy: y(e), r: 5, fill: css("--paper"), stroke: css("--ink"), "stroke-width": 2 }, svg);
    const lx = x(v) + (i ? -6 : 10), ly = y(e) - (i ? 46 : 34);
    el("line", { x1: x(v), x2: lx, y1: y(e) - 6, y2: ly + 4, stroke: css("--ink2") }, svg);
    tx(svg, { x: lx, y: ly, "text-anchor": i ? "end" : "start" }, `${l}: ${(e * 100).toFixed(0)}%`, "lbl"); });
}
function rollingPlot(host) {   // trailing 1-year return: SOXR-10 minus the matched basket
  const H = D.history, S = H.series.strategy, E = H.series.ewm, k = 252, dates = H.dates.slice(k);
  const v = dates.map((_, i) => (S[i + k] / S[i] - 1) - (E[i + k] / E[i] - 1));
  const lo = Math.min(...v), hi = Math.max(...v);
  plot(host, { h: 330, hs: Math.round(Math.min(360, (host.clientWidth || 560) * 0.62)), frame: true, label: "Rolling one-year return difference", dates,
    series: [{ k: "d", short: "SOXR-10 − matched", color: "--cu", w: 1.8, values: v }], min: Math.min(-0.1, lo), max: Math.max(0.1, hi), headroom: 0.08,
    ticks: lin, tick: (t) => (t > 0 ? "+" : "") + (t * 100).toFixed(0) + "%", fmt: (t) => pct(t), bands: [{ from: H.segments.replay[0], label: "replay" }] });
  const svg = host.querySelector("svg"), zero = [...svg.querySelectorAll("text")].find(t => t.textContent === "0%");
  if (zero) { const yy = +zero.getAttribute("y") - 4; el("line", { x1: 50, x2: svg.viewBox.baseVal.width - 14, y1: yy, y2: yy, stroke: css("--ink"), "stroke-width": 1 }, svg); }
}
function typical(root) {
  const draw = () => {
    const sl = slice("full"), ser = SER.map(z => ({ ...z, values: sl.s[z.k] }));
    const hs = (h) => Math.round(Math.min(360, (h.clientWidth || 560) * 0.62));
    plot($("#t1", root), { h: 330, hs: hs($("#t1", root)), frame: true, label: "NAV per unit vs time", dates: sl.dates, series: ser, curveLabels: true, log: true,
      bands: [{ from: D.history.segments.replay[0], label: "frozen-model replay" }],
      ticks: logT, tick: (v) => "$" + v.toFixed(0), fmt: (v) => "$" + v.toFixed(2),
      extra: (i) => `<div class="row"><span>Invested</span><b>${(sl.exposure[i] * 100).toFixed(0)}%</b></div>` });
    // weekly sampling, but always keep each series' worst day so labels match the tables exactly
    const argmin = (v) => v.reduce((m, z, i) => z < v[m] ? i : m, 0);
    const keep = new Set(["strategy", "soxx"].map(k => argmin(dd(sl.s[k]))));
    const wk = sl.dates.map((_, i) => i).filter(i => i % 5 === 0 || i === sl.dates.length - 1 || keep.has(i));
    plot($("#t2", root), { h: 330, hs: hs($("#t2", root)), frame: true, label: "Drawdown vs time", dates: wk.map(i => sl.dates[i]),
      series: ser.filter(z => z.k === "strategy" || z.k === "soxx").map(z => { const d2 = dd(z.values); return { ...z, w: z.k === "soxx" ? 1 : 1.6, area: z.k === "strategy", markMin: true, values: wk.map(i => d2[i]) }; }), curveLabels: false,
      min: -0.5, max: 0, ticks: () => [-0.5, -0.4, -0.3, -0.2, -0.1, 0], tick: (v) => (v * 100).toFixed(0) + "%", fmt: (v) => pct(v),
      bands: [{ from: D.history.segments.replay[0], label: "replay" }] });
    transferPlot($("#t3", root)); rollingPlot($("#t4", root));
  };
  draw(); onTheme(draw);
}

/* ---------------- package (pinout) ---------------- */
function holdings() {
  const L = D.live;
  return L.positions.map(p => ({ ...p, name: D.names[p.symbol], sub: D.classification[p.symbol], country: D.country[p.symbol],
    w: p.weight, score: L.signal_scores[p.symbol] })).sort((a, b) => b.w - a.w);
}
function pinout(host) {
  host.innerHTML = "";
  const H = holdings(), W = Math.min(700, Math.max(320, host.clientWidth || 620)), k = W / 620;
  const bw = Math.round(W < 480 ? 150 : 250 * Math.min(1, k)), bx = Math.round((W - bw) / 2), by = 26, bh = Math.round(W < 480 ? 300 : 460 * Math.min(1.1, Math.max(.9, k))), pitch = bh / 5, Ht = by + bh + 26;
  const small = W < 480, tick = small ? 14 : 17, sub = small ? 12 : 13.5;
  const svg = el("svg", { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: "img", "aria-label": "Live holdings drawn as a 10-pin package" }, host);
  el("rect", { x: bx, y: by, width: bw, height: bh, fill: "none", stroke: css("--ink"), "stroke-width": 1.5 }, svg);
  el("path", { d: `M${bx + bw / 2 - 18},${by} a18,18 0 0,0 36,0`, fill: css("--paper"), stroke: css("--ink"), "stroke-width": 1.5 }, svg);
  el("circle", { cx: bx + 20, cy: by + 20, r: 6, fill: css("--ink") }, svg);
  const cash = D.live.cash_weight, defs = el("defs", {}, svg), pat = el("pattern", { id: "ep", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: css("--ink2"), "stroke-width": 1 }, pat);
  const pw = bw * 0.56, ph = bh * 0.26, pxp = bx + (bw - pw) / 2, pyp = by + bh * 0.62;
  el("rect", { x: pxp, y: pyp, width: pw, height: ph, fill: "url(#ep)", stroke: css("--ink"), "stroke-width": 1.2 }, svg);
  el("rect", { x: bx + bw / 2 - (small ? 42 : 58), y: pyp + ph / 2 - 13, width: small ? 84 : 116, height: 26, fill: css("--paper"), stroke: "none" }, svg);
  tx(svg, { x: bx + bw / 2, y: pyp + ph / 2 + 5, "text-anchor": "middle", style: `font:600 ${small ? 12 : 13.5}px var(--f-mono);fill:var(--ink)` }, `${small ? "" : "EP · "}CASH ${(cash * 100).toFixed(1)}%`);
  tx(svg, { x: bx + bw / 2, y: by + bh * 0.3, "text-anchor": "middle", style: `font:700 ${small ? 22 : 38}px var(--f-disp);fill:var(--ink)` }, "SOXR-10");
  tx(svg, { x: bx + bw / 2, y: by + bh * 0.3 + 22, "text-anchor": "middle", style: "font:13px var(--f-body);fill:var(--ink2)" }, "top view");
  tx(svg, { x: bx + bw / 2, y: by + bh * 0.3 + 42, "text-anchor": "middle", style: "font:700 15px var(--f-body);fill:var(--ink)" }, `${(H.reduce((a, p) => a + p.w, 0) * 100).toFixed(1)}% invested`);
  const fn = (p) => p.sub === "Chip-design software" ? "EDA" : p.sub === "Semiconductors" ? "CHIP" : "EQPT";
  H.forEach((p, i) => { const left = i < 5, row = left ? i : 9 - i, cy = by + pitch * (row + .5), pl = small ? 18 : 26;
    const px = left ? bx - pl : bx + bw;
    title(el("rect", { x: px, y: cy - 7, width: pl, height: 14, fill: css("--paper"), stroke: css("--ink"), "stroke-width": 1.5 }, svg), `Pin ${i + 1}: ${p.name}, ${(p.w * 100).toFixed(2)}% of equity`);
    tx(svg, { x: left ? bx + 10 : bx + bw - 10, y: cy + 5, "text-anchor": left ? "start" : "end", style: "font:500 13px var(--f-mono);fill:var(--ink2)" }, String(i + 1));
    const ax = left ? bx - pl - 8 : bx + bw + pl + 8, an = left ? "end" : "start";
    if (!small) { tx(svg, { x: ax, y: cy - 2, "text-anchor": an, style: `font:600 ${tick}px var(--f-mono);fill:var(--ink)` }, p.symbol);
      tx(svg, { x: ax, y: cy + sub + 3, "text-anchor": an, style: `font:500 ${sub}px var(--f-mono);fill:var(--ink)` }, `${(p.w * 100).toFixed(1)}% ${fn(p)}`); }
    else { tx(svg, { x: ax, y: cy - 1, "text-anchor": an, style: "font:600 14px var(--f-mono);fill:var(--ink)" }, p.symbol);
      tx(svg, { x: ax, y: cy + 13, "text-anchor": an, style: "font:500 12px var(--f-mono);fill:var(--ink)" }, `${(p.w * 100).toFixed(1)}%`); }
  });
}

/* ---------------- block diagram ---------------- */
function blockDiagram(host) {
  host.innerHTML = "";
  const blocks = [["PRICE IN", "Daily OHLCV, 30 stocks, 200 days"], ["FACTOR FRONT END", "33 Alpha158 signals × 20 days"], ["GRU CORE", "32 units + attention"],
    ["EXPERT MUX", "3 heads, router selects 1"], ["TOP-10 SELECT", "equal dollar weights"], ["VOL REGULATOR", "22% ref, 20–100% out"], ["ORDER OUT", "day market orders"]];
  const W = 1000, H = 250, bw = 118, gap = (W - 20 - blocks.length * bw) / (blocks.length - 1), y0 = 70, bh = 88;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Functional block diagram of the signal chain" }, host);
  blocks.forEach(([a, b], i) => { const x = 10 + i * (bw + gap), core = i === 2 || i === 3;
    el("rect", { x, y: y0, width: bw, height: bh, fill: core ? css("--tint") : css("--paper"), stroke: css(core ? "--cu" : "--ink"), "stroke-width": core ? 2 : 1.5 }, svg);
    tx(svg, { x: x + bw / 2, y: y0 + 28, "text-anchor": "middle", style: "font:700 13px var(--f-disp);fill:var(--ink)" }, a);
    const words = b.split(" "), lines = []; let cur = "";
    words.forEach(w => { if ((cur + " " + w).trim().length > 16) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }); lines.push(cur.trim());
    lines.forEach((ln, j) => tx(svg, { x: x + bw / 2, y: y0 + 46 + j * 13, "text-anchor": "middle", style: "font:10.5px var(--f-body);fill:var(--ink2)" }, ln));
    if (i < blocks.length - 1) { const ax = x + bw, bx2 = x + bw + gap;
      el("line", { x1: ax, x2: bx2 - 6, y1: y0 + bh / 2, y2: y0 + bh / 2, stroke: css("--ink"), "stroke-width": 1.5 }, svg);
      el("path", { d: `M${bx2 - 7},${y0 + bh / 2 - 4} L${bx2},${y0 + bh / 2} L${bx2 - 7},${y0 + bh / 2 + 4} Z`, fill: css("--ink") }, svg); }
  });
  // feedback path: realized volatility from the price input into the regulator
  const xa = 10 + bw / 2, xb = 10 + 5 * (bw + gap) + bw / 2, yb = y0 + bh + 40;
  el("path", { d: `M${xa},${y0 + bh} V${yb} H${xb} V${y0 + bh + 6}`, fill: "none", stroke: css("--cu"), "stroke-width": 1.5, "stroke-dasharray": "5 3" }, svg);
  el("path", { d: `M${xb - 4},${y0 + bh + 8} L${xb},${y0 + bh} L${xb + 4},${y0 + bh + 8} Z`, fill: css("--cu") }, svg);
  tx(svg, { x: (xa + xb) / 2, y: yb - 6, "text-anchor": "middle", style: "font:11px var(--f-body);fill:var(--cu-ink)" }, "realized 20-day basket volatility");
  tx(svg, { x: 10 + 2 * (bw + gap), y: y0 - 14, style: "font:600 11px var(--f-body);fill:var(--cu-ink)" }, "MODEL (trained 2010–2023, frozen)");
  el("line", { x1: 10 + 2 * (bw + gap), x2: 10 + 3 * (bw + gap) + bw, y1: y0 - 8, y2: y0 - 8, stroke: css("--cu") }, svg);
}

/* ---------------- tables ---------------- */
function compareTable(host) {
  const S = D.history.stats.full, rows = [["Annualized return", "cagr", pct], ["Annualized volatility", "vol", pctU], ["Sharpe ratio", "sharpe", (v) => v.toFixed(2)],
    ["Max drawdown", "max_dd", pct], ["Beta to SOXX", "beta", (v) => v.toFixed(2)], ["Positive months", "pct_months_up", (v) => (v * 100).toFixed(0) + "%"], ["Average invested", "avg_inv", (v) => (v * 100).toFixed(0) + "%"]];
  const avg = D.history.exposure.reduce((a, b) => a + b, 0) / D.history.exposure.length;
  S.strategy.avg_inv = avg; S.ewm.avg_inv = avg; S.soxx.avg_inv = 1; S.spy.avg_inv = 1;
  const cols = [["strategy", "SOXR-10", "SOXR"], ["ewm", "Matched basket", "Match"], ["soxx", "SOXX", "SOXX"], ["spy", "SPY", "SPY"]];
  const val = (c, k, f) => k === "beta" && c === "soxx" ? "1.00" : S[c][k] == null ? "—" : f(S[c][k]);
  host.innerHTML = `<table class="fixed"><caption><span class="sn">Table 5-1.</span>Device comparison, Feb 2016 – Oct 2026 (simulated, net of costs)</caption>
    <thead><tr><th>Parameter</th>${cols.map(([k, n, sh], j) => `<th class="r${j ? "" : " us"}"><span class="lg">${n}</span><span class="sm">${sh}</span></th>`).join("")}</tr></thead><tbody>
    ${rows.map(([n, k, f]) => `<tr><th>${n}</th>${cols.map(([c], j) => `<td class="r${j ? "" : " us"}">${val(c, k, f)}</td>`).join("")}</tr>`).join("")}
    </tbody></table>`;
}
function pinMini(host) {
  const H = holdings();
  host.innerHTML = `<table><caption><span class="sn">Table 1-1.</span>Pin functions</caption><thead><tr><th class="r">Pin</th><th>Ticker</th><th>Company</th><th>Function</th><th class="r">Weight</th></tr></thead><tbody>
    ${H.map((p, i) => `<tr><td class="r">${i + 1}</td><th><b>${p.symbol}</b></th><td>${p.name}</td><td>${p.sub}</td><td class="r">${(p.w * 100).toFixed(1)}%</td></tr>`).join("")}
    <tr><td class="r">—</td><th><b>CASH</b></th><td>Uninvested balance</td><td>Regulator output</td><td class="r">${(D.live.cash_weight * 100).toFixed(1)}%</td></tr></tbody></table>`;
}
function elecTable(host) {   // min / typ / max where min and max are the worst and best calendar years
  const A = D.history.annual.strategy, S = D.history.stats, yrs = Object.keys(A).filter(y => y !== "2016" && y !== "2026");
  const yr = yrs.map(y => A[y]), mn = Math.min(...yr), mx = Math.max(...yr);
  const rows = [
    ["Annual return", "calendar years 2017–2025, 10 bps/trade", pct(mn), pct(S.full.strategy.cagr), pct(mx), "%/yr"],
    ["Annualized volatility", "daily, Feb 2016 – Oct 2026", "", pctU(S.full.strategy.vol), "", "%"],
    ["Sharpe ratio", "0% risk-free rate", Math.min(S.walkforward.strategy.sharpe, S.replay.strategy.sharpe).toFixed(2), S.full.strategy.sharpe.toFixed(2), Math.max(S.walkforward.strategy.sharpe, S.replay.strategy.sharpe).toFixed(2), "—"],
    ["Maximum drawdown", "walk-forward / full period", "", pct(S.walkforward.strategy.max_dd), pct(S.full.strategy.max_dd), "%"],
    ["Beta to SOXX", "daily returns", "", S.full.strategy.beta.toFixed(2), "", "—"],
    ["Up / down capture vs SOXX", "monthly", "", `${(S.full.strategy.up_capture * 100).toFixed(0)} / ${(S.full.strategy.down_capture * 100).toFixed(0)}`, "", "%"],
    ["Ranking accuracy (IC)", `${D.walkforward.ic.n} walk-forward rebalances`, "", "+" + D.walkforward.ic.mean.toFixed(3), "", `t = ${D.walkforward.ic.t.toFixed(2)}`],
    ["Turnover", "2016–2024 walk-forward", "", D.walkforward.turnover.toFixed(1), "", "× equity/yr"]];
  host.innerHTML = `<table><caption><span class="sn">Table 6-3.</span>Electrical characteristics (simulated)</caption>
    <thead><tr><th>Parameter</th><th>Test conditions</th><th class="r">Min</th><th class="r">Typ</th><th class="r">Max</th><th>Unit</th></tr></thead><tbody>
    ${rows.map(r => `<tr><th>${r[0]}</th><td class="wrap">${r[1]}</td><td class="r">${r[2]}</td><td class="r"><b>${r[3]}</b></td><td class="r">${r[4]}</td><td>${r[5]}</td></tr>`).join("")}
    </tbody></table>`;
}
function trailingTable(host) {
  const T = D.history.trailing, c = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "SI"];
  host.innerHTML = `<table><caption><span class="sn">Table 6-4.</span>Trailing returns to ${fdate(D.as_of_sim)} (simulated)</caption><thead><tr><th>Series</th>${c.map(k => `<th class="r">${k === "SI" ? "Since Feb 2016¹" : k + (["3Y", "5Y"].includes(k) ? "¹" : "")}</th>`).join("")}</tr></thead><tbody>
    ${SER.map((s, i) => `<tr class="${i ? "" : "us"}"><th>${s.short}</th>${c.map(k => `<td class="r ${cls(T[s.k][k])}">${pct(T[s.k][k])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function calendarTable(host) {
  const A = D.history.annual, ys = Object.keys(A.strategy).sort();
  host.innerHTML = `<table><caption><span class="sn">Table 6-5.</span>Calendar-year returns (simulated)</caption><thead><tr><th>Series</th>${ys.map(y => `<th class="r">${y}${y === "2016" ? "²" : y === "2026" ? " YTD" : ""}</th>`).join("")}</tr></thead><tbody>
    ${SER.map((s, i) => `<tr class="${i ? "" : "us"}"><th>${s.short}</th>${ys.map(y => `<td class="r ${cls(A[s.k][y])}">${pct(A[s.k][y])}</td>`).join("")}</tr>`).join("")}
    <tr><th>SOXR-10 − SOXX</th>${ys.map(y => { const d = A.strategy[y] - A.soxx[y]; return `<td class="r ${cls(d)}">${pct(d)}</td>`; }).join("")}</tr></tbody></table>`;
}
function monthlyTable(host) {
  const M = D.history.monthly.strategy, A = D.history.annual.strategy, ys = [...new Set(Object.keys(M).map(k => k.slice(0, 4)))].sort().reverse();
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  host.innerHTML = `<table><caption><span class="sn">Table 6-6.</span>Monthly returns, SOXR-10 (%, simulated)</caption><thead><tr><th>Year</th>${mo.map(m => `<th class="r">${m}</th>`).join("")}<th class="r">Year</th></tr></thead><tbody>
    ${ys.map(y => `<tr><th>${y}</th>${mo.map((_, i) => { const v = M[`${y}-${String(i + 1).padStart(2, "0")}`]; return `<td class="r ${cls(v)}">${v == null ? "" : (v * 100).toFixed(1)}</td>`; }).join("")}<td class="r ${cls(A[y])}"><b>${(A[y] * 100).toFixed(1)}</b></td></tr>`).join("")}</tbody></table>`;
}
function navHistory(host) {
  const N = Object.entries(D.history.monthly_nav).reverse(), sx = {};
  D.history.dates.forEach((d, i) => sx[d.slice(0, 7)] = D.history.series.soxx[i]);
  host.innerHTML = `<table><caption><span class="sn">Table 6-7.</span>Month-end NAV per unit (simulated, from $10.00)</caption><thead><tr><th>Month end</th><th class="r">SOXR-10</th><th class="r">Month</th><th class="r">SOXX</th><th>Segment</th></tr></thead><tbody>
    ${N.map(([d, v], i) => { const r = v / (N[i + 1]?.[1] ?? 10) - 1; return `<tr><td>${fdate(d)}</td><td class="r"><b>${usd(v, 2)}</b></td><td class="r ${cls(r)}">${pct(r)}</td><td class="r">${usd(sx[d.slice(0, 7)], 2)}</td><td>${d >= "2025-01" ? "replay" : "walk-forward"}</td></tr>`; }).join("")}</tbody></table>`;
}
function pinTable(host) {
  const H = holdings();
  host.innerHTML = `<table><caption><span class="sn">Table 8-1.</span>Pin functions (${fdate(D.live.last_rebalance)})</caption><thead><tr><th class="r">Pin</th><th>Ticker</th><th>Company</th><th>Function</th><th>Country</th><th class="r">Weight</th><th class="r">Model score</th></tr></thead><tbody>
    ${H.map((p, i) => `<tr><td class="r">${i + 1}</td><th><b>${p.symbol}</b></th><td>${p.name}</td><td>${p.sub}</td><td>${p.country}</td><td class="r">${(p.w * 100).toFixed(2)}%</td><td class="r">${p.score.toFixed(4)}</td></tr>`).join("")}
    <tr class="us"><td class="r">—</td><th>CASH</th><td>Uninvested balance</td><td>Volatility regulator output</td><td>—</td><td class="r">${(D.live.cash_weight * 100).toFixed(2)}%</td><td></td></tr></tbody></table>`;
}
function rotation(host) {
  host.innerHTML = "";
  const cols = D.walkforward.picks.map(p => ({ ...p, k: "wf" })).concat(D.replay.picks.map(p => ({ ...p, k: "rp" })))
    .concat([{ date: D.live.last_rebalance, exposure: D.live.target_exposure, picks: D.live.positions.map(p => p.symbol), k: "live" }]);
  cols.forEach(c => c.set = new Set(c.picks));
  const names = D.universe.slice().sort((a, b) => cols.filter(c => c.set.has(b)).length - cols.filter(c => c.set.has(a)).length || a.localeCompare(b));
  const cw = 7, ch = 13, g = 1, m = { l: 50, t: 40, b: 34 };
  const W = m.l + cols.length * (cw + g) + 22, H = m.t + names.length * (ch + g) + m.b;
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Holdings at every rebalance" }, host);
  cols.forEach((c, j) => { const x = m.l + j * (cw + g) + (c.k === "rp" ? 6 : 0) + (c.k === "live" ? 14 : 0);
    title(el("rect", { x, y: m.t - 6 - 26 * c.exposure, width: cw, height: 26 * c.exposure, fill: css("--ink2") }, svg), `${fdate(c.date)} · exposure ${(c.exposure * 100).toFixed(0)}%`);
    names.forEach((nm, i) => { const on = c.set.has(nm);
      const r = el("rect", { x, y: m.t + i * (ch + g), width: cw, height: ch, fill: on ? css(c.k === "live" ? "--cu" : "--ink") : css("--fine") }, svg);
      if (on) title(r, `${nm} held from ${fdate(c.date)}`); });
    if (!j || cols[j - 1].date.slice(0, 4) !== c.date.slice(0, 4) || c.k === "live") tx(svg, { x, y: H - m.b + 14 }, c.k === "live" ? "live" : c.date.slice(0, 4)); });
  names.forEach((nm, i) => tx(svg, { x: m.l - 6, y: m.t + i * (ch + g) + 10, "text-anchor": "end", style: "font:10.5px var(--f-mono);fill:var(--ink2)" }, nm));
}
function exposurePlot(host) {
  const H = D.history;
  plot(host, { h: 220, label: "Exposure", dates: H.dates, series: [{ k: "e", short: "Exposure", color: "--cu", w: 1.4, values: H.exposure }], min: 0, max: 1,
    ticks: () => [0, .2, .4, .6, .8, 1], tick: (v) => (v * 100).toFixed(0) + "%", fmt: (v) => (v * 100).toFixed(0) + "%", yTitle: "Invested (% of equity)",
    bands: [{ from: H.segments.replay[0], label: "replay" }] });
}
function breakdown(host, key) {
  const H = holdings(), agg = {}; H.forEach(p => agg[p[key]] = (agg[p[key]] || 0) + p.w); agg.Cash = D.live.cash_weight;
  host.innerHTML = `<table><thead><tr><th>${key === "sub" ? "Function" : "Country"}</th><th class="r">Weight</th><th style="width:45%"></th></tr></thead><tbody>${Object.entries(agg)
    .sort((a, b) => (a[0] === "Cash") - (b[0] === "Cash") || b[1] - a[1]).map(([k, v]) => `<tr><th>${k}</th><td class="r">${(v * 100).toFixed(1)}%</td>
    <td><span style="display:block;height:9px;width:${(v * 100).toFixed(1)}%;background:var(${k === "Cash" ? "--ink2" : "--cu"})"></span></td></tr>`).join("")}</tbody></table>`;
}

/* ---------------- boot ---------------- */
function renderMetrics() {
  const S = D.history.stats, L = D.live, inv = L.positions.reduce((a, p) => a + p.weight, 0);
  const avgExp = D.history.exposure.reduce((a, b) => a + b, 0) / D.history.exposure.length;
  const F = {
    "cagr": pct(S.full.strategy.cagr), "soxx-cagr": pct(S.full.soxx.cagr), "ewm-cagr": pct(S.full.ewm.cagr), "sharpe": S.full.strategy.sharpe.toFixed(2),
    "wf-dd": pct(S.walkforward.strategy.max_dd), "wf-soxx-dd": pct(S.walkforward.soxx.max_dd), "full-dd": pct(S.full.strategy.max_dd),
    "wf-cagr": pct(S.walkforward.strategy.cagr), "wf-ewm-cagr": pct(S.walkforward.ewm.cagr), "wf-sharpe": S.walkforward.strategy.sharpe.toFixed(2), "wf-ewm-sharpe": S.walkforward.ewm.sharpe.toFixed(2),
    "avg-exp": (avgExp * 100).toFixed(0) + "%", "inv": (inv * 100).toFixed(1) + "%",
    "paper-nav": "$" + L.paper_nav.toFixed(2), "paper-chg": pct(L.paper_change, 2), "sim-nav": "$" + D.history.series.strategy.at(-1).toFixed(2),
    "asof-sim": fdate(D.as_of_sim), "asof-live": fdate(L.as_of.slice(0, 10)),
    "last-reb": fdate(L.last_rebalance), "next-due": fdate(L.next_due), "beta": S.full.strategy.beta.toFixed(2), "turn": D.walkforward.turnover.toFixed(1) + "×",
    "wf-ic": "+" + D.walkforward.ic.mean.toFixed(3), "wf-ic-t": D.walkforward.ic.t.toFixed(2), "wf-ic-n": String(D.walkforward.ic.n),
    "rp-tot": pct(D.replay.stats.strategy_net.total_return), "rp-ewm": pct(D.replay.stats.ew30_exposure_matched.total_return), "rp-soxx": pct(D.replay.stats.soxx.total_return),
    "rp-pct": Math.round(D.replay.stats.random_picks_total_return.strategy_percentile * 100) + "th", "rp-ic": "+" + D.replay.stats.signal_ic.mean.toFixed(3), "rp-ic-t": D.replay.stats.signal_ic.t.toFixed(2),
    "c0": pct(D.replay.cost_sensitivity["0"].total_return), "c10": pct(D.replay.cost_sensitivity["10"].total_return), "c50": pct(D.replay.cost_sensitivity["50"].total_return),
  };
  for (const k in F) document.querySelectorAll(`[data-f="${k}"]`).forEach(e => e.textContent = F[k]);
}
function labelTables() {
  document.querySelectorAll(".tbl table").forEach(table => {
    const head = table.querySelector("thead tr") || [...table.rows].find(row =>
      row.cells.length && [...row.cells].every(cell => cell.tagName === "TH"));
    if (!head) return;
    if (!head.closest("thead")) {
      head.classList.add("mobile-head");
      [...head.cells].forEach(cell => { cell.scope = "col"; });
    }
    const labels = [...head.cells].map((cell, i) => cell.innerText.trim() || `Column ${i + 1}`);
    [...table.rows].filter(row => row !== head && row.closest("tbody")).forEach(row => {
      [...row.cells].forEach((cell, i) => {
        const label = labels[i] || "";
        cell.dataset.label = label;
        if (label) cell.setAttribute("aria-label", `${label}: ${cell.innerText.trim()}`);
      });
    });
  });
}
const PAGES = {
  overview() { typical($("#typical")); pinout($("#pinout")); pinMini($("#pinmini")); compareTable($("#compare")); onTheme(() => pinout($("#pinout"))); },
  performance() { navFigures($("#fig-nav"), { dd: true }); elecTable($("#elec")); trailingTable($("#trailing")); calendarTable($("#calendar")); monthlyTable($("#monthly")); navHistory($("#navhist")); },
  approach() { blockDiagram($("#block")); onTheme(() => blockDiagram($("#block"))); },
  portfolio() { pinout($("#pinout")); pinTable($("#pins")); breakdown($("#by-sub"), "sub"); breakdown($("#by-country"), "country"); rotation($("#rot")); exposurePlot($("#expo"));
    onTheme(() => { pinout($("#pinout")); rotation($("#rot")); exposurePlot($("#expo")); }); },
  research() {}, notices() {},
};
fetch("assets/data.json").then(r => r.json()).then(d => { D = d; renderMetrics(); PAGES[$("[data-page]")?.dataset.page]?.(); labelTables(); })
  .catch(e => $("main")?.insertAdjacentHTML("afterbegin", `<p class="notes">Data failed to load (${e.message}). Reload the page.</p>`));
})();
