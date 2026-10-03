import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
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
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.data': 'application/octet-stream',
};

/** Types worth precompressing (and serving precompressed variants of). Mirrors scripts/compress-static.mjs. */
const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.wasm', '.txt', '.map', '.webmanifest']);

/** Service worker files must always revalidate, even when a name happens to look content-hashed. */
const NO_CACHE_NAMES = new Set(['ngsw-worker.js', 'ngsw.json', 'safety-worker.js', 'worker-basic.min.js']);

type Encoding = 'br' | 'gzip';
const VARIANTS: ReadonlyArray<{ encoding: Encoding; ext: string; suffix: string }> = [
  { encoding: 'br', ext: '.br', suffix: '-br' },
  { encoding: 'gzip', ext: '.gz', suffix: '-gz' },
];

/** Encodings the client accepts (q > 0; `*` honoured unless the encoding is named explicitly), in Hub preference order. */
export function acceptedEncodings(header: string | string[] | undefined): Encoding[] {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return [];
  const q = new Map<string, number>();
  for (const part of raw.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    let weight = 1;
    for (const param of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(param);
      if (m) weight = Number(m[1]);
    }
    q.set(name.trim(), Number.isNaN(weight) ? 0 : weight);
  }
  const out: Encoding[] = [];
  for (const { encoding } of VARIANTS) {
    const names = encoding === 'gzip' ? ['gzip', 'x-gzip'] : [encoding];
    const explicit = names.map((n) => q.get(n)).find((v) => v !== undefined);
    if ((explicit ?? q.get('*') ?? 0) > 0) out.push(encoding);
  }
  return out;
}

function ifNoneMatchHits(header: string | string[] | undefined, etag: string): boolean {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return false;
  if (raw.trim() === '*') return true;
  return raw.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag);
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('base64url');
}

/** Angular content-hashed asset names: `<base>-<8 base64url-ish chars>.<ext>`, e.g. `main-MVP2NQLU.js`, `chunk-CzvplghU.js`, `chunk-__rv9DXh.js`. */
const HASHED_NAME = /^[^/\\]+-[A-Za-z0-9_]{8}\.[A-Za-z0-9]+$/;

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
  /** CSP and raw-content hash per HTML file, valid for one mtime/size version of that file. */
  const htmlCsp = new Map<string, { mtimeMs: number; size: number; csp: string; hash: string }>();
  /** Raw-content hash per non-HTML file, valid for one mtime/size version. */
  const fileHashes = new Map<string, { mtimeMs: number; size: number; hash: string }>();

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
      const ext = extname(file);
      // Re-stat when a directory index replaced the requested path.
      const fileInfo = file === resolved && !info.isDirectory() ? info : await stat(file);

      let htmlBody: Buffer | undefined;
      let rawHash: string;
      if (ext === '.html') {
        // CSP hashes and the ETag always come from the RAW html, whatever variant is served.
        htmlBody = await readFile(file);
        let entry = htmlCsp.get(file);
        if (entry?.mtimeMs !== fileInfo.mtimeMs || entry.size !== htmlBody.length) {
          entry = {
            mtimeMs: fileInfo.mtimeMs,
            size: htmlBody.length,
            csp: buildWebCsp(inlineScriptCspTokens(htmlBody.toString('utf8'))),
            hash: createHash('sha256').update(htmlBody).digest('base64url'),
          };
          htmlCsp.set(file, entry);
        }
        void reply.header('Content-Security-Policy', entry.csp);
        rawHash = entry.hash;
      } else {
        let entry = fileHashes.get(file);
        if (entry?.mtimeMs !== fileInfo.mtimeMs || entry.size !== fileInfo.size) {
          entry = { mtimeMs: fileInfo.mtimeMs, size: fileInfo.size, hash: await hashFile(file) };
          fileHashes.set(file, entry);
        }
        rawHash = entry.hash;
      }

      // Precompressed sibling (.br preferred, then .gz) when the client accepts it.
      let serveFile = file;
      let serveSize = fileInfo.size;
      let encoding: Encoding | undefined;
      let etagSuffix = '';
      if (COMPRESSIBLE.has(ext)) {
        void reply.header('Vary', 'Accept-Encoding');
        const accepted = acceptedEncodings(request.headers['accept-encoding']);
        for (const variant of VARIANTS) {
          if (!accepted.includes(variant.encoding)) continue;
          try {
            const variantInfo = await stat(file + variant.ext);
            if (!variantInfo.isFile()) continue;
            serveFile = file + variant.ext;
            serveSize = variantInfo.size;
            encoding = variant.encoding;
            etagSuffix = variant.suffix;
            break;
          } catch {
            // No such variant; try the next one.
          }
        }
      }
      const etag = `"${rawHash.slice(0, 27)}${etagSuffix}"`;

      const baseName = file.slice(file.lastIndexOf(sep) + 1);
      const hashed = file !== indexFile && !NO_CACHE_NAMES.has(baseName) && HASHED_NAME.test(baseName);
      void reply
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
        .header('ETag', etag)
        .type(CONTENT_TYPES[ext] ?? 'application/octet-stream');
      if (encoding !== undefined) void reply.header('Content-Encoding', encoding);

      if (ifNoneMatchHits(request.headers['if-none-match'], etag)) return reply.code(304).send();
      void reply.code(200);
      if (request.method === 'HEAD') return reply.header('Content-Length', serveSize).send();
      if (htmlBody !== undefined && encoding === undefined) return reply.send(htmlBody);
      return reply.header('Content-Length', serveSize).send(createReadStream(serveFile));
    } catch {
      if (spaRoute) return plain(reply, 503, WEB_ASSETS_MISSING_MESSAGE);
      return plain(reply, 404, 'Not found');
    }
  };
}
