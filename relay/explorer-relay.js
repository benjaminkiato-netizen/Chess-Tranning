// Lichess opening explorer relay (Cloudflare Worker)
//
// Your site asks this relay for opening statistics; the relay asks Lichess with your token attached.
// Browsers can't do that directly right now because Lichess doesn't answer the browser's permission
// check (the CORS "preflight") that a token triggers.
//
// Setup (Cloudflare dashboard): create a Worker, paste this file, Deploy, then under
// Settings -> Variables and Secrets add a Secret named LICHESS_TOKEN with a Lichess API token.
// The token stays inside Cloudflare: it's never sent to the browser.

// Only these sites may use the relay (so nobody else can spend your token).
const ALLOWED_ORIGINS = [
  'https://benjaminkiato-netizen.github.io',
];

// Only the explorer's game databases are relayed, nothing else on Lichess.
const ALLOWED_PATHS = ['/lichess', '/masters'];

const CACHE_SECONDS = 7 * 24 * 3600; // opening statistics barely change; keep answers for a week

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function reply(status, body, origin, extra = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(origin ? cors(origin) : {}), ...extra },
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: cors(allowed) }) : new Response(null, { status: 403 });
    }
    // a quick check page: open the relay's address in a browser tab to see whether it's set up
    if (url.pathname === '/' || url.pathname === '') {
      const status = { relay: 'Lichess opening explorer relay', token: env.LICHESS_TOKEN ? 'set' : 'MISSING: add a LICHESS_TOKEN secret' };
      if (env.LICHESS_TOKEN) {
        // live test: ask Lichess about the starting position
        try {
          const t = await fetch('https://explorer.lichess.org/lichess?variant=standard&fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F8%2F8%2FPPPPPPPP%2FRNBQKBNR%20w%20KQkq%20-%200%201&moves=3&topGames=0&recentGames=0',
            { headers: { Authorization: 'Bearer ' + env.LICHESS_TOKEN, 'User-Agent': 'chess-practice-site explorer relay' }, signal: AbortSignal.timeout(20000) });
          status.lichess = t.ok ? 'OK: Lichess answered, the relay is working'
            : t.status === 401 ? 'Lichess rejected the token (401): make a new token and update the secret'
            : `Lichess answered with error ${t.status}`;
        } catch (e) { status.lichess = 'Lichess did not answer the relay (timed out)'; }
      }
      return reply(200, status, allowed);
    }
    if (request.method !== 'GET') return reply(405, { error: 'Only GET is allowed' }, allowed);
    if (!allowed) return reply(403, { error: 'This relay only works for its own site' }, '');
    if (!ALLOWED_PATHS.includes(url.pathname)) return reply(404, { error: 'Unknown path' }, allowed);
    if (!env.LICHESS_TOKEN) return reply(500, { error: 'The relay has no LICHESS_TOKEN secret yet' }, allowed);

    // Same question for everyone -> answer from Cloudflare's cache when we can.
    const target = 'https://explorer.lichess.org' + url.pathname + url.search;
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request(target, { method: 'GET' });
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const h = new Headers(hit.headers);
        for (const [k, v] of Object.entries(cors(allowed))) h.set(k, v);
        h.set('X-Relay-Cache', 'hit');
        return new Response(hit.body, { status: hit.status, headers: h });
      }
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { Authorization: 'Bearer ' + env.LICHESS_TOKEN, Accept: 'application/json', 'User-Agent': 'chess-practice-site explorer relay' },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      return reply(504, { error: 'Lichess did not answer the relay in time' }, allowed);
    }
    const body = await upstream.text();
    const headers = { ...cors(allowed), 'Content-Type': 'application/json' };
    if (upstream.status === 429) headers['Retry-After'] = '60';
    const res = new Response(body, { status: upstream.status, headers });
    if (upstream.ok && cache) {
      const toCache = new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } });
      ctx.waitUntil(cache.put(cacheKey, toCache));
    }
    return res;
  },
};
