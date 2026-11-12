// Patricia (by Adam Kulju, GPL-3.0) compiled to WebAssembly, wrapped as a UCI Web Worker.
// Usage: const w = new Worker('engines/patricia-worker.js'); w.postMessage('uci'); w.onmessage = e => e.data (one output line)
// Works the same way as the Stockfish worker: send UCI strings, receive UCI lines.

const WASM_URL = (self.PATRICIA_WASM_URL) || new URL('patricia.wasm', self.location.href).href;

function makeWasi(getMemory, onLine) {
  let pending = '';
  const dec = new TextDecoder();
  const ENOSYS = 52, EBADF = 8, OK = 0;
  const view = () => new DataView(getMemory().buffer);
  const flush = (text) => {
    pending += text;
    let idx;
    while ((idx = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, idx);
      pending = pending.slice(idx + 1);
      onLine(line);
    }
  };
  const t0 = performance.now();
  const fns = {
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      const dv = view();
      const mem = new Uint8Array(getMemory().buffer);
      let total = 0, text = '';
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        text += dec.decode(mem.subarray(ptr, ptr + len));
        total += len;
      }
      if (fd === 1 || fd === 2) flush(text);
      dv.setUint32(nwrittenPtr, total, true);
      return OK;
    },
    clock_time_get(id, precision, outPtr) {
      // id 0 = realtime, 1 = monotonic; both in nanoseconds
      const ms = id === 0 ? Date.now() : (performance.timeOrigin + performance.now());
      view().setBigUint64(outPtr, BigInt(Math.round(ms * 1e6)), true);
      return OK;
    },
    random_get(ptr, len) {
      const mem = new Uint8Array(getMemory().buffer, ptr, len);
      for (let off = 0; off < len; off += 65536) crypto.getRandomValues(mem.subarray(off, Math.min(len, off + 65536)));
      return OK;
    },
    environ_sizes_get(countPtr, sizePtr) { const dv = view(); dv.setUint32(countPtr, 0, true); dv.setUint32(sizePtr, 0, true); return OK; },
    environ_get() { return OK; },
    fd_prestat_get() { return EBADF; },
    fd_prestat_dir_name() { return EBADF; },
    fd_fdstat_get(fd, ptr) {
      if (fd > 2) return EBADF;
      const dv = view();
      dv.setUint8(ptr, 2); // character device
      dv.setUint16(ptr + 2, 0, true);
      dv.setBigUint64(ptr + 8, 0n, true);
      dv.setBigUint64(ptr + 16, 0n, true);
      return OK;
    },
    fd_close() { return OK; },
    fd_seek() { return ESPIPE(); },
    fd_read(fd, iovs, iovsLen, nreadPtr) { view().setUint32(nreadPtr, 0, true); return OK; },
    fd_pread() { return ENOSYS; },
    fd_filestat_get() { return ENOSYS; },
    path_open() { return ENOSYS; },
    proc_exit(code) { throw new Error('patricia exited with code ' + code); },
  };
  function ESPIPE() { return 70; }
  return new Proxy(fns, { get: (o, k) => (k in o ? o[k] : () => ENOSYS) });
}

let instance = null;
let ready = null;
const queue = [];

async function boot() {
  let memory;
  const wasi = makeWasi(() => memory, (line) => self.postMessage(line));
  const imports = { wasi_snapshot_preview1: wasi };
  let result;
  try {
    result = await WebAssembly.instantiateStreaming(fetch(WASM_URL), imports);
  } catch (e) {
    const buf = await (await fetch(WASM_URL)).arrayBuffer();
    result = await WebAssembly.instantiate(buf, imports);
  }
  instance = result.instance;
  memory = instance.exports.memory;
  if (instance.exports._initialize) instance.exports._initialize();
  instance.exports.patricia_init();
  // Single thread, small hash: keeps memory low in the browser.
  run('setoption name Threads value 1');
  run('setoption name Hash value 16');
}

const enc = new TextEncoder();
function run(cmd) {
  const ptr = instance.exports.patricia_buf();
  const bytes = enc.encode(cmd + '\0');
  if (bytes.length > 65536) throw new Error('command too long');
  new Uint8Array(instance.exports.memory.buffer, ptr, bytes.length).set(bytes);
  instance.exports.patricia_cmd();
}

ready = boot().catch((e) => self.postMessage('info string error ' + e.message));

self.onmessage = async (e) => {
  const cmd = String(e.data).trim();
  await ready;
  // 'stop' can't interrupt a running search (single-threaded); searches are time-limited instead.
  if (cmd === 'stop' || cmd === 'quit' || cmd === '') return;
  try { run(cmd); } catch (err) { self.postMessage('info string error ' + err.message); }
};
