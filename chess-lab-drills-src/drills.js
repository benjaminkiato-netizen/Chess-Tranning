// Chess Lab · Drills: practise the lines you send from Study, over and over, grouped by opening.
// A separate file on purpose: it never touches the main Chess Lab build. Study exposes the
// current line through window.__studyLine(), and the move sounds through window.__chessSound().
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';

const KEY = 'chesslab.drills';
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY = 864e5;

// ---------- storage ----------
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Array.isArray(d.lines)) return d; } catch { /* fresh */ }
  return { lines: [], best: 0 };
}
let D = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch { /* full */ } }
window.addEventListener('storage', (e) => { if (e.key === KEY) { D = load(); if (!practice) renderHome(); } });   // synced from another device

// ---------- openings (same data as the Openings page) ----------
let OPEN = null, openLoading = null;
const posKey = (fen) => fen.split(' ').slice(0, 3).join(' ');
function loadOpenings() {
  openLoading ||= fetch('openings.json?v=591a9599').then((r) => r.json()).then((j) => { OPEN = j; }).catch(() => { OPEN = {}; });
  return openLoading;
}
function openingOf(moves) {
  const c = new Chess(); let hit = null;
  const look = () => { const v = OPEN?.[posKey(c.fen())]; if (v) hit = v; };
  look();
  for (const u of moves) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; } look(); }
  if (!hit) return { eco: '', name: 'Unclassified', family: 'Unclassified' };
  const [eco, name] = hit.split('|');
  return { eco, name, family: name.split(':')[0].trim() };
}
const sanList = (moves) => { const c = new Chess(); const out = []; for (const u of moves) { try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; } } return out; };
const fenAfter = (moves) => { const c = new Chess(); for (const u of moves) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; } } return c.fen(); };
const lineText = (sans, from = 0) => sans.map((s, k) => ((k % 2 === 0) ? `${k / 2 + 1}.${s}` : s)).slice(from).join(' ');

// ---------- adding lines (from Study) ----------
async function addLine(moves, color) {
  await loadOpenings();
  const same = (a, b) => a.length <= b.length && a.every((u, k) => u === b[k]);
  for (const l of D.lines) {
    if (l.color !== color) continue;
    if (same(moves, l.moves)) return { status: 'covered', line: l };                  // already drilled (same or longer line)
    if (same(l.moves, moves)) {                                                        // longer version of an existing line
      Object.assign(l, { moves, sans: sanList(moves), ...openingOf(moves) });
      save(); return { status: 'extended', line: l };
    }
  }
  const line = { id: Math.random().toString(36).slice(2, 10), moves, sans: sanList(moves), color, ...openingOf(moves),
    added: Date.now(), tries: 0, clean: 0, lastAt: 0, due: 0, ivl: 0 };
  D.lines.push(line); save();
  return { status: 'added', line };
}
function toast(msg) {
  let t = $('drill-toast');
  if (!t) { t = document.createElement('div'); t.id = 'drill-toast'; document.body.appendChild(t); }
  t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3200);
}
function hookStudy() {
  const btn = $('st-to-drills'); if (!btn) return;
  btn.addEventListener('click', async () => {
    const L = window.__studyLine?.();
    if (!L || !L.moves.length) { toast('Step to the last move of the line you want to drill, then send it.'); return; }
    const color = L.orientation === 'black' ? 'black' : 'white';
    const r = await addLine(L.moves, color);
    const fam = r.line.family, n = D.lines.filter((l) => l.family === fam && l.color === color).length;
    toast(r.status === 'covered' ? `Already in your <b>${esc(fam)}</b> drills.`
      : `${r.status === 'extended' ? 'Extended a line in' : 'Sent to'} <b>${esc(fam)}</b> drills (${n} line${n === 1 ? '' : 's'}, you play ${color}). <a href="#" id="drill-toast-go">Practise ▸</a>`);
    $('drill-toast-go')?.addEventListener('click', (e) => { e.preventDefault(); openTab(); startFamily(fam, color); });
    if (!practice) renderHome();
  });
}
function openTab() { document.querySelector('.tab[data-tab="drills"]')?.click(); }

// ---------- home: one card per opening (like the Openings page) ----------
const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
function miniBoard(fen, orient) {
  let html = '';
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      const x = orient === 'black' ? 7 - f : f, y = orient === 'black' ? 7 - r : r;
      html += `<piece class="${ch === ch.toUpperCase() ? 'white' : 'black'} ${PIECE[ch.toLowerCase()]}" style="transform:translate(${x * 100}%,${y * 100}%)"></piece>`;
      f++;
    }
  });
  return `<div class="op-board cg-wrap">${html}</div>`;
}
function groups() {
  const G = new Map();
  for (const l of D.lines) {
    const k = l.family + '|' + l.color;
    if (!G.has(k)) G.set(k, { family: l.family, color: l.color, lines: [], ecos: new Set() });
    const g = G.get(k); g.lines.push(l); if (l.eco) g.ecos.add(l.eco);
  }
  return [...G.values()].sort((a, b) => b.lines.length - a.lines.length || a.family.localeCompare(b.family));
}
function renderHome() {
  practice = null;
  $('drill-home').hidden = false; $('drill-run').hidden = true;
  const G = groups();
  $('drill-count').textContent = D.lines.length;
  $('drill-best').textContent = D.best || 0;
  const now = Date.now();
  $('drill-grid').innerHTML = G.length ? G.map((g) => {
    // the board shows where the lines start to split (their shared start), or the opening position
    let k = 0; const first = g.lines[0].moves;
    while (k < first.length && g.lines.every((l) => l.moves[k] === first[k])) k++;
    const fen = fenAfter(first.slice(0, g.lines.length > 1 ? k : Math.min(first.length, 8)));
    const tries = g.lines.reduce((a, l) => a + l.tries, 0), clean = g.lines.reduce((a, l) => a + l.clean, 0);
    const due = g.lines.filter((l) => (l.due || 0) <= now).length;
    const last = Math.max(...g.lines.map((l) => l.lastAt || 0));
    return `<button class="op-card card" data-fam="${esc(g.family)}" data-color="${g.color}">
        ${miniBoard(fen, g.color)}
        <div class="op-info">
          <div class="op-name">${esc(g.family)}${g.ecos.size ? ` <span class="op-eco">${esc([...g.ecos].sort()[0])}</span>` : ''}</div>
          <div class="op-counts"><b>${g.lines.length}</b> line${g.lines.length === 1 ? '' : 's'} · you play <b>${g.color}</b></div>
          <div class="op-meta">${tries ? `${Math.round(100 * clean / tries)}% clean runs · ` : 'Not practised yet · '}${due ? `<b class="dr-due">${due} due</b>` : 'all fresh'}${last ? ` · ${new Date(last).toLocaleDateString()}` : ''}</div>
        </div>
        <span class="op-go">Drill ▸</span>
      </button>`;
  }).join('') : `<div class="card dr-empty">
      <b>No drills yet.</b>
      <p class="muted">In <b>Study</b>, step to the last move of a line you want to know by heart and click <b>🎯 Send to Drills</b>.
      Lines are grouped by opening here, and you play the side the Study board is turned to.</p></div>`;
  $('drill-grid').querySelectorAll('.op-card').forEach((c) => c.addEventListener('click', () => startFamily(c.dataset.fam, c.dataset.color)));
}

// ---------- practice ----------
let cg = null, practice = null;
function board() {
  if (cg) return cg;
  cg = Chessground($('drill-board'), {
    coordinates: true, animation: { enabled: true, duration: 200 },
    movable: { free: false, showDests: true, events: { after: onUserMove } },
    premovable: { enabled: false }, highlight: { lastMove: true, check: true }, drawable: { enabled: true },
  });
  if (window.ResizeObserver) new ResizeObserver(() => cg.redrawAll()).observe($('drill-board'));
  return cg;
}
function dests(c) { const m = new Map(); for (const mv of c.moves({ verbose: true })) { if (!m.has(mv.from)) m.set(mv.from, []); m.get(mv.from).push(mv.to); } return m; }
const sound = (san) => { try { window.__chessSound?.(san); } catch { /* no sound */ } };

function startFamily(family, color) {
  const lines = D.lines.filter((l) => l.family === family && l.color === color);
  if (!lines.length) return renderHome();
  // due / shaky lines first, then the rest in random order
  const now = Date.now();
  lines.sort((a, b) => ((a.due || 0) > now) - ((b.due || 0) > now) || (a.clean / (a.tries || 1)) - (b.clean / (b.tries || 1)) || Math.random() - .5);
  practice = { family, color, queue: lines.map((l) => l.id), qi: 0, streak: 0, round: 1, done: 0, cleanCount: 0 };
  $('drill-home').hidden = true; $('drill-run').hidden = false;
  $('dr-title').textContent = family;
  board().set({ orientation: color });
  startLine();
}
function curLine() { return D.lines.find((l) => l.id === practice.queue[practice.qi]); }
function startLine() {
  const l = curLine(); if (!l) return nextLine();
  Object.assign(practice, { game: new Chess(), k: 0, wrong: {}, clean: true, finished: false, lineId: l.id, busy: false });
  board().set({ fen: practice.game.fen(), lastMove: undefined, check: false, highlight: { custom: new Map() }, drawable: { autoShapes: [] } });
  renderSide();
  setStatus(l.color === 'white' ? 'Your move.' : 'Watch the first move…');
  step();
}
// play the opponent's move(s) from the line; stop when it's your turn
function step() {
  const P = practice, l = curLine(); if (!P || !l) return;
  if (P.k >= l.moves.length) return finishLine();
  const turn = P.game.turn() === 'w' ? 'white' : 'black';
  if (turn !== l.color) {
    P.busy = true; lock();
    setTimeout(() => {
      if (practice !== P || P.lineId !== l.id) return;
      const u = l.moves[P.k];
      const mv = P.game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      P.k++; P.busy = false; sound(mv.san);
      show([mv.from, mv.to]);
      if (P.k >= l.moves.length) return finishLine();
      setStatus('Your move.');
      unlock();
    }, P.k === 0 ? 450 : 380);
  } else unlock();
}
function lock() { board().set({ movable: { color: undefined, dests: new Map() } }); }
function unlock() { const P = practice; board().set({ turnColor: P.game.turn() === 'w' ? 'white' : 'black', movable: { color: curLine().color, dests: dests(P.game) } }); }
function show(lastMove, custom) {
  const P = practice, c = P.game;
  board().set({ fen: c.fen(), turnColor: c.turn() === 'w' ? 'white' : 'black', lastMove, check: c.inCheck() ? (c.turn() === 'w' ? 'white' : 'black') : false,
    highlight: { custom: custom || new Map() } });
}
function onUserMove(orig, dest) {
  const P = practice, l = curLine(); if (!P || !l || P.busy || P.finished) return;
  const want = l.moves[P.k];
  const piece = P.game.get(orig);
  const promo = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? (want && want.slice(0, 4) === orig + dest ? want[4] || 'q' : 'q') : undefined;
  const played = orig + dest + (promo || '');
  let ok = played === want || (played.slice(0, 4) === want?.slice(0, 4) && !promo);
  // another of your lines in this opening that follows the same moves so far and plays this: switch to it
  if (!ok) {
    const prefix = l.moves.slice(0, P.k);
    const alt = D.lines.find((x) => x.id !== l.id && x.family === l.family && x.color === l.color && x.moves.length > P.k
      && prefix.every((u, k) => u === x.moves[k]) && x.moves[P.k].slice(0, 4) === played.slice(0, 4));
    if (alt) {   // swap places in the queue: you practise that line now, this one later
      const ai = P.queue.indexOf(alt.id);
      P.queue[P.qi] = alt.id; if (ai >= 0) P.queue[ai] = l.id;
      P.lineId = alt.id; ok = true;
    }
  }
  if (!ok) return wrongMove(orig, dest);
  const mv = P.game.move({ from: orig, to: dest, promotion: promo });
  P.k++; sound(mv.san);
  P.streak++; if (P.streak > (D.best || 0)) { D.best = P.streak; save(); }
  show([orig, dest]);
  renderSide();
  if (P.k >= curLine().moves.length) return finishLine();
  setStatus('Correct.', 'good');
  step();
}
function wrongMove(orig, dest) {
  const P = practice, l = curLine();
  P.wrong[P.k] = (P.wrong[P.k] || 0) + 1; P.clean = false; P.streak = 0;
  const n = P.wrong[P.k];
  const custom = new Map([[dest, 'dr-bad']]);
  const want = l.moves[P.k];
  const helping = n >= 3;   // from the 3rd miss on this move, its squares stay lit until you play it
  if (helping) { custom.set(want.slice(0, 2), 'dr-hint'); custom.set(want.slice(2, 4), 'dr-hint'); }
  board().set({ fen: P.game.fen(), lastMove: P.k ? [l.moves[P.k - 1].slice(0, 2), l.moves[P.k - 1].slice(2, 4)] : undefined, highlight: { custom } });
  unlock();
  renderSide();
  setStatus(helping ? 'Not that one. The highlighted squares show the move.' : `Not that one. Try again (${n} of 3 before a hint).`, 'bad');
  clearTimeout(P.flashT);
  // clear the red flash shortly after - unless you've missed again since, or the hint is up
  if (!helping) { const k = P.k; P.flashT = setTimeout(() => { if (practice === P && !P.finished && P.k === k && (P.wrong[k] || 0) === n) board().set({ highlight: { custom: new Map() } }); }, 700); }
}
function finishLine() {
  const P = practice, l = curLine();
  P.finished = true; lock();
  l.tries++; l.lastAt = Date.now();
  if (P.clean) { l.clean++; l.ivl = Math.min(60, Math.max(1, (l.ivl || 0) * 2 || 1)); P.cleanCount++; }
  else l.ivl = 0;
  l.due = Date.now() + (l.ivl || 0) * DAY;
  P.done++; save(); renderSide();
  setStatus(P.clean ? 'Line complete, no mistakes ✓' : 'Line complete. It comes back sooner, since you missed a move.', P.clean ? 'good' : '');
  P.timer = setTimeout(() => { if (practice === P) nextLine(); }, P.clean ? 1100 : 1800);
}
function nextLine() {
  const P = practice; if (!P) return;
  clearTimeout(P.timer);
  P.qi++;
  if (P.qi >= P.queue.length) {
    // round over: missed lines first next round
    P.round++; P.qi = 0;
    const lines = P.queue.map((id) => D.lines.find((l) => l.id === id)).filter(Boolean);
    lines.sort((a, b) => (a.ivl || 0) - (b.ivl || 0) || Math.random() - .5);
    P.queue = lines.map((l) => l.id);
    toast(`Round ${P.round - 1} done: ${P.cleanCount} of ${lines.length} lines clean. Going again.`);
    P.cleanCount = 0;
  }
  startLine();
}
function showMove() {
  const P = practice, l = curLine(); if (!P || P.finished || P.busy) return;
  P.wrong[P.k] = 3; P.clean = false; P.streak = 0;
  const want = l.moves[P.k];
  board().set({ highlight: { custom: new Map([[want.slice(0, 2), 'dr-hint'], [want.slice(2, 4), 'dr-hint']]) } });
  renderSide(); setStatus('The highlighted squares show the move.', 'bad');
}
function setStatus(t, cls = '') { const s = $('dr-status'); s.textContent = t; s.className = 'dr-status ' + cls; }
function renderSide() {
  const P = practice, l = curLine(); if (!P || !l) return;
  const lines = P.queue.map((id) => D.lines.find((x) => x.id === id)).filter(Boolean);
  $('dr-sub').textContent = `${l.name} · you play ${l.color}`;
  $('dr-prog').textContent = `Line ${P.qi + 1} of ${lines.length}${P.round > 1 ? ` · round ${P.round}` : ''}`;
  $('dr-streak').textContent = P.streak;
  $('dr-best').textContent = D.best || 0;
  // the line so far: moves played are shown, the rest stay hidden until you get there
  $('dr-line').innerHTML = l.sans.map((s, k) => {
    const num = k % 2 === 0 ? `<span class="dr-num">${k / 2 + 1}.</span>` : '';
    const cls = k < P.k ? 'done' : k === P.k ? 'now' : 'todo';
    return `${num}<span class="dr-mv ${cls}${P.wrong[k] ? ' missed' : ''}">${k < P.k ? esc(s) : '…'}</span>`;
  }).join(' ');
  $('dr-list').innerHTML = lines.map((x, j) => `<li class="${x.id === l.id ? 'on' : ''}">
      <span class="dr-li-txt" title="${esc(lineText(x.sans))}">${esc(lineText(x.sans).slice(0, 70))}${lineText(x.sans).length > 70 ? '…' : ''}</span>
      <span class="muted">${x.tries ? `${x.clean}/${x.tries}` : 'new'}</span>
      <button class="link dr-del" data-id="${x.id}" title="Remove this line from your drills">✕</button></li>`).join('');
  $('dr-list').querySelectorAll('.dr-del').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const x = D.lines.find((y) => y.id === b.dataset.id);
    if (!x || !confirm(`Remove this line from your drills?\n\n${lineText(x.sans)}`)) return;
    D.lines = D.lines.filter((y) => y.id !== x.id); save();
    const left = D.lines.filter((y) => y.family === P.family && y.color === P.color);
    if (!left.length) return renderHome();
    const wasCur = x.id === l.id;
    P.queue = P.queue.filter((id) => id !== x.id); if (P.qi >= P.queue.length) P.qi = 0;
    wasCur ? startLine() : renderSide();
  }));
}

// ---------- wire up ----------
function init() {
  hookStudy();
  $('dr-back').addEventListener('click', () => { if (practice) clearTimeout(practice.timer); renderHome(); });
  $('dr-next').addEventListener('click', () => { if (practice) nextLine(); });
  $('dr-restart').addEventListener('click', () => { if (practice) { clearTimeout(practice.timer); startLine(); } });
  $('dr-show').addEventListener('click', showMove);
  document.addEventListener('keydown', (e) => {
    if (!practice || $('drills').classList.contains('active') === false || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'f' || e.key === 'F') board().toggleOrientation();
  });
  loadOpenings().then(renderHome);
  renderHome();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
