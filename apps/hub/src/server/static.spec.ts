import { createHash } from 'node:crypto';
import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeWebRoot, request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';
import { safeRequestPath } from './static.js';
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

    const unhashed = await get('/favicon.ico');
    expect(unhashed.status).toBe(200);
    expect(unhashed.headers['cache-control']).toBe('no-cache');

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
