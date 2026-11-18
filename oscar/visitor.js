/*
 * "You are visitor #N · M visitors so far" counter.
 * Usage: <span id="visitor-count"></span>  <script src="visitor.js" defer></script>
 * The count lives at abacus.jasoncameron.dev (free, no account). Each browser is
 * counted once: its number is remembered locally, so reloads don't inflate the
 * count and a returning visitor keeps the same number, while the running total
 * is read fresh on every visit. If the service is down, the line stays empty.
 */
(function () {
  const el = document.getElementById('visitor-count');
  if (!el) return;
  const BASE = 'https://abacus.jasoncameron.dev';
  const PATH = '/zhuhroscar-tech/oscar-visitors';
  const KEY = 'oscar-visitor-number';
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const show = (mine, total) => {
    el.textContent = 'You are visitor #' + fmt(mine) +
      (total ? ' · ' + fmt(total) + (total === 1 ? ' visitor' : ' visitors') + ' so far' : '');
  };
  const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked: count this visit anyway */ }

  if (saved && /^\d+$/.test(saved)) {
    // returning visitor: keep their number, read the current total without counting again
    show(+saved);
    json(BASE + '/get' + PATH)
      .then((d) => { if (typeof d.value === 'number') show(+saved, Math.max(d.value, +saved)); })
      .catch(() => {});
    return;
  }

  // first visit from this browser: count it; the new value is both their number and the total
  json(BASE + '/hit' + PATH)
    .then((d) => {
      if (typeof d.value !== 'number') return;
      try { localStorage.setItem(KEY, String(d.value)); } catch (e) {}
      show(d.value, d.value);
    })
    .catch(() => {});
})();
