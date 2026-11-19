/* Board colors and piece set for every board on the site (chess page, Chess Lab, preview boards).
 * Board: sets --sq-l / --sq-d on <html>; the board CSS reads those.
 * Pieces: sets --pc-wk … --pc-bp (read by chess-lab/pieces.css) and BoardTheme.pieceUrl(k) for <img> boards.
 * Choices are saved as chesslab.boardTheme / chesslab.pieceSet, so ☁ Sync carries them to your other browsers.
 * Load in <head> so boards never flash the old look. BoardTheme.open() shows the picker.
 */
(() => {
  'use strict';
  const KEY = 'chesslab.boardTheme', PKEY = 'chesslab.pieceSet', V = 6;
  const BASE = new URL('chess-lab/pieces/', document.currentScript ? document.currentScript.src : location.href).href;
  const THEMES = [
    { id: 'classic', name: 'Classic Green', l: '#eed5a4', d: '#355a31' },
    { id: 'blue', name: 'Blue', l: '#bed8f8', d: '#264675' },
    { id: 'gray', name: 'Gray', l: '#d1d1d2', d: '#403f44' },
    { id: 'brown', name: 'Brown', l: '#edd2b3', d: '#5f4130' },
    { id: 'purple', name: 'Purple', l: '#d9c3ef', d: '#4b2d6e' },
    { id: 'red', name: 'Red', l: '#f3d7ba', d: '#761d1d' },
    { id: 'teal', name: 'Teal', l: '#bae5d8', d: '#145756' },
    { id: 'bw', name: 'Black & White', l: '#e3e3e3', d: '#2c2c2b' },
    { id: 'darkgreen', name: 'Dark Green', l: '#c3e4ae', d: '#1d4a1e' },
    { id: 'slate', name: 'Slate', l: '#c1cfdb', d: '#2f4252' },
  ];
  const SETS = [
    { id: 'cartoon', name: 'Cartoon' },
    { id: 'geometric', name: 'Geometric' },
    { id: 'outlined', name: 'Outlined' },
  ];
  const KEYS = ['w', 'b'].flatMap((c) => [...'kqrbnp'].map((p) => c + p));
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const curSet = () => { const s = read(PKEY, 'cartoon'); return SETS.some((x) => x.id === s) ? s : 'cartoon'; };
  const pieceUrl = (k, set) => `${BASE}${set || curSet()}/${k}.png?v=${V}`;

  function applyBoard(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    const s = document.documentElement.style;
    s.setProperty('--sq-l', t.l); s.setProperty('--sq-d', t.d);
    document.querySelectorAll('.bt-swatch[data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === t.id));
  }
  function applyPieces(set) {
    const s = document.documentElement.style;
    for (const k of KEYS) s.setProperty(`--pc-${k}`, `url("${pieceUrl(k, set)}")`);
    // boards drawn with <img> (chess page mini boards and play board): swap them in place
    document.querySelectorAll('img').forEach((im) => {
      const m = /chess-lab\/pieces\/(?:[a-z]+\/)?([wb][kqrbnp])\.png/.exec(im.getAttribute('src') || '');
      if (m && !im.closest('.door, #bt-dialog')) im.src = pieceUrl(m[1], set);
    });
    document.querySelectorAll('.bt-swatch[data-set]').forEach((b) => b.classList.toggle('on', b.dataset.set === set));
  }
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };
  applyBoard(read(KEY, 'classic'));
  applyPieces(curSet());
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) applyBoard(read(KEY, 'classic'));
    if (e.key === PKEY) applyPieces(curSet());
  });

  function checker(t) { return `background-color:${t.l};background-image:conic-gradient(${t.d} 0 25%,transparent 0 50%,${t.d} 0 75%,transparent 0)`; }
  function open() {
    let d = document.getElementById('bt-dialog');
    if (!d) {
      const css = document.createElement('style');
      css.textContent = `
#bt-dialog{background:#16191e;color:#e6e9ee;border:1px solid #2b313a;border-radius:14px;padding:18px;width:min(580px,calc(100vw - 24px));font:14px/1.4 system-ui,sans-serif}
#bt-dialog::backdrop{background:rgba(0,0,0,.55)}
#bt-dialog h2{margin:0 0 10px;font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#9aa3af}
#bt-dialog h2:not(:first-child){margin-top:18px}
.bt-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
@media (max-width:520px){.bt-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.bt-swatch{background:none;border:2px solid transparent;border-radius:10px;padding:6px;cursor:pointer;color:inherit;font:600 12px system-ui,sans-serif;display:flex;flex-direction:column;gap:6px;align-items:center}
.bt-swatch:hover{border-color:#3a414b}
.bt-swatch.on{border-color:#8b7cf6}
.bt-swatch i{display:block;width:100%;aspect-ratio:1;border-radius:6px;background-size:50% 50%}
.bt-swatch .bt-pcs{display:grid;grid-template-columns:1fr 1fr;width:100%;aspect-ratio:2/1;border-radius:6px;overflow:hidden}
.bt-pcs span{background:var(--sq-l,#eed5a4);display:flex;align-items:flex-end;justify-content:center}
.bt-pcs span:nth-child(2){background:var(--sq-d,#355a31)}
.bt-pcs img{width:100%;height:100%;object-fit:contain}
.bt-row{display:flex;justify-content:flex-end;margin-top:16px}
.bt-row button{background:#22272e;color:#e6e9ee;border:1px solid #2b313a;border-radius:8px;padding:8px 14px;font:600 14px system-ui,sans-serif;cursor:pointer}`;
      document.head.appendChild(css);
      d = document.createElement('dialog'); d.id = 'bt-dialog';
      d.innerHTML = `<h2>Board</h2><div class="bt-grid">${THEMES.map((t) =>
        `<button class="bt-swatch" data-id="${t.id}"><i style="${checker(t)}"></i>${t.name}</button>`).join('')}</div>
        <h2>Pieces</h2><div class="bt-grid">${SETS.map((s) =>
        `<button class="bt-swatch" data-set="${s.id}"><span class="bt-pcs"><span><img alt="" src="${pieceUrl('wn', s.id)}"></span><span><img alt="" src="${pieceUrl('bk', s.id)}"></span></span>${s.name}</button>`).join('')}</div>
        <div class="bt-row"><button id="bt-done">Done</button></div>`;
      d.addEventListener('click', (e) => {
        const b = e.target.closest('.bt-swatch');
        if (b && b.dataset.id) { save(KEY, b.dataset.id); applyBoard(b.dataset.id); }
        if (b && b.dataset.set) { save(PKEY, b.dataset.set); applyPieces(b.dataset.set); }
        if (e.target.id === 'bt-done' || e.target === d) d.close();
      });
      document.body.appendChild(d);
    }
    applyBoard(read(KEY, 'classic')); applyPieces(curSet());
    d.showModal();
  }
  window.BoardTheme = { open, pieceUrl, themes: THEMES, sets: SETS };
})();
