import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HUB_API_PREFIX } from '@dude/contracts/hub';
import { makeWebRoot, request, startTestHub } from '../server/test-helpers.js';
import type { TestHub } from '../server/test-helpers.js';
import { HUB_API_CSP, HUB_WEB_CSP, buildWebCsp } from './headers.js';
import { allowedHosts } from './host-guard.js';
import { classifyCredential } from './request-guard.js';
import { parseCookies } from './cookies.js';

const ECHO = `${HUB_API_PREFIX}/test/echo`;
const SESSION = '__Host-dude_session';

function routes(app: FastifyInstance): void {
  app.post(ECHO, async () => ({ ok: true }));
  app.post(`${HUB_API_PREFIX}/test/limited`, { config: { authLimited: true } }, async () => ({ ok: true }));
  app.get(`${HUB_API_PREFIX}/test/limited-get`, { config: { authLimited: true } }, async () => ({ ok: true }));
}

describe('security baseline', () => {
  let hub: TestHub;
  let origin: string;
  const json = { 'content-type': 'application/json' };
  const post = (headers: Record<string, string> = {}, body = '{}') =>
    request(hub.port, hub.tls.certPem, ECHO, { method: 'POST', headers: { ...json, ...headers }, body });

  beforeAll(async () => {
    hub = await startTestHub(
      { webRoot: makeWebRoot() },
      {
        configure: routes,
        csrfVerifier: (cookie, csrf) => cookie === 'good-session' && csrf === 'good-csrf',
        rateLimit: { global: { perMinute: 6000, burst: 1000 } },
      },
    );
    origin = `https://127.0.0.1:${hub.port}`;
  });
  afterAll(async () => { await hub.close(); });

  it('sets the security headers and the API CSP on /api responses, with no CORS headers', async () => {
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`);
    expect(res.status).toBe(200);
    // The test Hub serves a self-signed certificate, so HSTS is omitted (see proxy.spec.ts for the trusted-certificate cases).
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['permissions-policy']).toBe('camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
    expect(res.headers['content-security-policy']).toBe(HUB_API_CSP);
    expect(Object.keys(res.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
  });

  it('sets the web CSP on static responses and on 404s', async () => {
    for (const p of ['/', '/main-ABC12345.js', '/some/spa/route']) {
      const res = await request(hub.port, hub.tls.certPem, p);
      expect(res.headers['content-security-policy']).toBe(HUB_WEB_CSP);
      expect(res.headers['x-frame-options']).toBe('DENY');
    }
    expect(HUB_WEB_CSP).toContain("frame-ancestors 'none'");
    // PD-056: browser-side network and remote images are allowed; eval never is (script-src is 'self' + wasm only).
    expect(HUB_WEB_CSP).toContain("connect-src 'self' blob: https: wss:");
    expect(HUB_WEB_CSP).toContain("img-src 'self' data: blob: https:");
    expect(HUB_WEB_CSP).not.toMatch(/(?<!wasm-)unsafe-eval/);
    expect(buildWebCsp(["'unsafe-hashes'", "'sha256-x'"])).not.toMatch(/(?<!wasm-)unsafe-eval/);
    const notFound = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/nope`);
    expect(notFound.headers['content-security-policy']).toBe(HUB_API_CSP);
  });

  it('does not answer CORS preflights with CORS headers', async () => {
    const res = await request(hub.port, hub.tls.certPem, ECHO, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(Object.keys(res.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
  });

  it('rejects an unknown Host with 421 and an envelope', async () => {
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`, { headers: { host: 'evil.example' } });
    expect(res.status).toBe(421);
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'bad-request', message: 'Misdirected request.' } });
    expect(res.headers['content-security-policy']).toBe(HUB_API_CSP);
  });

  it('accepts localhost and the OS host name with the right port, case-insensitively', async () => {
    for (const host of [`localhost:${hub.port}`, `LOCALHOST:${hub.port}`]) {
      expect((await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`, { headers: { host } })).status).toBe(200);
    }
    expect((await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`, { headers: { host: 'localhost:1' } })).status).toBe(421);
  });

  it('computes the allowed set per bind mode', () => {
    const loopback = allowedHosts({ bind: 'loopback' }, 8443);
    expect(loopback.has('127.0.0.1:8443')).toBe(true);
    expect(loopback.has('localhost:8443')).toBe(true);
    expect(loopback.has('[::1]:8443')).toBe(true);
    expect(loopback.has('hub.example:8443')).toBe(false);
    expect(allowedHosts({ bind: 'loopback', extraHosts: ['Hub.Example'] }, 8443).has('hub.example:8443')).toBe(true);
    const lan = allowedHosts({ bind: 'lan' }, 8443);
    expect(lan.size).toBeGreaterThanOrEqual(loopback.size);
  });

  it('rejects a cross-origin POST (Origin mismatch)', async () => {
    const res = await post({ origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((JSON.parse(res.body) as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('rejects Sec-Fetch-Site cross-site even with a matching Origin', async () => {
    expect((await post({ origin, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ origin, 'sec-fetch-site': 'same-site' })).status).toBe(403);
    expect((await post({ origin, 'sec-fetch-site': 'same-origin' })).status).toBe(200);
  });

  it('lets a non-browser client (no Origin, no Sec-Fetch-*) POST without a credential, but not a browser-like one', async () => {
    expect((await post()).status).toBe(200); // CLI / Desktop Agent
    expect((await post({ 'sec-fetch-site': 'same-origin' })).status).toBe(403); // browser metadata without Origin
    expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ 'sec-fetch-mode': 'cors' })).status).toBe(403);
    expect((await post({ 'sec-fetch-dest': 'empty' })).status).toBe(403);
    expect((await post({ origin: 'null' })).status).toBe(403); // an Origin, when present, must match
  });

  it('lets a bearer POST without Origin past the guard, but not a cross-site navigate/cors one', async () => {
    const bearer = { authorization: 'Bearer abc.def' };
    expect((await post(bearer)).status).toBe(200);
    expect((await post({ ...bearer, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' })).status).toBe(403);
    expect((await post({ ...bearer, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' })).status).toBe(403);
    expect((await post({ ...bearer, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'same-origin' })).status).toBe(200);
  });

  it('requires a valid CSRF header for cookie POSTs', async () => {
    const cookie = { cookie: `${SESSION}=good-session`, origin };
    expect((await post(cookie)).status).toBe(403);
    expect((await post({ ...cookie, 'x-dude-csrf': 'bad' })).status).toBe(403);
    expect((await post({ ...cookie, 'x-dude-csrf': 'good-csrf' })).status).toBe(200);
    expect((await post({ cookie: `${SESSION}=other`, origin, 'x-dude-csrf': 'good-csrf' })).status).toBe(403);
    expect((await post({ cookie: `${SESSION}=good-session`, 'x-dude-csrf': 'good-csrf' })).status).toBe(403); // no Origin
  });

  it('rejects both credentials (400) and a duplicated session cookie (400)', async () => {
    const both = await post({ authorization: 'Bearer abc', cookie: `${SESSION}=good-session`, origin, 'x-dude-csrf': 'good-csrf' });
    expect(both.status).toBe(400);
    const dup = await post({ cookie: `${SESSION}=a; ${SESSION}=b`, origin, 'x-dude-csrf': 'good-csrf' });
    expect(dup.status).toBe(400);
  });

  it('rejects non-JSON bodies on mutating /api requests with 415', async () => {
    const res = await request(hub.port, hub.tls.certPem, ECHO, { method: 'POST', headers: { 'content-type': 'text/plain', origin }, body: 'hi' });
    expect(res.status).toBe(415);
    expect((JSON.parse(res.body) as { error: { code: string } }).error.code).toBe('bad-request');
    const noType = await request(hub.port, hub.tls.certPem, ECHO, { method: 'POST', headers: { origin }, body: 'hi' });
    expect(noType.status).toBe(415);
  });

  it('does not apply the request guard to GET', async () => {
    expect((await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`)).status).toBe(200);
  });

  it('classifies credentials', () => {
    expect(classifyCredential({ headers: {} }).kind).toBe('none');
    expect(classifyCredential({ headers: { authorization: 'Bearer t' } })).toMatchObject({ kind: 'bearer', bearerToken: 't' });
    expect(classifyCredential({ headers: { authorization: 'Basic x' } }).kind).toBe('none');
    expect(classifyCredential({ headers: { cookie: `a=1; ${SESSION}=s` } })).toMatchObject({ kind: 'cookie', sessionCookie: 's', conflict: false });
    expect(classifyCredential({ headers: { authorization: 'Bearer t', cookie: `${SESSION}=s` } }).conflict).toBe(true);
  });

  it('parses cookies', () => {
    const parsed = parseCookies('a=1; b="two"; a=3; junk; =x');
    expect(parsed.values.get('a')).toBe('1');
    expect(parsed.values.get('b')).toBe('two');
    expect([...parsed.duplicates]).toEqual(['a']);
  });
});

describe('rate limiting', () => {
  it('answers 429 with Retry-After after the burst, and recovers as the clock advances', async () => {
    let clock = 1_000_000;
    const hub = await startTestHub({}, { now: () => clock, configure: routes });
    try {
      const get = () => request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`);
      for (let i = 0; i < 60; i++) expect((await get()).status).toBe(200);
      const limited = await get();
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBe('1');
      expect((JSON.parse(limited.body) as { error: { code: string } }).error.code).toBe('rate-limited');
      expect(limited.headers['content-security-policy']).toBe(HUB_API_CSP);
      clock += 5000; // 300/min = 5 per second
      expect((await get()).status).toBe(200);
    } finally {
      await hub.close();
    }
  });

  it('applies the stricter bucket only to authLimited routes', async () => {
    const clock = 1_000_000;
    const hub = await startTestHub({}, { now: () => clock, configure: routes });
    try {
      const limitedGet = () => request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/test/limited-get`);
      for (let i = 0; i < 10; i++) expect((await limitedGet()).status).toBe(200);
      const res = await limitedGet();
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect((await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`)).status).toBe(200);
    } finally {
      await hub.close();
    }
  });
});
