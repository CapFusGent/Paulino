// Minimal static file server for local testing (Paulino has no backend).
//   node test/serve.mjs            → http://localhost:5173
//   PORT=4321 node test/serve.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.paulino': 'application/json' };
const PUBLIC = ['index.html', 'assets', 'sw.js', '.nojekyll'];

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(path === '/' ? 'index.html' : path.slice(1));
  const file = join(ROOT, rel);
  if (!PUBLIC.includes(rel.split(/[\\/]/)[0]) || !file.startsWith(ROOT)) { res.writeHead(404); return res.end('Not found'); }
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Paulino → http://localhost:${PORT}`));
