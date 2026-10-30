import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { OIDC_CALLBACK_PATH } from '../auth/oidc/constants.js';
import { makeWebRoot, request, startTestHub } from '../server/test-helpers.js';
import type { TestHub } from '../server/test-helpers.js';
import { CROSS_SITE_GET_ALLOWLIST, QUERY_MAX_CHARS, evaluateCrossSiteGet } from './cross-site-get.js';

const CALLBACK = '/api/v1/auth/oidc/callback';
const CROSS_NAV = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
const QUERY = '?code=4%2F0AbCdEf&state=abc';

describe('the allowlist constant', () => {
  it('names exactly three cross-site GETs: the OIDC callback and the Google Drive and OneDrive backup callbacks (Milestones 856 and 857), GET only, each behind its feature', () => {
    expect(CROSS_SITE_GET_ALLOWLIST).toHaveLength(3);
    expect(CROSS_SITE_GET_ALLOWLIST[0]).toMatchObject({ method: 'GET', path: CALLBACK, requires: 'oidc' });
    expect(CROSS_SITE_GET_ALLOWLIST[1]).toMatchObject({ method: 'GET', path: '/api/v1/backup/drive/callback', requires: 'drive' });
    expect(CROSS_SITE_GET_ALLOWLIST[2]).toMatchObject({ method: 'GET', path: '/api/v1/backup/onedrive/callback', requires: 'onedrive' });
    expect(OIDC_CALLBACK_PATH).toBe(CALLBACK);
    expect(CROSS_SITE_GET_ALLOWLIST[0]!.queryParams).toEqual(expect.arrayContaining(['code', 'state', 'error', 'error_description']));
  });

  it('lists no cookie, session or credential-looking parameter (Microsoft\'s opaque `session_state` is the one named exception, and only on its own callback)', () => {
    for (const entry of CROSS_SITE_GET_ALLOWLIST) {
      for (const name of entry.queryParams) {
        if (name === 'session_state') { expect(entry.path).toBe('/api/v1/backup/onedrive/callback'); continue; }
        expect(name).not.toMatch(/session|cookie|token|csrf|key|auth(?!user)|bearer|password/i);
      }
    }
  });
});

describe('the Google Drive backup callback exemption (Milestone 856)', () => {
  const DRIVE_CALLBACK = '/api/v1/backup/drive/callback';
  const decide = (over: { method?: string; url?: string; headers?: Record<string, string>; drive?: boolean; oidc?: boolean } = {}) =>
    evaluateCrossSiteGet({ method: over.method ?? 'GET', url: over.url ?? `${DRIVE_CALLBACK}${QUERY}`, headers: over.headers ?? CROSS_NAV, features: { oidc: over.oidc ?? false, drive: over.drive ?? true } });

  it('admits the callback navigation only while a connect waits, strips credentials, and does not depend on OIDC', () => {
    expect(decide()).toEqual({ action: 'allow-credentialless' });
    expect(decide({ oidc: true })).toEqual({ action: 'allow-credentialless' });
    expect(decide({ drive: false })).toMatchObject({ action: 'refuse', status: 403 });
    expect(evaluateCrossSiteGet({ method: 'GET', url: `${DRIVE_CALLBACK}${QUERY}`, headers: CROSS_NAV, features: { oidc: true } })).toMatchObject({ action: 'refuse', status: 403 });
    // The OIDC callback is not exempted by it, and the feature flags are independent.
    expect(decide({ url: `${CALLBACK}${QUERY}` })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ drive: false, oidc: true, url: `${CALLBACK}${QUERY}` })).toEqual({ action: 'allow-credentialless' });
  });

  it('is exactly this path and GET: no variants, no other method, only a document navigation, only the named parameters', () => {
    for (const url of ['/api/v1/backup/drive', '/api/v1/backup/drive/', `${DRIVE_CALLBACK}/`, `${DRIVE_CALLBACK}x`, `${DRIVE_CALLBACK}/x`, '/api/v1/backup/status', '/api/v1/backup/drive/connect', '/api//v1/backup/drive/callback']) {
      expect([url, decide({ url })]).toEqual([url, { action: 'refuse', status: 403, message: 'Cross-site requests are not allowed.' }]);
    }
    expect(decide({ method: 'POST' })).toEqual({ action: 'pass' });
    expect(decide({ method: 'HEAD' })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-mode': 'cors' } })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-dest': 'iframe' } })).toMatchObject({ action: 'refuse', status: 403 });
    for (const bad of ['?session=abc', '?code=c&code=d', '?access_token=t', '?return_to=/x']) expect(decide({ url: `${DRIVE_CALLBACK}${bad}` })).toMatchObject({ action: 'refuse', status: 400 });
    expect(decide({ url: `${DRIVE_CALLBACK}?code=c&state=s&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&authuser=0&prompt=consent` }).action).toBe('allow-credentialless');
    expect(decide({ headers: { ...CROSS_NAV, 'content-length': '5' } })).toMatchObject({ action: 'refuse', status: 400 });
  });
});

describe('the OneDrive backup callback exemption (Milestone 857)', () => {
  const ONEDRIVE_CALLBACK = '/api/v1/backup/onedrive/callback';
  const decide = (over: { method?: string; url?: string; headers?: Record<string, string>; onedrive?: boolean; drive?: boolean; oidc?: boolean } = {}) =>
    evaluateCrossSiteGet({ method: over.method ?? 'GET', url: over.url ?? `${ONEDRIVE_CALLBACK}${QUERY}`, headers: over.headers ?? CROSS_NAV, features: { oidc: over.oidc ?? false, drive: over.drive ?? false, onedrive: over.onedrive ?? true } });

  it('admits the callback navigation only while a OneDrive connect waits, and no other waiting feature admits it', () => {
    expect(decide()).toEqual({ action: 'allow-credentialless' });
    expect(decide({ oidc: true, drive: true })).toEqual({ action: 'allow-credentialless' });
    expect(decide({ onedrive: false })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ onedrive: false, drive: true, oidc: true })).toMatchObject({ action: 'refuse', status: 403 });
    expect(evaluateCrossSiteGet({ method: 'GET', url: `${ONEDRIVE_CALLBACK}${QUERY}`, headers: CROSS_NAV, features: { oidc: true } })).toMatchObject({ action: 'refuse', status: 403 });
    // The other callbacks are not exempted by it: the three feature flags are independent.
    expect(decide({ url: `${CALLBACK}${QUERY}` })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ url: `/api/v1/backup/drive/callback${QUERY}` })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ onedrive: false, drive: true, url: `/api/v1/backup/drive/callback${QUERY}` })).toEqual({ action: 'allow-credentialless' });
  });

  it('is exactly this path and GET: no variants, no other method, only a document navigation, only the named parameters', () => {
    for (const url of ['/api/v1/backup/onedrive', '/api/v1/backup/onedrive/', `${ONEDRIVE_CALLBACK}/`, `${ONEDRIVE_CALLBACK}x`, `${ONEDRIVE_CALLBACK}/x`, '/api/v1/backup/onedrive/connect', '/api//v1/backup/onedrive/callback']) {
      expect([url, decide({ url })]).toEqual([url, { action: 'refuse', status: 403, message: 'Cross-site requests are not allowed.' }]);
    }
    expect(decide({ method: 'POST' })).toEqual({ action: 'pass' });
    expect(decide({ method: 'HEAD' })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-mode': 'cors' } })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-dest': 'iframe' } })).toMatchObject({ action: 'refuse', status: 403 });
    for (const bad of ['?session=abc', '?code=c&code=d', '?access_token=t', '?return_to=/x', '?client_secret=s']) expect(decide({ url: `${ONEDRIVE_CALLBACK}${bad}` })).toMatchObject({ action: 'refuse', status: 400 });
    expect(decide({ url: `${ONEDRIVE_CALLBACK}?code=M.C506_BAY.2.U.abc&state=s&session_state=0cf5&error=access_denied&error_description=declined` }).action).toBe('allow-credentialless');
    expect(decide({ headers: { ...CROSS_NAV, 'content-length': '5' } })).toMatchObject({ action: 'refuse', status: 400 });
  });
});

describe('evaluateCrossSiteGet', () => {
  const decide = (over: { method?: string; url?: string; headers?: Record<string, string>; oidc?: boolean } = {}) =>
    evaluateCrossSiteGet({ method: over.method ?? 'GET', url: over.url ?? `${CALLBACK}${QUERY}`, headers: over.headers ?? CROSS_NAV, features: { oidc: over.oidc ?? true } });

  it('admits only the callback navigation, and strips credentials for it', () => {
    expect(decide()).toEqual({ action: 'allow-credentialless' });
    expect(decide({ headers: { 'sec-fetch-site': 'same-origin' } })).toEqual({ action: 'allow-credentialless' });
    expect(decide({ headers: {} })).toEqual({ action: 'allow-credentialless' });
  });

  it('refuses every other cross-site navigation under /api', () => {
    const others = [
      '/api/v1/hello', '/api/v1/devices', '/api/v1/auth/session', '/api/v1/auth/oidc', '/api/v1/auth/oidc/', '/api/v1/auth/oidc/start', `${CALLBACK}/`, `${CALLBACK}/x`, `${CALLBACK}x`,
      `${CALLBACK.toUpperCase()}`, '/api/v1/auth/oidc//callback', '/api//v1/auth/oidc/callback', '/api/v1/auth/oidc/%63allback', '/api/v1/auth/oidc/callback%2f', '/api', '/api/',
      '/api/v1/auth/oidc/callback;x', '/x/api/v1/auth/oidc/callback',
    ];
    for (const url of others) {
      const result = decide({ url: `${url}${QUERY}` });
      const startsApi = url === '/api' || url.startsWith('/api/');
      expect([url, startsApi ? result.action : 'pass']).toEqual([url, startsApi ? 'refuse' : 'pass']);
    }
  });

  it('never exempts a path through a query string trick or a fragment-like suffix', () => {
    expect(decide({ url: `/api/v1/hello?x=${CALLBACK}` }).action).toBe('refuse');
    expect(decide({ url: `/api/v1/hello?/${CALLBACK}` }).action).toBe('refuse');
    expect(decide({ url: `/api/v1/devices#${CALLBACK}` }).action).toBe('refuse');
  });

  it('does not exempt other methods (HEAD included) and leaves non-GET methods to the existing guard', () => {
    expect(decide({ method: 'HEAD' })).toMatchObject({ action: 'refuse', status: 403 });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) expect([method, decide({ method })]).toEqual([method, { action: 'pass' }]);
  });

  it('refuses a cross-site request that is not a document navigation, even to the callback', () => {
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-mode': 'cors' } })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-mode': 'no-cors' } })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-dest': 'iframe' } })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { ...CROSS_NAV, 'sec-fetch-dest': 'image' } })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ headers: { 'sec-fetch-site': 'cross-site' } })).toMatchObject({ action: 'refuse', status: 403 });
  });

  it('requires oidc to be configured: without it the callback is an ordinary refused cross-site navigation', () => {
    expect(decide({ oidc: false })).toMatchObject({ action: 'refuse', status: 403 });
    expect(decide({ oidc: false, headers: { 'sec-fetch-site': 'same-origin' } })).toEqual({ action: 'pass' });
  });

  it('accepts only the named query parameters, each once, within the size limit, and no body', () => {
    expect(decide({ url: `${CALLBACK}?error=access_denied&error_description=The+user+said+no&state=s` }).action).toBe('allow-credentialless');
    expect(decide({ url: `${CALLBACK}?code=c&state=s&scope=email+openid&authuser=0&prompt=consent&hd=example.com&iss=https%3A%2F%2Faccounts.google.com` }).action).toBe('allow-credentialless');
    expect(decide({ url: CALLBACK }).action).toBe('allow-credentialless');
    for (const bad of ['?session=abc', '?code=c&code=d', '?state=a&state=b', '?code=c&access_token=t', '?CODE=c', '?return_to=/x', '?redirect_uri=https://evil.example']) {
      expect([bad, decide({ url: `${CALLBACK}${bad}` })]).toEqual([bad, { action: 'refuse', status: 400, message: 'The request is not valid.' }]);
    }
    expect(decide({ url: `${CALLBACK}?code=${'a'.repeat(QUERY_MAX_CHARS)}` })).toMatchObject({ action: 'refuse', status: 400 });
    expect(decide({ headers: { ...CROSS_NAV, 'content-length': '5' } })).toMatchObject({ action: 'refuse', status: 400 });
    expect(decide({ headers: { ...CROSS_NAV, 'transfer-encoding': 'chunked' } })).toMatchObject({ action: 'refuse', status: 400 });
  });

  it('leaves everything outside /api alone', () => {
    for (const url of ['/', '/tools/json', '/assets/main.js', '/apix', '/application']) expect([url, decide({ url })]).toEqual([url, { action: 'pass' }]);
  });
});

describe('the request guard with OIDC configured', () => {
  let hub: TestHub;
  const seen: Array<{ cookie: string | string[] | null; authorization: string | string[] | null; url: string }> = [];
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET', body?: string) =>
    request(hub.port, hub.tls.certPem, path, { method, headers, ...(body !== undefined ? { body } : {}) });

  beforeAll(async () => {
    hub = await startTestHub(
      { webRoot: makeWebRoot(), oidc: { issuer: 'https://accounts.google.com', clientId: 'client-id', redirectOrigin: 'https://hub.example.com' } },
      {
        configure: (app: FastifyInstance) => {
          const echo = (req: { headers: Record<string, string | string[] | undefined>; url: string }) => ({ cookie: req.headers['cookie'] ?? null, authorization: req.headers['authorization'] ?? null, url: req.url });
          // The callback is the real Milestone 842 route now; this hook (added after the guard's own) records what a handler could see of it.
          app.addHook('onRequest', async (req) => { if (req.url.startsWith(CALLBACK)) seen.push(echo(req)); });
          app.get('/api/v1/test/other', async (req) => echo(req));
        },
        rateLimit: { global: { perMinute: 6000, burst: 1000 } },
      },
    );
  });
  afterAll(async () => { await hub.close(); });

  it('lets the provider\'s cross-site redirect reach the callback, with no cookie and no authorization header visible to the handler', async () => {
    const res = await get(`${CALLBACK}${QUERY}`, { ...CROSS_NAV, cookie: '__Host-dude_session=a-valid-looking-session', authorization: 'Bearer dob_stolen' });
    expect(res.status).toBe(302); // the real handler answers a redirect to the password page for a state it does not know
    expect(seen.at(-1)).toEqual({ cookie: null, authorization: null, url: `${CALLBACK}${QUERY}` });
  });

  it('strips credentials for a same-site or direct visit to the callback too (a session is never its authority)', async () => {
    for (const site of ['same-origin', 'same-site', 'none']) {
      const res = await get(`${CALLBACK}${QUERY}`, { 'sec-fetch-site': site, cookie: '__Host-dude_session=s' });
      expect([site, res.status, seen.at(-1)?.cookie]).toEqual([site, 302, null]);
    }
  });

  it('refuses everything else a cross-site navigation can ask of /api', async () => {
    for (const path of ['/api/v1/hello', '/api/v1/test/other', `${CALLBACK}/`, `${CALLBACK}x`, '/api/v1/devices']) {
      const res = await get(path, CROSS_NAV);
      expect([path, res.status]).toEqual([path, 403]);
      expect(JSON.parse(res.body).error?.code ?? JSON.parse(res.body).code).toBeDefined();
    }
  });

  it('does not change what same-site, same-origin, programmatic and cors requests could already do', async () => {
    expect((await get('/api/v1/hello')).status).toBe(200);
    expect((await get('/api/v1/hello', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' })).status).toBe(200);
    expect((await get('/api/v1/hello', { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).status).toBe(200);
    expect((await get('/api/v1/hello', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' })).status).toBe(200); // CORS governs it; the Hub sends no ACAO header
    expect((await get('/api/v1/test/other', { cookie: '__Host-dude_session=s' })).status).toBe(200);
    expect(JSON.parse((await get('/api/v1/test/other', { cookie: '__Host-dude_session=s' })).body).cookie).toBe('__Host-dude_session=s');
  });

  it('leaves static pages alone: a cross-site link to the sign-in page still loads', async () => {
    expect((await get('/', CROSS_NAV)).status).toBe(200);
    expect((await get('/some/spa/route', CROSS_NAV)).status).toBe(200);
  });

  it('answers a bad callback query with 400 and a cross-site non-navigation with 403', async () => {
    expect((await get(`${CALLBACK}?session=abc`, CROSS_NAV)).status).toBe(400);
    expect((await get(`${CALLBACK}?state=a&state=b`, CROSS_NAV)).status).toBe(400);
    expect((await get(`${CALLBACK}?code=${'a'.repeat(5000)}`, CROSS_NAV)).status).toBe(400);
    expect((await get(`${CALLBACK}${QUERY}`, { ...CROSS_NAV, 'sec-fetch-mode': 'cors' })).status).toBe(403);
    expect((await get(`${CALLBACK}${QUERY}`, CROSS_NAV, 'HEAD')).status).toBe(403);
  });

  it('does not open the callback to other methods: a cross-site POST is refused by the existing guard', async () => {
    const res = await get(CALLBACK, { ...CROSS_NAV, 'content-type': 'application/json' }, 'POST', '{}');
    expect(res.status).toBe(403);
  });
});

describe('the request guard without OIDC configured', () => {
  let hub: TestHub;
  const seen: Array<string | string[] | null> = [];
  beforeAll(async () => {
    hub = await startTestHub({ webRoot: makeWebRoot() }, {
      configure: (app: FastifyInstance) => { app.addHook('onRequest', async (req) => { if (req.url.startsWith(CALLBACK)) seen.push(req.headers['cookie'] ?? null); }); },
      rateLimit: { global: { perMinute: 6000, burst: 1000 } },
    });
  });
  afterAll(async () => { await hub.close(); });

  it('refuses the cross-site callback navigation like any other, and strips nothing for a same-site request', async () => {
    const cross = await request(hub.port, hub.tls.certPem, `${CALLBACK}${QUERY}`, { headers: CROSS_NAV });
    expect(cross.status).toBe(403);
    const same = await request(hub.port, hub.tls.certPem, `${CALLBACK}${QUERY}`, { headers: { 'sec-fetch-site': 'same-origin', cookie: 'a=b' } });
    expect(same.status).toBe(302); // the route itself answers (to the password page: Google sign-in is not configured)
    expect(seen.at(-1)).toBe('a=b');
  });
});
