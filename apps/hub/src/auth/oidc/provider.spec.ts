import { describe, expect, it } from 'vitest';
import { OIDC_CACHE_DEFAULT_MS, OIDC_CACHE_MAX_MS, OIDC_CACHE_MIN_MS, OIDC_CACHE_STALE_MAX_MS, OIDC_FAILURE_BACKOFF_MS, OIDC_JWKS_REFRESH_COOLDOWN_MS } from './constants.js';
import { allowedEgressHosts, createOidcEgress } from './egress.js';
import type { FetchLike } from './egress.js';
import { createFakeIdp } from './fake-idp.js';
import type { FakeIdp } from './fake-idp.js';
import { T0 } from './oidc-fixture.js';
import { cacheTtlMs, createOidcProvider, parseDiscoveryDocument, parseJwks } from './provider.js';

const HOUR = 3_600_000;

async function setup(wrap?: (idp: FakeIdp) => FetchLike) {
  const clock = { now: T0 };
  const idp = await createFakeIdp({ now: () => clock.now });
  const egress = createOidcEgress({ allowedHosts: allowedEgressHosts(idp.issuer), fetch: wrap ? wrap(idp) : idp.fetch });
  const provider = createOidcProvider({ issuer: idp.issuer, egress, now: () => clock.now });
  const count = (path: string): number => idp.calls.filter((c) => c.path === path).length;
  return { clock, idp, provider, count };
}

describe('discovery', () => {
  it('is fetched once and cached for the provider\'s max-age', async () => {
    const { clock, provider, count } = await setup();
    const first = await provider.metadata();
    expect(first).toMatchObject({ status: 'ok', stale: false, metadata: { issuer: 'https://accounts.google.com', tokenAuthMethod: 'post' } });
    await provider.metadata();
    await provider.metadata();
    expect(count('/.well-known/openid-configuration')).toBe(1);
    clock.now += HOUR + 1;
    await provider.metadata();
    expect(count('/.well-known/openid-configuration')).toBe(2);
  });

  it('shares one fetch between concurrent callers', async () => {
    const { provider, count } = await setup();
    await Promise.all([provider.metadata(), provider.metadata(), provider.jwks(), provider.jwks()]);
    expect(count('/.well-known/openid-configuration')).toBe(1);
    expect(count('/oauth2/v3/certs')).toBe(1);
  });

  it('is unreachable when the provider is down, and the failure is remembered briefly (no timeout per sign-in)', async () => {
    const { clock, idp, provider, count } = await setup();
    idp.setDown('discovery', true);
    expect(await provider.metadata()).toEqual({ status: 'unreachable' });
    expect(await provider.metadata()).toEqual({ status: 'unreachable' });
    expect(count('/.well-known/openid-configuration')).toBe(1);
    expect(provider.snapshot()).toMatchObject({ discovery: 'unreachable', lastFailureAt: T0, lastOkAt: null });
    clock.now += OIDC_FAILURE_BACKOFF_MS + 1;
    idp.setDown('discovery', false);
    expect(await provider.metadata()).toMatchObject({ status: 'ok' });
    expect(provider.snapshot()).toMatchObject({ discovery: 'ok', lastOkAt: clock.now });
  });

  it('serves a stale copy while the provider is down, up to 24 hours, then is unreachable', async () => {
    const { clock, idp, provider } = await setup();
    await provider.metadata();
    idp.setDown('all', true);
    clock.now += 2 * HOUR;
    expect(await provider.metadata()).toMatchObject({ status: 'ok', stale: true });
    clock.now += OIDC_CACHE_STALE_MAX_MS;
    expect(await provider.metadata()).toEqual({ status: 'unreachable' });
  });

  it('never throws into the caller, whatever the provider answers', async () => {
    const answers: Array<() => Response | Promise<Response>> = [
      () => new Response('<html>captive portal</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      () => new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      () => new Response('{}', { status: 500 }),
      () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      () => { throw new TypeError('fetch failed'); },
      () => Promise.reject(new Error('boom')),
    ];
    for (const answer of answers) {
      const { provider } = await setup(() => () => Promise.resolve().then(answer));
      expect(await provider.metadata()).toEqual({ status: 'unreachable' });
      expect(await provider.jwks()).toEqual({ status: 'unreachable' });
    }
  });
});

describe('discovery document validation', () => {
  const egress = { isAllowedUrl: createOidcEgress({ allowedHosts: allowedEgressHosts('https://accounts.google.com') }).isAllowedUrl };
  const good = {
    issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth', token_endpoint: 'https://oauth2.googleapis.com/token',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'],
    id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post'],
  };
  const parse = (doc: unknown) => parseDiscoveryDocument(doc, 'https://accounts.google.com', egress);

  it('accepts a well-formed Google document', () => {
    expect(parse(good)).toEqual({ issuer: 'https://accounts.google.com', authorizationEndpoint: good.authorization_endpoint, tokenEndpoint: good.token_endpoint, jwksUri: good.jwks_uri, tokenAuthMethod: 'post' });
  });

  it('refuses an issuer other than the configured one (mix-up and spoofed discovery)', () => {
    expect(parse({ ...good, issuer: 'https://accounts.google.com/' })).toBeUndefined();
    expect(parse({ ...good, issuer: 'https://evil.example' })).toBeUndefined();
    expect(parse({ ...good, issuer: undefined })).toBeUndefined();
  });

  it('refuses an endpoint outside the egress allowlist, over plain http, missing or oversized', () => {
    for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      expect([field, parse({ ...good, [field]: 'https://evil.example/x' })]).toEqual([field, undefined]);
      expect([field, parse({ ...good, [field]: 'http://accounts.google.com/x' })]).toEqual([field, undefined]);
      expect([field, parse({ ...good, [field]: undefined })]).toEqual([field, undefined]);
      expect([field, parse({ ...good, [field]: `https://accounts.google.com/${'a'.repeat(600)}` })]).toEqual([field, undefined]);
    }
  });

  it('refuses a provider that cannot do code flow, PKCE S256 or RS256', () => {
    expect(parse({ ...good, response_types_supported: ['token'] })).toBeUndefined();
    expect(parse({ ...good, code_challenge_methods_supported: ['plain'] })).toBeUndefined();
    expect(parse({ ...good, id_token_signing_alg_values_supported: ['ES256'] })).toBeUndefined();
    expect(parse({ ...good, response_types_supported: undefined, code_challenge_methods_supported: undefined, id_token_signing_alg_values_supported: undefined })).toBeDefined();
  });

  it('picks the client authentication method the provider offers', () => {
    expect(parse({ ...good, token_endpoint_auth_methods_supported: ['client_secret_basic'] })?.tokenAuthMethod).toBe('basic');
    expect(parse({ ...good, token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'] })?.tokenAuthMethod).toBe('post');
    expect(parse({ ...good, token_endpoint_auth_methods_supported: ['private_key_jwt'] })).toBeUndefined();
    expect(parse({ ...good, token_endpoint_auth_methods_supported: undefined })?.tokenAuthMethod).toBe('post');
  });
});

describe('JWKS', () => {
  it('is cached, and unreachable (not thrown) when the provider is down and nothing is cached', async () => {
    const { idp, provider, count } = await setup();
    expect(await provider.jwks()).toMatchObject({ status: 'ok', refreshed: false, keys: [{ kid: 'fake-kid-1', kty: 'RSA' }] });
    await provider.jwks();
    expect(count('/oauth2/v3/certs')).toBe(1);

    const cold = await setup();
    cold.idp.setDown('jwks', true);
    expect(await cold.provider.jwks()).toEqual({ status: 'unreachable' });
    expect(cold.provider.snapshot().discovery).toBe('unreachable');
    void idp;
  });

  it('serves stale keys while the provider is down and refuses them after 24 hours', async () => {
    const { clock, idp, provider } = await setup();
    await provider.jwks();
    idp.setDown('all', true);
    clock.now += 2 * HOUR;
    expect(await provider.jwks()).toMatchObject({ status: 'ok', stale: true });
    clock.now += OIDC_CACHE_STALE_MAX_MS;
    expect(await provider.jwks()).toEqual({ status: 'unreachable' });
  });

  it('refreshes on demand but never more often than the cooldown (a forged kid must not become a fetch per request)', async () => {
    const { clock, provider, count } = await setup();
    await provider.jwks();
    clock.now += OIDC_JWKS_REFRESH_COOLDOWN_MS + 1;
    expect(await provider.jwks({ forceRefresh: true })).toMatchObject({ status: 'ok', refreshed: true });
    expect(count('/oauth2/v3/certs')).toBe(2);
    for (let i = 0; i < 5; i += 1) expect(await provider.jwks({ forceRefresh: true })).toMatchObject({ status: 'ok', refreshed: false });
    expect(count('/oauth2/v3/certs')).toBe(2);
    clock.now += OIDC_JWKS_REFRESH_COOLDOWN_MS + 1;
    await provider.jwks({ forceRefresh: true });
    expect(count('/oauth2/v3/certs')).toBe(3);
  });

  it('picks up a rotated key on a forced refresh', async () => {
    const { clock, idp, provider } = await setup();
    await provider.jwks();
    const kid = await idp.rotateKey();
    clock.now += OIDC_JWKS_REFRESH_COOLDOWN_MS + 1;
    const refreshed = await provider.jwks({ forceRefresh: true });
    expect(refreshed.status === 'ok' && refreshed.keys.map((k) => k.kid)).toEqual(['fake-kid-1', kid]);
  });

  it('keeps only RSA signing keys, and refuses a duplicate kid, too many keys, or no usable key', () => {
    const rsa = (kid: string, extra: Record<string, unknown> = {}) => ({ kty: 'RSA', kid, n: 'abc', e: 'AQAB', ...extra });
    expect(parseJwks({ keys: [rsa('a'), { kty: 'EC', kid: 'b', crv: 'P-256', x: 'x', y: 'y' }, { kty: 'oct', kid: 'c', k: 'secret' }, rsa('d', { use: 'enc' }), rsa('e', { alg: 'RS512' }), { kty: 'RSA', n: 'abc', e: 'AQAB' }] })?.map((k) => k.kid)).toEqual(['a']);
    expect(parseJwks({ keys: [rsa('a'), rsa('a')] })).toBeUndefined();
    expect(parseJwks({ keys: Array.from({ length: 21 }, (_, i) => rsa(`k${String(i)}`)) })).toBeUndefined();
    expect(parseJwks({ keys: [{ kty: 'oct', kid: 'c', k: 'secret' }] })).toBeUndefined();
    expect(parseJwks({ keys: 'nope' })).toBeUndefined();
    expect(parseJwks([])).toBeUndefined();
    expect(parseJwks(null)).toBeUndefined();
  });

  it('never returns private key material, only the public members it recognizes', () => {
    const keys = parseJwks({ keys: [{ kty: 'RSA', kid: 'a', n: 'abc', e: 'AQAB', d: 'PRIVATE', p: 'P', q: 'Q', x5c: ['cert'] }] });
    expect(JSON.stringify(keys)).not.toMatch(/PRIVATE|"p"|"q"|x5c/);
  });
});

describe('cache lifetime', () => {
  it('honors Cache-Control max-age within the Hub\'s bounds and defaults otherwise', () => {
    expect(cacheTtlMs('public, max-age=3600')).toBe(HOUR);
    expect(cacheTtlMs('max-age=1')).toBe(OIDC_CACHE_MIN_MS);
    expect(cacheTtlMs('max-age=999999999')).toBe(OIDC_CACHE_MAX_MS);
    expect(cacheTtlMs('no-store')).toBe(OIDC_CACHE_DEFAULT_MS);
    expect(cacheTtlMs('max-age=abc')).toBe(OIDC_CACHE_DEFAULT_MS);
    expect(cacheTtlMs(undefined)).toBe(OIDC_CACHE_DEFAULT_MS);
  });
});
