/* Practice hub sync
 * Keeps this site's data (chess page, Chess Lab, trade journal) in two private GitHub gists so it
 * follows you to any browser. Everything is encrypted in the browser with your sync password
 * (AES-GCM, key from PBKDF2) before upload: GitHub only ever stores unreadable data.
 *  - data gist:  hub-data.json  (localStorage data + trade journal, without screenshots)
 *  - image gist: one file per journal screenshot (uploaded once, so syncing stays small)
 * Stays on this computer only: the GitHub key, the sync password/key, your Lichess token,
 * the puzzle pool cache and engine-analysis cache, Chess Lab's study history snapshots.
 */
(() => {
  'use strict';
  const API = 'https://api.github.com';
  const DESC = 'Practice hub sync (encrypted): data';
  const DESC_IMG = 'Practice hub sync (encrypted): journal screenshots';
  const DATA_FILE = 'hub-data.json';
  const LS = {
    token: 'hubSync.token', key: 'hubSync.key', salt: 'hubSync.salt', gist: 'hubSync.gist', imgGist: 'hubSync.imgGist',
    device: 'hubSync.device', lastHash: 'hubSync.lastHash', lastAt: 'hubSync.lastAt', imgs: 'hubSync.imgs', user: 'hubSync.user',
  };
  const SYNCED_PREFIXES = ['dailyPuzzleDrill.', 'chesslab.'];
  const NEVER_SYNC = new Set(['chesslab.inbox', 'chesslab.studies.history']);
  const PUZZLE_KEY = 'dailyPuzzleDrill.v1';
  const PUZZLE_LOCAL_ONLY = ['token', 'pool', 'ganalysis'];
  const JDB = 'nq-trade-journal';

  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { console.warn('sync: storage', e); } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } },
  };
  const isSynced = (k) => SYNCED_PREFIXES.some((p) => k.startsWith(p)) && !NEVER_SYNC.has(k);
  const connected = () => !!(ls.get(LS.token) && ls.get(LS.key) && ls.get(LS.gist));
  const device = () => { let d = ls.get(LS.device); if (!d) { d = Math.random().toString(36).slice(2, 10); ls.set(LS.device, d); } return d; };

  // ---------- crypto ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  async function deriveKey(password, saltB64) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 250000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  let keyCache = null;
  async function key() {
    if (keyCache) return keyCache;
    const raw = ls.get(LS.key); if (!raw) throw new Error('not connected');
    keyCache = await crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return keyCache;
  }
  async function encrypt(text, k) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k || await key(), enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function decrypt(box, k) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, k || await key(), unb64(box.ct));
    return dec.decode(pt);
  }
  async function sha(text) { return b64(await crypto.subtle.digest('SHA-256', enc.encode(text))); }

  // ---------- GitHub ----------
  async function gh(path, opts = {}, token) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token || ls.get(LS.token)}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (!res.ok) {
      const msg = res.status === 401 ? 'GitHub key is not valid (it may have expired)'
        : res.status === 403 || res.status === 404 ? 'GitHub key needs the "gist" permission'
          : `GitHub error ${res.status}`;
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  async function fileText(f) {
    if (!f) return null;
    if (!f.truncated && typeof f.content === 'string') return f.content;
    const r = await fetch(f.raw_url); if (!r.ok) throw new Error('could not download ' + f.filename);
    return r.text();
  }

  // ---------- trade journal (IndexedDB) ----------
  function openJournal() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(JDB, 1);
      // same schema as trading.html, so opening it here never breaks the journal page
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('trades', { keyPath: 'id' }); d.createObjectStore('kv'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function readJournal() {
    const db = await openJournal();
    try {
      const tx = db.transaction(['trades', 'kv'], 'readonly');
      const [trades, kvKeys, kvVals] = await Promise.all([reqP(tx.objectStore('trades').getAll()), reqP(tx.objectStore('kv').getAllKeys()), reqP(tx.objectStore('kv').getAll())]);
      const kv = {}; kvKeys.forEach((k, i) => { kv[k] = kvVals[i]; });
      const images = new Map();
      const plain = trades.map((t) => ({
        ...t,
        images: (t.images || []).map((im) => { if (im.blob) images.set(im.id, im.blob); return { id: im.id, type: im.blob?.type || '' }; }),
      }));
      plain.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return { kv, trades: plain, images };
    } finally { db.close(); }
  }
  async function writeJournal(kv, trades) {
    const db = await openJournal();
    try {
      const tx = db.transaction(['trades', 'kv'], 'readwrite');
      const ts = tx.objectStore('trades'), ks = tx.objectStore('kv');
      ts.clear(); ks.clear();
      for (const t of trades) ts.put(t);
      for (const [k, v] of Object.entries(kv)) ks.put(v, k);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    } finally { db.close(); }
  }
  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function dataURLToBlob(u) { return (await fetch(u)).blob(); }

  // ---------- snapshot of everything ----------
  function readLocal() {
    const local = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (isSynced(k)) local[k] = localStorage.getItem(k);
      }
    } catch { /* storage blocked */ }
    return local;
  }
  // Taken the moment this script runs (in <head>, before the page's own code), so the first
  // check isn't fooled by small things a page saves as it opens (like today's date).
  const atStart = readLocal();
  async function collect(localMap) {
    const local = { ...(localMap || readLocal()) };
    if (local[PUZZLE_KEY]) {
      try { const S = JSON.parse(local[PUZZLE_KEY]); for (const f of PUZZLE_LOCAL_ONLY) delete S[f]; local[PUZZLE_KEY] = JSON.stringify(S); } catch { /* keep as is */ }
    }
    let journal = { kv: {}, trades: [], images: new Map() };
    try { journal = await readJournal(); } catch (e) { console.warn('sync: journal', e); }
    const ordered = Object.fromEntries(Object.keys(local).sort().map((k) => [k, local[k]]));
    const payload = { local: ordered, journal: { kv: journal.kv, trades: journal.trades } };
    const text = JSON.stringify(payload);
    return { payload, text, images: journal.images, hash: await sha(text) };
  }
  const hasData = (snap) => snap.journal?.trades?.length || Object.keys(snap.payload.local).length;

  // ---------- push / pull ----------
  async function push(snap) {
    const savedAt = new Date().toISOString();
    // screenshots: upload new ones, remove deleted ones (one file each)
    const uploaded = new Set(JSON.parse(ls.get(LS.imgs) || '[]'));
    const wanted = new Set(snap.images.keys());
    const toAdd = [...wanted].filter((id) => !uploaded.has(id));
    const toDel = [...uploaded].filter((id) => !wanted.has(id));
    const imgGist = ls.get(LS.imgGist);
    let batch = {}, size = 0;
    const flush = async () => {
      if (!Object.keys(batch).length) return;
      await gh(`/gists/${imgGist}`, { method: 'PATCH', body: JSON.stringify({ files: batch }) });
      batch = {}; size = 0;
    };
    for (const id of toAdd) {
      const box = await encrypt(await blobToDataURL(snap.images.get(id)));
      const content = JSON.stringify(box);
      batch[`img-${id}.json`] = { content }; size += content.length;
      uploaded.add(id);
      if (size > 4_000_000) { await flush(); ls.set(LS.imgs, JSON.stringify([...uploaded])); }
    }
    for (const id of toDel) { batch[`img-${id}.json`] = null; uploaded.delete(id); }
    await flush();
    ls.set(LS.imgs, JSON.stringify([...uploaded]));
    // data
    const box = await encrypt(snap.text);
    const env = { app: 'practice-hub-sync', v: 1, savedAt, device: device(), salt: ls.get(LS.salt), ...box };
    await gh(`/gists/${ls.get(LS.gist)}`, { method: 'PATCH', body: JSON.stringify({ files: { [DATA_FILE]: { content: JSON.stringify(env) } } }) });
    ls.set(LS.lastHash, snap.hash);
    ls.set(LS.lastAt, savedAt);
  }

  async function remoteEnvelope(gistId, token) {
    const g = await gh(`/gists/${gistId}`, {}, token);
    const t = await fileText(g.files[DATA_FILE]);
    return t ? JSON.parse(t) : null;
  }

  // Replace this browser's data with the cloud copy.
  async function apply(env, k) {
    const payload = JSON.parse(await decrypt(env, k));
    // localStorage: replace synced keys, keep local-only puzzle fields (Lichess token, caches)
    let keepPuzzle = {};
    try { const cur = JSON.parse(ls.get(PUZZLE_KEY) || '{}'); for (const f of PUZZLE_LOCAL_ONLY) if (f in cur) keepPuzzle[f] = cur[f]; } catch { /* */ }
    const existing = []; for (let i = 0; i < localStorage.length; i++) existing.push(localStorage.key(i));
    for (const kk of existing) if (isSynced(kk) && !(kk in payload.local)) ls.del(kk);
    for (const [kk, v] of Object.entries(payload.local)) {
      if (kk === PUZZLE_KEY) { try { ls.set(kk, JSON.stringify({ ...JSON.parse(v), ...keepPuzzle })); continue; } catch { /* fall through */ } }
      ls.set(kk, v);
    }
    // journal: reuse screenshots already in this browser, download the rest
    const j = payload.journal || { kv: {}, trades: [] };
    const needIds = new Set(); j.trades.forEach((t) => (t.images || []).forEach((im) => needIds.add(im.id)));
    let localImgs = new Map();
    try { localImgs = (await readJournal()).images; } catch { /* */ }
    const missing = [...needIds].filter((id) => !localImgs.has(id));
    const remoteImgs = new Map();
    if (missing.length && ls.get(LS.imgGist)) {
      const g = await gh(`/gists/${ls.get(LS.imgGist)}`);
      for (const id of missing) {
        const f = g.files[`img-${id}.json`]; if (!f) continue;
        try { remoteImgs.set(id, await dataURLToBlob(await decrypt(JSON.parse(await fileText(f)), k))); } catch (e) { console.warn('sync: image', id, e); }
      }
    }
    const trades = j.trades.map((t) => ({
      ...t,
      images: (t.images || []).map((im) => ({ id: im.id, blob: localImgs.get(im.id) || remoteImgs.get(im.id) })).filter((im) => im.blob),
    }));
    await writeJournal(j.kv || {}, trades);
    ls.set(LS.imgs, JSON.stringify([...needIds]));
    const snap = await collect();
    ls.set(LS.lastHash, snap.hash);
    ls.set(LS.lastAt, env.savedAt);
  }

  // ---------- the regular check ----------
  let busy = false, conflictShown = false;
  let firstCheck = true;
  async function check({ quiet } = {}) {
    if (!connected() || busy) return;
    busy = true;
    try {
      const first = firstCheck; firstCheck = false;
      const snap = await collect();
      // on the first check, judge "changed here?" by the data as it was when the page opened
      const localChanged = (first ? (await collect(atStart)).hash : snap.hash) !== ls.get(LS.lastHash);
      if (!localChanged && quiet && !first) {
        // nothing to upload; still look for changes made in another browser now and then
        const lastLook = +(sessionStorage.getItem('hubSync.look') || 0);
        if (Date.now() - lastLook < 60_000) return;
      }
      sessionStorage.setItem('hubSync.look', String(Date.now()));
      const env = await remoteEnvelope(ls.get(LS.gist));
      const remoteNewer = env && env.savedAt > (ls.get(LS.lastAt) || '') && env.device !== device();
      if (remoteNewer && !localChanged) {
        chip('Loading changes from your other browser…', 'busy');
        await apply(env);
        chip('Updated from your other browser', 'ok');
        setTimeout(() => location.reload(), 600);
      } else if (remoteNewer && localChanged) {
        showConflict(env, snap);
      } else if (localChanged) {
        chip('Saving to GitHub…', 'busy');
        await push(snap);
        chip('Saved', 'ok');
      }
    } catch (e) {
      console.warn('sync', e);
      chip('Sync problem: ' + e.message, 'err', true);
    } finally { busy = false; }
  }

  // ---------- connect / disconnect ----------
  async function connect(token, password, onAsk) {
    token = token.trim();
    if (!token) throw new Error('Paste your GitHub key first.');
    if (password.length < 6) throw new Error('Choose a sync password of at least 6 characters.');
    const user = await gh('/user', {}, token);
    const gists = await gh('/gists?per_page=100', {}, token);
    const dataG = gists.find((g) => g.description === DESC && g.files[DATA_FILE]);
    const imgG = gists.find((g) => g.description === DESC_IMG);
    let k, salt;
    if (dataG) {
      const env = await remoteEnvelope(dataG.id, token);
      salt = env.salt;
      k = await deriveKey(password, salt);
      try { await decrypt(env, k); } catch { throw new Error('That sync password doesn\'t match the one you chose before.'); }
      ls.set(LS.token, token); ls.set(LS.gist, dataG.id); ls.set(LS.salt, salt); ls.set(LS.user, user.login);
      ls.set(LS.key, b64(await crypto.subtle.exportKey('raw', k))); keyCache = null;
      ls.set(LS.imgGist, imgG ? imgG.id : (await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC_IMG, public: false, files: { 'README.md': { content: 'Encrypted screenshots for the practice hub. Not readable without the sync password.' } } }) }, token)).id);
      const snap = await collect();
      const choice = hasData(snap) ? await onAsk(env) : 'cloud';
      if (choice === 'cloud') { await apply(env, k); return 'loaded'; }
      ls.del(LS.imgs); // the image gist may not have this browser's screenshots
      await push(snap); return 'uploaded';
    }
    // first time: create both gists from this browser's data
    salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    k = await deriveKey(password, salt);
    const img = imgG || await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC_IMG, public: false, files: { 'README.md': { content: 'Encrypted screenshots for the practice hub. Not readable without the sync password.' } } }) }, token);
    const data = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [DATA_FILE]: { content: '{}' } } }) }, token);
    ls.set(LS.token, token); ls.set(LS.gist, data.id); ls.set(LS.imgGist, img.id); ls.set(LS.salt, salt); ls.set(LS.user, user.login);
    ls.set(LS.key, b64(await crypto.subtle.exportKey('raw', k))); keyCache = null;
    ls.del(LS.imgs);
    await push(await collect());
    return 'created';
  }
  function disconnect() { Object.values(LS).forEach((kk) => { if (kk !== LS.device) ls.del(kk); }); keyCache = null; }

  // ---------- UI ----------
  const css = `
  #hs-chip{position:fixed;left:12px;bottom:12px;z-index:9998;font:500 12px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;
    background:#1d232b;color:#e6e9ee;border:1px solid #333c47;border-radius:999px;padding:6px 12px;box-shadow:0 4px 14px rgba(0,0,0,.35);
    cursor:pointer;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:none;max-width:min(80vw,420px)}
  #hs-chip.show{opacity:1;transform:none;pointer-events:auto}
  #hs-chip.ok{border-color:#2f7d4f} #hs-chip.err{border-color:#b4442f;background:#3a1d18} #hs-chip.busy{border-color:#6c5ce7}
  #hs-dlg{border:1px solid #333c47;border-radius:14px;background:#151a20;color:#e6e9ee;padding:22px;width:min(480px,94vw);
    font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 14px 44px rgba(0,0,0,.5)}
  #hs-dlg::backdrop{background:rgba(0,0,0,.5)}
  #hs-dlg h3{margin:0 0 6px;font-size:19px} #hs-dlg p{margin:6px 0;color:#aab3bf} #hs-dlg ol{padding-left:20px;margin:8px 0;color:#c9d0d9}
  #hs-dlg li{margin-bottom:8px} #hs-dlg a{color:#7fc3ff}
  #hs-dlg label{display:block;margin:10px 0 4px;color:#aab3bf;font-size:13px}
  #hs-dlg input{width:100%;box-sizing:border-box;font:inherit;color:#e6e9ee;background:#0e1216;border:1px solid #333c47;border-radius:8px;padding:9px 10px}
  #hs-dlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
  #hs-dlg button{font:inherit;font-weight:600;border-radius:8px;padding:8px 14px;border:1px solid #333c47;background:#1f262e;color:#e6e9ee;cursor:pointer}
  #hs-dlg button.pri{background:#2f7d4f;border-color:#2f7d4f;color:#fff} #hs-dlg button.dang{color:#ff8a7a}
  #hs-dlg button:disabled{opacity:.5;cursor:default}
  #hs-dlg .msg{min-height:20px;margin-top:8px;font-size:13px} #hs-dlg .msg.err{color:#ff8a7a} #hs-dlg .msg.ok{color:#7ddc9c}
  #hs-dlg .note{font-size:12.5px;color:#8b95a3}
  #hs-dlg code{background:#0e1216;padding:1px 5px;border-radius:4px}`;
  function ensureUI() {
    if (document.getElementById('hs-chip')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'hs-chip'; c.title = 'Sync settings'; c.onclick = () => openPanel();
    document.body.appendChild(c);
    const d = document.createElement('dialog'); d.id = 'hs-dlg'; document.body.appendChild(d);
  }
  let chipTimer = 0;
  function chip(text, kind, sticky) {
    ensureUI();
    const c = document.getElementById('hs-chip');
    c.textContent = '☁ ' + text; c.className = 'show ' + (kind || '');
    clearTimeout(chipTimer);
    if (!sticky && kind !== 'busy') chipTimer = setTimeout(() => { c.className = ''; }, 2200);
  }
  const ago = (iso) => {
    if (!iso) return 'never';
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleString();
  };

  function showConflict(env) {
    if (conflictShown) return;
    conflictShown = true;
    ensureUI();
    const d = document.getElementById('hs-dlg');
    d.innerHTML = `<h3>Changes in two places</h3>
      <p>Your data was changed in another browser (${ago(env.savedAt)}) and also here since they last synced. Which version do you want to keep?</p>
      <p class="note">The other version is replaced everywhere. If unsure, keep the one you used most recently.</p>
      <div class="row"><button id="hs-keep">Keep this browser's</button><button class="pri" id="hs-use">Use the other browser's</button></div>
      <div class="msg" id="hs-msg"></div>`;
    d.showModal();
    const msg = (t, k) => { const m = d.querySelector('#hs-msg'); m.textContent = t; m.className = 'msg ' + (k || ''); };
    d.querySelector('#hs-use').onclick = async () => {
      msg('Loading…');
      try { await apply(env); location.reload(); } catch (e) { msg(e.message, 'err'); }
    };
    d.querySelector('#hs-keep').onclick = async () => {
      msg('Saving this browser\'s version…');
      try { await push(await collect()); d.close(); conflictShown = false; chip('Saved', 'ok'); } catch (e) { msg(e.message, 'err'); }
    };
  }

  function openPanel() {
    ensureUI();
    const d = document.getElementById('hs-dlg');
    if (connected()) {
      d.innerHTML = `<h3>☁ Sync is on</h3>
        <p>Your chess progress, Chess Lab studies and trade journal are saved, encrypted, to your GitHub account <b>${ls.get(LS.user) || ''}</b> and kept the same in every browser you connect.</p>
        <p>Last saved or loaded from here: <b>${ago(ls.get(LS.lastAt))}</b></p>
        <p class="note">To use another browser or computer: open this site there, click ☁ Sync, and enter the same GitHub key and sync password.</p>
        <div class="row"><button class="dang" id="hs-off">Turn off in this browser</button><button id="hs-close">Close</button><button class="pri" id="hs-now">Sync now</button></div>
        <div class="msg" id="hs-msg"></div>`;
      const msg = (t, k) => { const m = d.querySelector('#hs-msg'); m.textContent = t; m.className = 'msg ' + (k || ''); };
      d.querySelector('#hs-close').onclick = () => d.close();
      d.querySelector('#hs-off').onclick = () => {
        if (!confirm('Turn off sync in this browser? Your data stays here and in your GitHub gist; nothing is deleted.')) return;
        disconnect(); d.close(); chip('Sync turned off in this browser', 'ok');
      };
      d.querySelector('#hs-now').onclick = async () => {
        msg('Syncing…');
        sessionStorage.removeItem('hubSync.look');
        await check();
        msg(`Done. Last saved or loaded: ${ago(ls.get(LS.lastAt))}`, 'ok');
      };
    } else {
      const tokenUrl = 'https://github.com/settings/tokens/new?scopes=gist&description=Practice%20hub%20sync';
      d.innerHTML = `<h3>☁ Sync between browsers</h3>
        <p>Keep your chess progress, Chess Lab studies and trade journal the same in every browser, saved to your GitHub account. Everything is encrypted with a password only you know.</p>
        <ol>
          <li>Create a GitHub key: <a href="${tokenUrl}" target="_blank" rel="noopener">open this link</a> (it's already set to the <code>gist</code> permission only). Set <b>Expiration</b> to <b>No expiration</b> (or a year), click <b>Generate token</b>, and copy the key that starts with <code>ghp_</code>.</li>
          <li>Paste it here and choose a sync password. Use the same key and password in your other browsers.</li>
        </ol>
        <label for="hs-token">GitHub key</label><input id="hs-token" type="password" placeholder="ghp_..." autocomplete="off">
        <label for="hs-pass">Sync password (you'll need it in your other browsers; it can't be recovered)</label><input id="hs-pass" type="password" autocomplete="new-password">
        <p class="note">Stays on this computer only: your GitHub key, your Lichess token, and big caches the site rebuilds itself.</p>
        <div class="row"><button id="hs-close">Cancel</button><button class="pri" id="hs-go">Turn on sync</button></div>
        <div class="msg" id="hs-msg"></div>`;
      const msg = (t, k) => { const m = d.querySelector('#hs-msg'); m.textContent = t; m.className = 'msg ' + (k || ''); };
      d.querySelector('#hs-close').onclick = () => d.close();
      d.querySelector('#hs-go').onclick = async () => {
        const btn = d.querySelector('#hs-go'); btn.disabled = true;
        msg('Connecting to GitHub…');
        try {
          const r = await connect(d.querySelector('#hs-token').value, d.querySelector('#hs-pass').value, (env) => new Promise((resolve) => {
            msg('');
            const box = document.createElement('div');
            box.innerHTML = `<p><b>Synced data found</b> (saved ${ago(env.savedAt)}). This browser has data too. Which should be kept?</p>
              <div class="row"><button id="hs-mine">Upload this browser's</button><button class="pri" id="hs-theirs">Load my synced data</button></div>`;
            d.appendChild(box);
            box.querySelector('#hs-theirs').onclick = () => { box.remove(); msg('Loading your data…'); resolve('cloud'); };
            box.querySelector('#hs-mine').onclick = () => { box.remove(); msg('Uploading…'); resolve('local'); };
          }));
          if (r === 'loaded') { msg('Your data is loaded. Reloading…', 'ok'); setTimeout(() => location.reload(), 800); }
          else { msg(r === 'created' ? 'Sync is on. Your data is saved to GitHub.' : 'Sync is on. This browser\'s data was uploaded.', 'ok'); setTimeout(() => { d.close(); }, 1600); }
        } catch (e) { msg(e.message, 'err'); btn.disabled = false; }
      };
    }
    if (!d.open) d.showModal();
  }

  // ---------- start ----------
  window.HubSync = { openPanel, check, connected };
  function start() {
    ensureUI();
    if (!connected()) return;
    check({ quiet: true });
    setInterval(() => { if (document.visibilityState === 'visible') check({ quiet: true }); }, 20_000);
    document.addEventListener('visibilitychange', () => { check({ quiet: document.visibilityState === 'visible' ? false : true }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
