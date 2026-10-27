import { describe, expect, it, vi } from 'vitest';
import { GOOGLE_EGRESS_HOSTS } from './constants.js';
import { OidcEgressError, allowedEgressHosts, createOidcEgress } from './egress.js';
import type { FetchLike } from './egress.js';

const GOOGLE = [...GOOGLE_EGRESS_HOSTS];
const json = (body: unknown, init: ResponseInit = {}): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try { await promise; } catch (error) { if (error instanceof OidcEgressError) return error.code; throw error; }
  return 'resolved';
};

describe('the host allowlist', () => {
  it('is the three Google hosts for the Google issuer and exactly the issuer host for any other', () => {
    expect(allowedEgressHosts('https://accounts.google.com')).toEqual(['accounts.google.com', 'oauth2.googleapis.com', 'www.googleapis.com']);
    expect(allowedEgressHosts('https://idp.example.org/realms/home')).toEqual(['idp.example.org']);
  });

  it('refuses every other host without making a request', async () => {
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(json({})));
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: fetchSpy });
    const hosts = [
      'https://evil.example/.well-known/openid-configuration', 'https://accounts.google.com.evil.example/x', 'https://evilaccounts.google.com/x', 'https://google.com/x',
      'https://sub.accounts.google.com/x', 'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'https://[::1]/x', 'https://127.0.0.1/x',
    ];
    for (const url of hosts) expect([url, await codeOf(egress.request(url, { method: 'GET', maxBytes: 1000 }))]).toEqual([url, 'host-not-allowed']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the three hosts case-insensitively on the default port', async () => {
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(json({ ok: true })));
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: fetchSpy });
    for (const host of GOOGLE) expect((await egress.request(`https://${host}/x`, { method: 'GET', maxBytes: 1000 })).status).toBe(200);
    expect((await egress.request('https://ACCOUNTS.google.com:443/x', { method: 'GET', maxBytes: 1000 })).status).toBe(200);
    expect(egress.isAllowedUrl('https://oauth2.googleapis.com/token')).toBe(true);
    expect(egress.isAllowedUrl('https://oauth2.googleapis.com.evil.example/token')).toBe(false);
  });

  it('refuses plain http, credentials in the URL, a fragment, another port and garbage', async () => {
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(json({})));
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: fetchSpy });
    for (const url of ['http://accounts.google.com/x', 'ftp://accounts.google.com/x', 'https://user:pw@accounts.google.com/x', 'https://user@accounts.google.com/x', 'https://accounts.google.com/x#frag', 'not a url', '']) {
      expect([url, await codeOf(egress.request(url, { method: 'GET', maxBytes: 1000 }))]).toEqual([url, 'not-https']);
    }
    expect(await codeOf(egress.request('https://accounts.google.com:8443/x', { method: 'GET', maxBytes: 1000 }))).toBe('host-not-allowed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('what a request carries', () => {
  it('never follows redirects itself, sends no cookies and no cache, and keeps caller headers', async () => {
    let seen: RequestInit | undefined;
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: (_url, init) => { seen = init; return Promise.resolve(json({})); } });
    await egress.request('https://oauth2.googleapis.com/token', { method: 'POST', maxBytes: 1000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
    expect(seen).toMatchObject({ method: 'POST', redirect: 'manual', credentials: 'omit', cache: 'no-store', body: 'a=b' });
    expect(new Headers(seen?.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
  });
});

describe('redirects', () => {
  const redirectTo = (location: string, status = 302): Response => new Response(null, { status, headers: { Location: location } });

  it('follows a same-host GET redirect (at most two hops)', async () => {
    const urls: string[] = [];
    const egress = createOidcEgress({
      allowedHosts: GOOGLE,
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve(urls.length === 1 ? redirectTo('/b') : urls.length === 2 ? redirectTo('https://accounts.google.com/c') : json({ final: true }));
      },
    });
    expect((await egress.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 })).body).toBe('{"final":true}');
    expect(urls).toEqual(['https://accounts.google.com/a', 'https://accounts.google.com/b', 'https://accounts.google.com/c']);
  });

  it('refuses a redirect to another host, even an allowlisted one', async () => {
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(redirectTo('https://oauth2.googleapis.com/token')) });
    expect(await codeOf(egress.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))).toBe('redirect-refused');
  });

  it('refuses a redirect to a host outside the allowlist, to http, and with no Location', async () => {
    for (const location of ['https://evil.example/x', 'http://accounts.google.com/x', 'https://user:pw@accounts.google.com/x']) {
      const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(redirectTo(location)) });
      expect([location, await codeOf(egress.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))]).toEqual([location, 'redirect-refused']);
    }
    const bare = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(new Response(null, { status: 302 })) });
    expect(await codeOf(bare.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))).toBe('redirect-refused');
  });

  it('never follows a redirect of a POST (the form with the secret is not replayed)', async () => {
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(redirectTo('/elsewhere', 307)));
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: fetchSpy });
    expect(await codeOf(egress.request('https://oauth2.googleapis.com/token', { method: 'POST', maxBytes: 1000, body: 'client_secret=s' }))).toBe('redirect-refused');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('stops a redirect loop after two hops', async () => {
    const fetchSpy = vi.fn<FetchLike>(() => Promise.resolve(redirectTo('/again')));
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: fetchSpy });
    expect(await codeOf(egress.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))).toBe('redirect-refused');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('bounds and failures', () => {
  it('refuses a body past the limit, by declared length and by streaming', async () => {
    const declared = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(new Response('x', { headers: { 'Content-Length': '5000' } })) });
    expect(await codeOf(declared.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))).toBe('too-large');
    const streamed = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(new Response('y'.repeat(5000))) });
    expect(await codeOf(streamed.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))).toBe('too-large');
    const exact = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(new Response('z'.repeat(1000))) });
    expect((await exact.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 })).body).toHaveLength(1000);
  });

  it('turns a hang into a timeout (one budget for every hop and the body)', async () => {
    const hang: FetchLike = (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')); }); });
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: hang, timeoutMs: 25 });
    expect(await codeOf(egress.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 }))).toBe('timeout');
  });

  it('turns a network failure into a closed code that names no URL, header or body', async () => {
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.reject(new TypeError('connect ECONNREFUSED 203.0.113.9:443 for https://accounts.google.com/a?code=SECRETCODE')) });
    let caught: unknown;
    try { await egress.request('https://accounts.google.com/a?code=SECRETCODE', { method: 'GET', maxBytes: 1000 }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(OidcEgressError);
    expect((caught as OidcEgressError).code).toBe('network');
    expect(JSON.stringify([(caught as Error).message, (caught as Error).stack?.split('\n')[0]])).not.toMatch(/SECRETCODE|203\.0\.113|accounts\.google/);
  });

  it('reports status, content type, cache-control and the body', async () => {
    const egress = createOidcEgress({ allowedHosts: GOOGLE, fetch: () => Promise.resolve(json({ a: 1 }, { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })) });
    expect(await egress.request('https://accounts.google.com/a', { method: 'GET', maxBytes: 1000 })).toEqual({ status: 400, contentType: 'application/json', cacheControl: 'no-store', body: '{"a":1}' });
  });
});
