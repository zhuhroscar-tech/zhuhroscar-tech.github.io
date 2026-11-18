/*
 * "You are visitor #N" counter.
 * Usage: <span id="visitor-count"></span>  <script src="visitor.js" defer></script>
 * The count lives at abacus.jasoncameron.dev (free, no account). Each browser is
 * counted once: its number is remembered locally, so reloads don't inflate the
 * count and a returning visitor keeps the same number. If the service is down,
 * the line simply stays empty.
 */
(function () {
  const el = document.getElementById('visitor-count');
  if (!el) return;
  const API = 'https://abacus.jasoncameron.dev/hit/zhuhroscar-tech/oscar-visitors';
  const KEY = 'oscar-visitor-number';
  const show = (n) => { el.textContent = 'You are visitor #' + Number(n).toLocaleString('en-US'); };

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked: count this visit anyway */ }
  if (saved && /^\d+$/.test(saved)) { show(saved); return; }

  fetch(API)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => {
      if (typeof d.value !== 'number') return;
      try { localStorage.setItem(KEY, String(d.value)); } catch (e) {}
      show(d.value);
    })
    .catch(() => {});
})();
