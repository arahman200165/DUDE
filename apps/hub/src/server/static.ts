import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildWebCsp } from '../security/headers.js';

// Adapted from apps/desktop/app-protocol.ts (boundary rules forbid importing it).
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

/** Angular content-hashed asset names, e.g. `main-ABCD1234.js` or `chunk-ABCD1234.js`. */
const HASHED_NAME = /[-.][A-Z0-9]{8}\.[A-Za-z0-9]+$/;

export const WEB_ASSETS_MISSING_MESSAGE = 'DUDE Hub web assets are not installed.';

/** Resolve an already decoded request path against `root`; null when it would escape. */
export function resolveWithinRoot(root: string, decodedPath: string): string | null {
  const resolved = normalize(join(root, decodedPath));
  if (resolved !== root && !resolved.startsWith(root + sep)) return null;
  return resolved;
}

/** Returns the decoded, safe request path, or null when anything about it looks like traversal. */
export function safeRequestPath(rawUrl: string): string | null {
  const rawPath = rawUrl.split('?')[0]?.split('#')[0] ?? '/';
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) return null;
  // Encoded dots, slashes, backslashes and NULs have no legitimate use in Angular asset names.
  if (/%(2e|2f|5c|00)/i.test(rawPath)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  for (const segment of decoded.split('/')) {
    if (segment === '..' || segment === '.') return null;
    if (segment.includes(':')) return null;
  }
  return decoded;
}

function plain(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply
    .code(status)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'no-cache')
    .type('text/plain; charset=utf-8')
    .send(message);
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
/** Inline event-handler attributes (`onload="..."`), double- or single-quoted, inside a tag. */
const INLINE_HANDLER = /<[a-z][^>]*\son[a-z]+\s*=[^>]*>/gi;
const HANDLER_ATTRIBUTE = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Browsers hash the text after HTML input preprocessing, which turns CRLF and lone CR into LF. */
function sha256Token(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  return `'sha256-${createHash('sha256').update(normalized, 'utf8').digest('base64')}'`;
}

function decodeAttribute(value: string): string {
  return value.replace(/&(quot|#34|#39|apos|lt|gt|amp);/g, (_m, name: string) => {
    switch (name) {
      case 'quot': case '#34': return '"';
      case '#39': case 'apos': return "'";
      case 'lt': return '<';
      case 'gt': return '>';
      default: return '&';
    }
  });
}

/**
 * Extra script-src tokens that let exactly the inline scripts (and, only if present, inline event-handler attributes)
 * of one HTML document run without 'unsafe-inline'. Handler attributes need 'unsafe-hashes' plus the hash of the
 * attribute value; the keyword is added only when the document actually has handlers.
 */
export function inlineScriptCspTokens(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1] ?? '';
    if (body.trim() !== '') hashes.add(sha256Token(body));
  }
  const handlers = new Set<string>();
  for (const tag of html.matchAll(INLINE_HANDLER)) {
    for (const attr of tag[0].matchAll(HANDLER_ATTRIBUTE)) handlers.add(sha256Token(decodeAttribute(attr[1] ?? attr[2] ?? '')));
  }
  return [...(handlers.size > 0 ? ["'unsafe-hashes'"] : []), ...hashes, ...handlers];
}

export interface StaticHandlerOptions {
  /** Absolute web root directory. */
  root: string;
}

/** Static + SPA handler for GET/HEAD requests outside `/api`. */
export function createStaticHandler(options: StaticHandlerOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply> {
  const root = normalize(options.root);
  /** CSP per HTML file, valid for one mtime/size version of that file. */
  const htmlCsp = new Map<string, { mtimeMs: number; size: number; csp: string }>();

  return async (request, reply) => {
    const requestPath = safeRequestPath(request.url);
    if (requestPath === null) return plain(reply, 404, 'Not found');
    if (requestPath === '/api' || requestPath.startsWith('/api/')) return plain(reply, 404, 'Not found');
    const resolved = resolveWithinRoot(root, requestPath);
    if (resolved === null) return plain(reply, 404, 'Not found');

    const indexFile = join(root, 'index.html');
    const spaRoute = extname(resolved) === '';

    try {
      let file = spaRoute ? indexFile : resolved;
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      if (extname(file) === '.html') {
        // Re-stat the resolved file (a directory index differs from the first stat) and cache by mtime/size.
        const fileInfo = file === resolved && !info.isDirectory() ? info : await stat(file);
        let entry = htmlCsp.get(file);
        if (entry?.mtimeMs !== fileInfo.mtimeMs || entry.size !== body.length) {
          entry = { mtimeMs: fileInfo.mtimeMs, size: body.length, csp: buildWebCsp(inlineScriptCspTokens(body.toString('utf8'))) };
          htmlCsp.set(file, entry);
        }
        void reply.header('Content-Security-Policy', entry.csp);
      }
      const hashed = file !== indexFile && HASHED_NAME.test(file.slice(file.lastIndexOf(sep) + 1));
      return reply
        .code(200)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
        .type(CONTENT_TYPES[extname(file)] ?? 'application/octet-stream')
        .send(body);
    } catch {
      if (spaRoute) return plain(reply, 503, WEB_ASSETS_MISSING_MESSAGE);
      return plain(reply, 404, 'Not found');
    }
  };
}
