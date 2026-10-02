import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolves a request path against `root`, guarding against path traversal
 * (`..` segments escaping `root` after normalization). Returns `null` if the
 * resolved path would fall outside `root`. Also reused by `fs-bridge.ts` to
 * guard native file-access IPC requests against the same kind of escape.
 */
export function resolveWithinRoot(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '/');
  const resolved = normalize(join(root, decoded));
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return null;
  }
  return resolved;
}

/**
 * A minimal static file server for the built Angular output, bound to
 * `127.0.0.1` only on an OS-assigned port (PRD Phase 8 §31: the bundled
 * backend must never expose an external interface). Falls back to
 * `index.html` for any extensionless path that isn't an existing file, doing
 * for real what the web build's `apps/web/public/404.html` trick works around on
 * GitHub Pages' lack of server-side rewrites.
 */
export function startStaticServer(root: string): Promise<{ server: Server; port: number }> {
  const normalizedRoot = normalize(root);

  const server = createServer((req, res) => {
    void (async () => {
      const requestPath = req.url ?? '/';
      const resolved = resolveWithinRoot(normalizedRoot, requestPath);
      if (!resolved) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const target = extname(resolved) === '' ? join(normalizedRoot, 'index.html') : resolved;

      try {
        const info = await stat(target);
        const filePath = info.isDirectory() ? join(target, 'index.html') : target;
        const body = await readFile(filePath);
        const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
        // Matches angular.json's `serve.options.headers` for `ng serve`: the
        // Python Playground's sandboxed iframe has an opaque origin, so its
        // dynamic `import()` of Pyodide's own .mjs/.wasm is always CORS-mode,
        // even against this same-looking http://127.0.0.1 origin — GitHub
        // Pages sends this by default, this local server must too (see
        // apps/desktop/AGENTS.md and the Phase 6 code-sandbox gotchas).
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200, { 'Content-Type': contentType }).end(body);
      } catch {
        res.writeHead(404).end('Not found');
      }
    })();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Static server did not bind to a TCP port'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}
