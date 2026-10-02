// A minimal static file server that reproduces GitHub Pages' project-page
// 404 behavior: any request that doesn't match a real file gets HTTP 404
// with the body of DUDE/404.html. That's the exact contract the SPA
// fallback script in apps/web/public/404.html depends on to recover a deep tool URL.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..', '.tmp', 'site');
const notFoundFile = join(siteRoot, 'DUDE', '404.html');
const port = Number(process.env.PORT) || 4310;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function resolveRequestedFile(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const safePath = normalize(decoded).replace(/^([.][.][/\\])+/, '');
  const candidate = join(siteRoot, safePath);

  if (!candidate.startsWith(siteRoot)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const indexCandidate = join(candidate, 'index.html');
    if (existsSync(indexCandidate)) return indexCandidate;
  }
  return null;
}

const server = createServer((req, res) => {
  const file = resolveRequestedFile(req.url ?? '/');

  if (file) {
    res.writeHead(200, { 'Content-Type': contentTypeFor(file) });
    createReadStream(file).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  createReadStream(notFoundFile).pipe(res);
});

server.listen(port, () => {
  console.log(`Static server listening on http://localhost:${port}`);
});
