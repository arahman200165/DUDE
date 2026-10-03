import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { makeWebRoot, request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';
import { acceptedEncodings, safeRequestPath } from './static.js';
import { HUB_API_CSP, HUB_WEB_CSP } from '../security/headers.js';

const hubs: TestHub[] = [];
afterAll(async () => { await Promise.all(hubs.map((h) => h.close())); });

describe('static hosting', () => {
  it('serves the SPA index, hashed assets and refuses traversal', async () => {
    const hub = await startTestHub({ webRoot: makeWebRoot() });
    hubs.push(hub);
    const get = (p: string) => request(hub.port, hub.tls.certPem, p);

    const spa = await get('/settings/environment');
    expect(spa.status).toBe(200);
    expect(spa.body).toContain('<title>DUDE</title>');
    expect(spa.headers['cache-control']).toBe('no-cache');
    expect(spa.headers['x-content-type-options']).toBe('nosniff');
    expect(String(spa.headers['content-type'])).toContain('text/html');

    const asset = await get('/main-ABC12345.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(String(asset.headers['content-type'])).toContain('text/javascript');

    const mixed = await get('/chunk-CzvplghU.js');
    expect(mixed.status).toBe(200);
    expect(mixed.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    for (const name of ['/favicon.ico', '/index.html', '/manifest.webmanifest']) {
      const res = await get(name);
      expect(res.status, name).toBe(200);
      expect(res.headers['cache-control'], name).toBe('no-cache');
    }

    expect((await get('/missing.js')).status).toBe(404);

    for (const bad of ['/../package.json', '/%2e%2e/x', '/..%5cx', '/%2E%2E/%2E%2E/etc/passwd', '/a%00b', '/assets/..%2f..%2fpackage.json', '//etc/passwd']) {
      const res = await get(bad);
      expect(res.status, bad).toBe(404);
      expect(res.body, bad).not.toContain('"name"');
    }

    const api = await get('/api/v1/missing');
    expect(api.status).toBe(404);
    expect(String(api.headers['content-type'])).toContain('application/json');
  });

  it('answers 503 for SPA routes when the web assets are not installed', async () => {
    const hub = await startTestHub();
    hubs.push(hub);
    const res = await request(hub.port, hub.tls.certPem, '/settings');
    expect(res.status).toBe(503);
    expect(res.body).toBe('DUDE Hub web assets are not installed.');
    expect(String(res.headers['content-type'])).toContain('text/plain');
  });

  it('safeRequestPath rejects traversal forms and decodes plain paths', () => {
    expect(safeRequestPath('/a/b.js?x=1')).toBe('/a/b.js');
    expect(safeRequestPath('/a/../b')).toBeNull();
    expect(safeRequestPath('/C:/Windows')).toBeNull();
    expect(safeRequestPath('/%E0%A4%A')).toBeNull();
  });
});

describe('sandbox loader pages', () => {
  const PAGES = ['code', 'python', 'html', 'plugin'] as const;

  it('serves each loader page with its own CSP, no X-Frame-Options and frame-ancestors self, and only those', async () => {
    const root = makeWebRoot();
    mkdirSync(join(root, 'sandbox'));
    for (const page of PAGES) writeFileSync(join(root, 'sandbox', `${page}.html`), '<!doctype html><script>window.x = 1;</script>');
    writeFileSync(join(root, 'sandbox', 'other.html'), '<!doctype html><script>window.x = 1;</script>');
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const get = (p: string, method = 'GET') => request(hub.port, hub.tls.certPem, p, { method });

    for (const page of PAGES) {
      for (const method of ['GET', 'HEAD']) {
        const res = await get(`/sandbox/${page}.html`, method);
        expect(res.status, page).toBe(200);
        expect(res.headers['x-frame-options'], page).toBeUndefined();
        expect(res.headers['cache-control'], page).toBe('no-cache');
        expect(res.headers['x-content-type-options'], page).toBe('nosniff');
        const csp = String(res.headers['content-security-policy']);
        expect(csp, page).toContain("default-src 'none'");
        expect(csp, page).toContain("frame-ancestors 'self'");
        expect(csp, page).toContain("base-uri 'none'");
        expect(csp, page).toContain("script-src 'unsafe-inline'");
        expect(csp, page).not.toContain('sha256-');
      }
    }
    const csp = async (page: string) => String((await get(`/sandbox/${page}.html`)).headers['content-security-policy']);
    expect(await csp('code')).toContain("script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:");
    expect(await csp('code')).toContain("connect-src 'none'");
    const python = await csp('python');
    expect(python).toContain("'wasm-unsafe-eval' 'self' https://127.0.0.1:");
    expect(python).toContain("connect-src 'self' https://127.0.0.1:");
    expect(await csp('html')).toContain('img-src data: blob: https:');
    expect(await csp('html')).not.toContain('connect-src');
    expect(await csp('plugin')).toContain("connect-src 'none'");

    // Any other /sandbox/* path (and the app itself) keeps the normal app treatment.
    for (const other of ['/sandbox/other.html', '/index.html']) {
      const res = await get(other);
      expect(res.status, other).toBe(200);
      expect(res.headers['x-frame-options'], other).toBe('DENY');
      expect(String(res.headers['content-security-policy']), other).toContain("frame-ancestors 'none'");
    }
    const missing = await get('/sandbox/nope.html');
    expect(missing.status).toBe(404);
    expect(missing.headers['x-frame-options']).toBe('DENY');
  });

  it('keeps the loader page headers on a 304 revalidation (a 304 updates the cached headers)', async () => {
    const root = makeWebRoot();
    mkdirSync(join(root, 'sandbox'));
    writeFileSync(join(root, 'sandbox', 'html.html'), '<!doctype html><script>window.x = 1;</script>');
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const first = await request(hub.port, hub.tls.certPem, '/sandbox/html.html');
    const etag = String(first.headers['etag']);
    const revalidated = await request(hub.port, hub.tls.certPem, '/sandbox/html.html', { headers: { 'if-none-match': etag } });
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers['x-frame-options']).toBeUndefined();
    expect(String(revalidated.headers['content-security-policy'])).toContain("frame-ancestors 'self'");
  });

  it('makes only the Pyodide vendor files readable cross-origin (the opaque sandbox fetches them)', async () => {
    const root = makeWebRoot();
    mkdirSync(join(root, 'assets', 'vendor', 'pyodide'), { recursive: true });
    writeFileSync(join(root, 'assets', 'vendor', 'pyodide', 'pyodide.js'), 'export {};');
    writeFileSync(join(root, 'assets', 'other.js'), 'export {};');
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const vendor = await request(hub.port, hub.tls.certPem, '/assets/vendor/pyodide/pyodide.js');
    expect(vendor.status).toBe(200);
    expect(vendor.headers['access-control-allow-origin']).toBe('*');
    expect(vendor.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const other = await request(hub.port, hub.tls.certPem, '/assets/other.js');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    expect(other.headers['cross-origin-resource-policy']).toBe('same-origin');
    const api = await request(hub.port, hub.tls.certPem, '/api/v1/hello');
    expect(api.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('inline script CSP hashes', () => {
  const sha = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
  const scriptSrc = (csp: unknown) => /script-src ([^;]*)/.exec(String(csp))?.[1] ?? '';

  it('hashes inline scripts and handlers for HTML only, and invalidates when the file changes', async () => {
    const root = makeWebRoot();
    const a = '\r\n  window.a = 1;\r\n';
    const b = 'window.b = 2;';
    const handler = "this.media='all'";
    const indexPath = join(root, 'index.html');
    writeFileSync(indexPath, `<!doctype html><script>${a}</script><script src="main-ABC12345.js"></script><script type="text/javascript">${b}</script><link rel="stylesheet" href="s.css" media="print" onload="this.media=&#39;all&#39;">`);
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const get = (p: string) => request(hub.port, hub.tls.certPem, p);

    const first = await get('/hub/setup');
    expect(scriptSrc(first.headers['content-security-policy'])).toBe(
      `'self' 'wasm-unsafe-eval' 'unsafe-hashes' ${sha(a.replace(/\r\n/g, '\n'))} ${sha(b)} ${sha(handler)}`,
    );
    expect(scriptSrc(first.headers['content-security-policy'])).not.toContain("'unsafe-inline'");
    expect(scriptSrc((await get('/index.html')).headers['content-security-policy'])).toBe(scriptSrc(first.headers['content-security-policy']));

    expect(scriptSrc((await get('/main-ABC12345.js')).headers['content-security-policy'])).toBe(scriptSrc(HUB_WEB_CSP));
    expect(String((await get('/api/v1/missing')).headers['content-security-policy'])).toBe(HUB_API_CSP);

    const c = 'window.c = 3;';
    writeFileSync(indexPath, `<!doctype html><script>${c}</script>`);
    utimesSync(indexPath, new Date(), new Date(Date.now() + 5000));
    const second = await get('/hub/sign-in');
    expect(scriptSrc(second.headers['content-security-policy'])).toBe(`'self' 'wasm-unsafe-eval' ${sha(c)}`);
  });
});

interface BufResponse { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }

/** Like `request` but keeps the body as bytes (compressed variants are not text). */
function rawRequest(hub: TestHub, requestPath: string, headers: Record<string, string> = {}, method = 'GET'): Promise<BufResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: '127.0.0.1', port: hub.port, path: requestPath, method, ca: hub.tls.certPem, headers, servername: 'localhost' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('precompressed variants, ETag and streaming', () => {
  const JS = 'console.log("hello hub");\n'.repeat(200);
  const makeRoot = () => {
    const root = makeWebRoot();
    writeFileSync(join(root, 'app.js'), JS);
    writeFileSync(join(root, 'app.js.br'), brotliCompressSync(JS));
    writeFileSync(join(root, 'app.js.gz'), gzipSync(JS));
    return root;
  };
  const etagOf = (text: string) => `"${createHash('sha256').update(text).digest('base64url').slice(0, 27)}"`;

  it('negotiates br, then gzip, then raw, honouring q-values', async () => {
    const hub = await startTestHub({ webRoot: makeRoot() });
    hubs.push(hub);

    const br = await rawRequest(hub, '/app.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(br.status).toBe(200);
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers['vary']).toBe('Accept-Encoding');
    expect(String(br.headers['content-type'])).toContain('text/javascript');
    expect(br.headers['content-length']).toBe(String(br.body.length));
    expect(brotliDecompressSync(br.body).toString()).toBe(JS);

    const gz = await rawRequest(hub, '/app.js', { 'accept-encoding': 'gzip;q=0.8, br;q=0' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.body).toString()).toBe(JS);

    for (const header of ['identity', 'br;q=0, gzip;q=0', '*;q=0', undefined]) {
      const raw = await rawRequest(hub, '/app.js', header === undefined ? {} : { 'accept-encoding': header });
      expect(raw.headers['content-encoding'], String(header)).toBeUndefined();
      expect(raw.headers['vary'], String(header)).toBe('Accept-Encoding');
      expect(raw.body.toString(), String(header)).toBe(JS);
    }
    expect((await rawRequest(hub, '/app.js', { 'accept-encoding': '*' })).headers['content-encoding']).toBe('br');

    expect(acceptedEncodings('gzip;q=0.5, br;q=0.001')).toEqual(['br', 'gzip']);
    expect(acceptedEncodings('br;q=0, *')).toEqual(['gzip']);
    expect(acceptedEncodings(undefined)).toEqual([]);
  });

  it('ignores a .br next to a type that is not compressible', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'pic.png'), 'png-bytes');
    writeFileSync(join(root, 'pic.png.br'), 'not-really');
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const res = await rawRequest(hub, '/pic.png', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['vary']).toBeUndefined();
    expect(res.body.toString()).toBe('png-bytes');
  });

  it('emits strong ETags per variant and answers If-None-Match with 304', async () => {
    const hub = await startTestHub({ webRoot: makeRoot() });
    hubs.push(hub);
    const raw = await rawRequest(hub, '/app.js');
    expect(raw.headers['etag']).toBe(etagOf(JS));
    const br = await rawRequest(hub, '/app.js', { 'accept-encoding': 'br' });
    expect(br.headers['etag']).toBe(etagOf(JS).replace(/"$/, '-br"'));
    const gz = await rawRequest(hub, '/app.js', { 'accept-encoding': 'gzip' });
    expect(gz.headers['etag']).toBe(etagOf(JS).replace(/"$/, '-gz"'));

    const hit = await rawRequest(hub, '/app.js', { 'if-none-match': String(raw.headers['etag']) });
    expect(hit.status).toBe(304);
    expect(hit.body.length).toBe(0);
    expect(hit.headers['etag']).toBe(raw.headers['etag']);
    expect(hit.headers['cache-control']).toBe('no-cache');
    expect(hit.headers['x-content-type-options']).toBe('nosniff');

    const variantHit = await rawRequest(hub, '/app.js', { 'accept-encoding': 'br', 'if-none-match': `"other", ${String(br.headers['etag'])}` });
    expect(variantHit.status).toBe(304);
    expect(variantHit.headers['content-encoding']).toBe('br');
    // The raw ETag does not validate the br representation.
    expect((await rawRequest(hub, '/app.js', { 'accept-encoding': 'br', 'if-none-match': String(raw.headers['etag']) })).status).toBe(200);

    const html = await rawRequest(hub, '/index.html');
    const htmlHit = await rawRequest(hub, '/index.html', { 'if-none-match': String(html.headers['etag']) });
    expect(htmlHit.status).toBe(304);
    expect(String(htmlHit.headers['content-security-policy'])).toContain('default-src');
  });

  it('answers HEAD with headers and no body', async () => {
    const hub = await startTestHub({ webRoot: makeRoot() });
    hubs.push(hub);
    const head = await rawRequest(hub, '/app.js', { 'accept-encoding': 'br' }, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers['content-encoding']).toBe('br');
    expect(head.headers['content-length']).toBe(String(brotliCompressSync(JS).length));
    expect(head.headers['etag']).toBeDefined();
  });

  it('streams a file larger than 1 MiB with the exact Content-Length', async () => {
    const root = makeRoot();
    const big = Buffer.alloc(1_500_000, 'x');
    writeFileSync(join(root, 'big.data'), big);
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const res = await rawRequest(hub, '/big.data');
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe('1500000');
    expect(res.body.length).toBe(1_500_000);
    expect(res.body.equals(big)).toBe(true);
  });

  it('serves the new MIME types', async () => {
    const root = makeRoot();
    const expected: Record<string, string> = {
      'a.webp': 'image/webp', 'a.avif': 'image/avif', 'a.gif': 'image/gif', 'a.js.map': 'application/json',
      'a.wasm': 'application/wasm', 'a.webmanifest': 'application/manifest+json', 'a.ico': 'image/x-icon',
      'a.txt': 'text/plain', 'a.xml': 'application/xml', 'a.zip': 'application/zip', 'a.data': 'application/octet-stream',
      'a.mjs': 'text/javascript', 'a.woff': 'font/woff', 'a.woff2': 'font/woff2',
    };
    for (const name of Object.keys(expected)) writeFileSync(join(root, name), 'x');
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    for (const [name, type] of Object.entries(expected)) {
      const res = await rawRequest(hub, `/${name}`);
      expect(res.status, name).toBe(200);
      expect(String(res.headers['content-type']), name).toContain(type);
    }
  });

  it('keeps service worker files on no-cache even when the name looks hashed', async () => {
    const root = makeRoot();
    for (const name of ['ngsw-worker.js', 'ngsw.json', 'safety-worker.js', 'worker-basic.min.js', 'ngsw-ABCD1234.js']) writeFileSync(join(root, name), '{}');
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    for (const name of ['ngsw-worker.js', 'ngsw.json', 'safety-worker.js', 'worker-basic.min.js']) {
      expect((await rawRequest(hub, `/${name}`)).headers['cache-control'], name).toBe('no-cache');
    }
    expect((await rawRequest(hub, '/ngsw-ABCD1234.js')).headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('computes CSP hashes from the raw html when a .br variant exists, and serves the variant', async () => {
    const root = makeRoot();
    const html = '<!doctype html><script>window.z = 9;</script>';
    writeFileSync(join(root, 'index.html'), html);
    writeFileSync(join(root, 'index.html.br'), brotliCompressSync(html));
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const res = await rawRequest(hub, '/settings', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(res.body).toString()).toBe(html);
    const hash = `'sha256-${createHash('sha256').update('window.z = 9;').digest('base64')}'`;
    expect(String(res.headers['content-security-policy'])).toContain(hash);
    expect(res.headers['etag']).toBe(etagOf(html).replace(/"$/, '-br"'));
  });

  it('scripts/compress-static.mjs writes variants only when worthwhile and is idempotent', () => {
    const root = makeRoot();
    rmSync(join(root, 'app.js.br'));
    rmSync(join(root, 'app.js.gz'));
    writeFileSync(join(root, 'tiny.js'), 'a'.repeat(100));
    writeFileSync(join(root, 'noise.js'), randomBytes(4096));
    writeFileSync(join(root, 'pic.png'), Buffer.alloc(8192));
    const script = join(__dirname, '..', '..', '..', '..', 'scripts', 'compress-static.mjs');
    const out = execFileSync(process.execPath, [script, root], { encoding: 'utf8' });
    expect(out).toContain('compress-static');
    expect(existsSync(join(root, 'app.js.br'))).toBe(true);
    expect(existsSync(join(root, 'app.js.gz'))).toBe(true);
    expect(brotliDecompressSync(readFileSync(join(root, 'app.js.br'))).toString()).toBe(JS);
    expect(existsSync(join(root, 'tiny.js.br'))).toBe(false);
    expect(existsSync(join(root, 'noise.js.br'))).toBe(false);
    expect(existsSync(join(root, 'pic.png.br'))).toBe(false);
    const before = statSync(join(root, 'app.js.br')).mtimeMs;
    execFileSync(process.execPath, [script, root]);
    expect(statSync(join(root, 'app.js.br')).mtimeMs).toBe(before);
    expect(existsSync(join(root, 'app.js.br.gz'))).toBe(false);
  });
});
