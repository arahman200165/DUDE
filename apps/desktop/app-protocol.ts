import { protocol } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export const APP_SCHEME = 'dude-app';
export const APP_HOST = 'app';
export const APP_BASE_URL = `${APP_SCHEME}://${APP_HOST}/`;

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
 * Must run at module top level, before `app` is ready. `standard`+`secure` give the renderer a
 * stable, secure-context origin (`dude-app://app`) so localStorage/IndexedDB survive restarts.
 * Deliberately no `bypassCSP` and no `allowServiceWorkers`.
 */
export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
    },
  ]);
}

function plain(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}

/**
 * Serves the built Angular output for `dude-app://app/`. Falls back to `index.html` for any
 * extensionless path, doing for real what the web build's `apps/web/public/404.html` trick works
 * around on GitHub Pages' lack of server-side rewrites. No network listener is involved.
 */
export function createAppProtocolHandler(root: string): (request: Request) => Promise<Response> {
  const normalizedRoot = normalize(root);

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return plain(405, 'Method not allowed', { Allow: 'GET, HEAD' });
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return plain(404, 'Not found');
    }
    if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
      return plain(404, 'Not found');
    }

    let resolved: string | null;
    try {
      resolved = resolveWithinRoot(normalizedRoot, url.pathname);
    } catch {
      return plain(403, 'Forbidden');
    }
    if (!resolved) return plain(403, 'Forbidden');

    const target = extname(resolved) === '' ? join(normalizedRoot, 'index.html') : resolved;

    try {
      const info = await stat(target);
      const filePath = info.isDirectory() ? join(target, 'index.html') : target;
      const body = await readFile(filePath);
      const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          // Matches angular.json's `serve.options.headers` for `ng serve`: the Python
          // Playground's sandboxed iframe has an opaque origin, so its dynamic `import()` of
          // Pyodide's own .mjs/.wasm is always CORS-mode, even against this same-looking app
          // origin — GitHub Pages sends this by default, so this handler must too (see
          // apps/desktop/AGENTS.md and the Phase 6 code-sandbox gotchas).
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return plain(404, 'Not found');
    }
  };
}

/** Call after app ready and before the window loads. Idempotent: `protocol.handle` throws on re-registration. */
export function installAppProtocol(root: string): void {
  if (protocol.isProtocolHandled(APP_SCHEME)) return;
  protocol.handle(APP_SCHEME, createAppProtocolHandler(root));
}
