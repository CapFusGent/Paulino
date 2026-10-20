// Local development server.
//
//   npm run dev                 → http://localhost:5173 (data kept in .data/)
//   PORT=4321 MEMORY=1 node server/dev-server.mjs   (used by the e2e tests)
//
// Serves the static PWA and emulates the two Supabase endpoints the app uses
// (/auth/v1/* and /rest/v1/rpc/*) on top of PGlite running the real
// migrations, so the frontend runs the exact same code it runs in production.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, verifyJwt, ANON_KEY, httpStatusFor } from './db.mjs';
import { seedDemo } from './seed-dev.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 5173);
const MEMORY = process.env.MEMORY === '1';
const LATENCY = Number(process.env.LATENCY_MS || 0);

// Only these paths are public; server code, migrations and tests are not served.
const PUBLIC = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'styles', 'assets', 'favicon.ico'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const db = await createDatabase({ dataDir: MEMORY ? undefined : join(ROOT, '.data', 'pglite') });
if (process.env.SEED !== '0') await seedDemo(db, { quiet: MEMORY });

const send = (res, status, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !(body instanceof Buffer);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json' : 'text/plain',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, prefer',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

function claimsFrom(req) {
  if (verifyJwt(req.headers.apikey) === null) return null; // a valid project key is always required
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifyJwt(bearer || req.headers.apikey);
}

async function handleAuth(req, res, url) {
  const body = await readBody(req);
  if (verifyJwt(req.headers.apikey) === null) return send(res, 401, { message: 'Invalid API key' });
  try {
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      return send(res, 200, await db.auth.signUp(body?.email, body?.password));
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') return send(res, 200, await db.auth.signIn(body?.email, body?.password));
      if (grant === 'refresh_token') return send(res, 200, db.auth.refresh(body?.refresh_token));
      return send(res, 400, { error_code: 'unsupported_grant_type', msg: 'Unsupported grant type' });
    }
    if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
      db.auth.logout(claimsFrom(req));
      return send(res, 204, '');
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const c = claimsFrom(req);
      if (!c?.sub) return send(res, 401, { msg: 'Invalid JWT' });
      return send(res, 200, { id: c.sub, email: c.email });
    }
    return send(res, 404, { msg: 'Not found' });
  } catch (e) {
    return send(res, e.status || 500, { code: e.status || 500, error_code: e.authCode || 'unexpected_failure', msg: e.message });
  }
}

async function handleRpc(req, res, url) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  const claims = claimsFrom(req);
  if (!claims) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid or expired' });
  const body = await readBody(req);
  if (body === null) return send(res, 400, { code: 'PGRST102', message: 'Invalid JSON body' });
  const fn = url.pathname.slice('/rest/v1/rpc/'.length);
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return send(res, 404, { code: 'PGRST202', message: 'Not found' });
  try {
    const result = await db.rpc(fn, body, claims);
    return send(res, 200, result === undefined ? null : result);
  } catch (e) {
    return send(res, httpStatusFor(e), { code: e.code || 'PGRST000', message: e.message, details: e.detail || null, hint: e.hint || null });
  }
}

async function handleStatic(req, res, url) {
  let path = decodeURIComponent(url.pathname);
  if (path === '/' || path === '') path = '/index.html';
  if (path === '/config.js') {
    // Dev config: point the app at this server, which speaks the Supabase protocol.
    const cfg = { supabaseUrl: `http://${req.headers.host}`, supabaseAnonKey: ANON_KEY, environment: 'local' };
    return send(res, 200, `window.PAULINO_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
  }
  const rel = normalize(path).replace(/^[/\\]+/, '');
  const top = rel.split(sep)[0].split('/')[0];
  if (!PUBLIC.includes(top)) return send(res, 404, 'Not found');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 404, 'Not found');
  try {
    const s = await stat(file);
    if (!s.isFile()) return send(res, 404, 'Not found');
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      ...(rel === 'sw.js' ? { 'service-worker-allowed': '/' } : {}),
    });
    return res.end(data);
  } catch {
    return send(res, 404, 'Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (LATENCY) await new Promise((r) => setTimeout(r, LATENCY));
  if (url.pathname.startsWith('/auth/v1/')) return handleAuth(req, res, url);
  if (url.pathname.startsWith('/rest/v1/rpc/')) return handleRpc(req, res, url);
  return handleStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Paulino dev server → http://localhost:${PORT}  (${MEMORY ? 'in-memory' : 'data in .data/pglite'})`);
});
