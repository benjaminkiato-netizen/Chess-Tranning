/* Board colors for every board on the site (chess page, Chess Lab, preview boards).
 * Sets --sq-l / --sq-d on <html>; the board CSS reads those. The choice is saved as
 * chesslab.boardTheme, so ☁ Sync carries it to your other browsers.
 * Load in <head> so the board never flashes the old colors. BoardTheme.open() shows the picker.
 */
(() => {
  'use strict';
  const KEY = 'chesslab.boardTheme';
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
  const get = () => { try { return localStorage.getItem(KEY) || 'classic'; } catch { return 'classic'; } };
  function apply(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    const s = document.documentElement.style;
    s.setProperty('--sq-l', t.l); s.setProperty('--sq-d', t.d);
    document.querySelectorAll('.bt-swatch').forEach((b) => b.classList.toggle('on', b.dataset.id === t.id));
  }
  function set(id) { try { localStorage.setItem(KEY, id); } catch { /* */ } apply(id); }
  apply(get());
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(get()); });

  function open() {
    let d = document.getElementById('bt-dialog');
    if (!d) {
      const css = document.createElement('style');
      css.textContent = `
#bt-dialog{background:#16191e;color:#e6e9ee;border:1px solid #2b313a;border-radius:14px;padding:18px;width:min(560px,calc(100vw - 24px));font:14px/1.4 system-ui,sans-serif}
#bt-dialog::backdrop{background:rgba(0,0,0,.55)}
#bt-dialog h2{margin:0 0 12px;font-size:18px}
.bt-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
@media (max-width:520px){.bt-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.bt-swatch{background:none;border:2px solid transparent;border-radius:10px;padding:6px;cursor:pointer;color:inherit;font:600 12px system-ui,sans-serif;display:flex;flex-direction:column;gap:6px;align-items:center}
.bt-swatch:hover{border-color:#3a414b}
.bt-swatch.on{border-color:#8b7cf6}
.bt-swatch i{display:block;width:100%;aspect-ratio:1;border-radius:6px;background-size:50% 50%}
.bt-row{display:flex;justify-content:flex-end;margin-top:14px}
.bt-row button{background:#22272e;color:#e6e9ee;border:1px solid #2b313a;border-radius:8px;padding:8px 14px;font:600 14px system-ui,sans-serif;cursor:pointer}`;
      document.head.appendChild(css);
      d = document.createElement('dialog'); d.id = 'bt-dialog';
      d.innerHTML = `<h2>Board colors</h2><div class="bt-grid">${THEMES.map((t) =>
        `<button class="bt-swatch" data-id="${t.id}"><i style="background-color:${t.l};background-image:conic-gradient(${t.d} 0 25%,transparent 0 50%,${t.d} 0 75%,transparent 0)"></i>${t.name}</button>`).join('')}</div>
        <div class="bt-row"><button id="bt-done">Done</button></div>`;
      d.addEventListener('click', (e) => {
        const b = e.target.closest('.bt-swatch'); if (b) set(b.dataset.id);
        if (e.target.id === 'bt-done' || e.target === d) d.close();
      });
      document.body.appendChild(d);
    }
    apply(get());
    d.showModal();
  }
  window.BoardTheme = { open, set, themes: THEMES };
})();
