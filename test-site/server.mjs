// Static demo site used to try the SDK. One process per industry, selected with TEST_SITE_*.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const ROOT = process.env.TEST_SITE_ROOT ? path.resolve(process.env.TEST_SITE_ROOT) : PUBLIC;
const PORT = Number(process.env.TEST_SITE_PORT) || 5173;
const NAME = process.env.TEST_SITE_NAME || 'Skyline Air';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Intentional page break on the flight demo: the booking API always fails.
  if (NAME === 'Skyline Air' && url.pathname === '/api/book' && req.method === 'POST') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'inventory service timeout' }));
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const resolved = path.join(ROOT, path.normalize(file));
  if (resolved.startsWith(ROOT)) {
    try {
      const body = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(resolved)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {
      /* fall through to 404 */
    }
  }

  // Intentional page break: any missing page (e.g. /seat-map) returns a real 404 status.
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  try {
    res.end(await readFile(path.join(ROOT, '404.html')));
  } catch {
    res.end('<!doctype html><title>Not found</title><h1>Page not found</h1>');
  }
}).listen(PORT, () => console.log(`${NAME} test site on http://localhost:${PORT}`));
