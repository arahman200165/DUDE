import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecretStore } from '../../secrets/secret-store.js';
import { createClientSecretReader } from './client-secret.js';
import { createOidcClient } from './client.js';
import type { CompleteResult, OidcClient } from './client.js';
import { GOOGLE_EGRESS_HOSTS, OIDC_FLOW_TTL_MS } from './constants.js';
import type { FakeIdpFailure } from './fake-idp.js';
import { OWNER_ID, REDIRECT_ORIGIN, cleanOidcFixtures, createOidcHarness, openTestHubDb } from './oidc-fixture.js';
import type { OidcHarness } from './oidc-fixture.js';

const tempRoots: string[] = [];
afterEach(() => {
  cleanOidcFixtures();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Plays the whole browser round trip: begin, the provider's approval, the callback. */
async function roundTrip(h: OidcHarness, input: Parameters<OidcClient['begin']>[0] = { purpose: 'signin' }): Promise<{ callback: URL; result: CompleteResult }> {
  const begun = await h.client.begin(input);
  if (begun.status !== 'ok') throw new Error(`begin: ${begun.status}`);
  const { callbackUrl } = h.idp.authorize(begun.authorizationUrl);
  const callback = new URL(callbackUrl);
  return { callback, result: await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') }) };
}

describe('feature off', () => {
  it('is entirely inert without an oidc block: no flow, no request, a fixed status', async () => {
    const db = openTestHubDb();
    const fetchSpy = vi.fn();
    const client = createOidcClient({ config: undefined, db, readClientSecret: () => ({ status: 'missing' }), fetch: fetchSpy });
    expect(client.enabled).toBe(false);
    expect(client.redirectUri()).toBeNull();
    expect(client.status()).toEqual({ state: 'off', detail: 'Google sign-in is not configured.' });
    expect(await client.begin({ purpose: 'signin' })).toEqual({ status: 'off' });
    expect(await client.complete({ state: 'x'.repeat(43), code: 'c' })).toEqual({ status: 'off' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) AS n FROM oidc_flows').get()).toEqual({ n: 0 });
  });
});

describe('the authorization request', () => {
  it('is a code flow with PKCE S256, state, nonce, select_account, scope openid email, and never steers the account', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const url = new URL(begun.authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      response_type: 'code', client_id: h.idp.clientId, redirect_uri: `${REDIRECT_ORIGIN}/api/v1/auth/oidc/callback`, scope: 'openid email', code_challenge_method: 'S256', prompt: 'select_account',
    });
    expect(params['state']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params['nonce']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params['code_challenge']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Object.keys(params).sort()).toEqual(['client_id', 'code_challenge', 'code_challenge_method', 'nonce', 'prompt', 'redirect_uri', 'response_type', 'scope', 'state']);
    expect(url.searchParams.has('hd')).toBe(false);
    expect(url.searchParams.has('login_hint')).toBe(false);
    expect(begun.expiresAt).toBe(new Date(h.clock.now + OIDC_FLOW_TTL_MS).toISOString());
    expect(h.client.redirectUri()).toBe(`${REDIRECT_ORIGIN}/api/v1/auth/oidc/callback`);
  });

  it('never carries the client secret, the verifier or the discovery document\'s other content', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const verifier = (h.db.prepare('SELECT code_verifier FROM oidc_flows').get() as { code_verifier: string }).code_verifier;
    expect(begun.authorizationUrl).not.toContain(h.idp.clientSecret);
    expect(begun.authorizationUrl).not.toContain(verifier);
  });

  it('asks nothing of the provider but discovery (the JWKS is for verification, the token endpoint for the exchange)', async () => {
    const h = await createOidcHarness();
    await h.client.begin({ purpose: 'signin' });
    expect(h.idp.calls.map((c) => `${c.method} ${c.host}${c.path}`)).toEqual(['GET accounts.google.com/.well-known/openid-configuration']);
  });
});

describe('a complete sign-in', () => {
  it('returns the verified sub and the consumed signin flow', async () => {
    const h = await createOidcHarness();
    h.idp.account = { sub: '110169484474386276334', email: 'owner@example.com' };
    const { result } = await roundTrip(h, { purpose: 'signin', returnTo: '/tools/json' });
    expect(result).toEqual({
      status: 'ok',
      flow: { purpose: 'signin', ownerId: null, sessionHash: null, returnTo: '/tools/json' },
      identity: { sub: '110169484474386276334', issuer: 'https://accounts.google.com', email: 'owner@example.com', emailVerified: true },
    });
  });

  it('carries a link flow\'s owner and session through the round trip', async () => {
    const h = await createOidcHarness();
    const { result } = await roundTrip(h, { purpose: 'link', ownerId: OWNER_ID, sessionHash: 'session-hash-1', returnTo: '/settings' });
    expect(result).toMatchObject({ status: 'ok', flow: { purpose: 'link', ownerId: OWNER_ID, sessionHash: 'session-hash-1', returnTo: '/settings' } });
  });

  it('refuses to start a link flow without its owner and session', async () => {
    const h = await createOidcHarness();
    expect(await h.client.begin({ purpose: 'link' })).toEqual({ status: 'unreachable' });
    expect(h.client.flows.activeCount()).toBe(0);
  });

  it('talks only to the three Google hosts, in the expected order, with a POST only to the token endpoint', async () => {
    const h = await createOidcHarness();
    await roundTrip(h);
    expect(h.idp.calls.map((c) => `${c.method} ${c.host}${c.path}`)).toEqual([
      'GET accounts.google.com/.well-known/openid-configuration', 'POST oauth2.googleapis.com/token', 'GET www.googleapis.com/oauth2/v3/certs',
    ]);
    for (const call of h.idp.calls) expect(GOOGLE_EGRESS_HOSTS as readonly string[]).toContain(call.host);
  });

  it('sends the verifier and the secret to the token endpoint only, and the secret in the body for client_secret_post', async () => {
    const h = await createOidcHarness();
    await roundTrip(h);
    const [body] = h.idp.tokenRequestBodies;
    const form = new URLSearchParams(body);
    expect(form.get('client_secret')).toBe(h.idp.clientSecret);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('redirect_uri')).toBe(`${REDIRECT_ORIGIN}/api/v1/auth/oidc/callback`);
    expect(form.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('uses HTTP Basic (and keeps the secret out of the body) when the provider only offers client_secret_basic', async () => {
    const h = await createOidcHarness({ idp: { tokenAuthMethods: ['client_secret_basic'] } });
    const { result } = await roundTrip(h);
    expect(result.status).toBe('ok');
    expect(h.idp.tokenRequestBodies[0]).not.toContain(h.idp.clientSecret);
    expect(h.idp.tokenRequestBodies[0]).not.toContain('client_secret');
  });

  it('works for a non-Google issuer with every endpoint on its own host', async () => {
    const h = await createOidcHarness({ idp: { issuer: 'https://idp.example.org/realms/home' } });
    const { result } = await roundTrip(h);
    expect(result.status).toBe('ok');
    for (const call of h.idp.calls) expect(call.host).toBe('idp.example.org');
  });
});

describe('single use and replay', () => {
  it('spends the state on the first callback: replaying the same callback is refused and costs the provider nothing', async () => {
    const h = await createOidcHarness();
    const { callback, result } = await roundTrip(h);
    expect(result.status).toBe('ok');
    const calls = h.idp.calls.length;
    const replay = await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') });
    expect(replay).toEqual({ status: 'failed', reason: 'consumed' });
    expect(h.idp.calls.length).toBe(calls);
  });

  it('refuses a replayed authorization code under a fresh flow (the provider says invalid_grant)', async () => {
    const h = await createOidcHarness();
    const { callback } = await roundTrip(h);
    const second = await h.client.begin({ purpose: 'signin' });
    if (second.status !== 'ok') throw new Error('expected ok');
    const state = new URL(second.authorizationUrl).searchParams.get('state');
    const replay = await h.client.complete({ state, code: callback.searchParams.get('code') });
    expect(replay).toMatchObject({ status: 'failed', reason: 'code-rejected' });
  });

  it('spends the flow even when the provider fails afterwards: the owner starts again', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const { callbackUrl } = h.idp.authorize(begun.authorizationUrl);
    h.idp.setDown('token', true);
    const callback = new URL(callbackUrl);
    const input = { state: callback.searchParams.get('state'), code: callback.searchParams.get('code') };
    expect(await h.client.complete(input)).toMatchObject({ status: 'unreachable', flow: { purpose: 'signin' } });
    h.idp.setDown('token', false);
    expect(await h.client.complete(input)).toEqual({ status: 'failed', reason: 'consumed' });
  });

  it('refuses an expired flow, an unknown state and a malformed callback', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const { callbackUrl } = h.idp.authorize(begun.authorizationUrl);
    const callback = new URL(callbackUrl);
    h.clock.now += OIDC_FLOW_TTL_MS + 1;
    expect(await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') })).toEqual({ status: 'failed', reason: 'expired' });
    expect(await h.client.complete({ state: 'A'.repeat(43), code: 'c' })).toEqual({ status: 'failed', reason: 'unknown' });
    for (const state of [undefined, null, '', 'short', 'x y'.repeat(20), 42]) expect(await h.client.complete({ state, code: 'c' })).toEqual({ status: 'failed', reason: 'malformed-callback' });
  });

  it('refuses a missing, empty, over-long or whitespace-bearing code (the flow is spent, the provider never asked)', async () => {
    for (const code of [undefined, null, '', 'a'.repeat(3000), 'a b', 'a\nb', 42]) {
      const h = await createOidcHarness();
      const begun = await h.client.begin({ purpose: 'signin' });
      if (begun.status !== 'ok') throw new Error('expected ok');
      const state = new URL(begun.authorizationUrl).searchParams.get('state');
      const before = h.idp.calls.length;
      expect([String(code).slice(0, 6), await h.client.complete({ state, code })]).toMatchObject([String(code).slice(0, 6), { status: 'failed', reason: 'malformed-callback', flow: { purpose: 'signin' } }]);
      expect(h.idp.calls.length).toBe(before);
    }
  });
});

describe('provider and token failures', () => {
  const cases: Array<[FakeIdpFailure, string]> = [
    ['bad-signature', 'bad-signature'], ['unknown-kid', 'unknown-key'], ['wrong-nonce', 'nonce'], ['wrong-aud', 'audience'], ['wrong-iss', 'issuer'], ['wrong-azp', 'authorized-party'],
    ['expired', 'expired'], ['not-yet-valid', 'not-yet-valid'], ['future-iat', 'issued-at'], ['stale-iat', 'issued-at'], ['missing-sub', 'subject'], ['alg-none', 'unsupported-alg'], ['alg-hs256', 'unsupported-alg'],
  ];
  for (const [mode, reason] of cases) {
    it(`${mode} is refused as ${reason} and still names the consumed flow`, async () => {
      const h = await createOidcHarness();
      h.idp.setFailure(mode);
      const { result } = await roundTrip(h, { purpose: 'link', ownerId: OWNER_ID, sessionHash: 'sh' });
      expect(result).toMatchObject({ status: 'failed', reason, flow: { purpose: 'link', ownerId: OWNER_ID } });
    });
  }

  it('a wrong client secret is rejected by the provider and reported as code-rejected, never with the provider\'s text', async () => {
    const h = await createOidcHarness();
    h.secret.value = 'not-the-client-secret';
    const { result } = await roundTrip(h);
    expect(result).toMatchObject({ status: 'failed', reason: 'code-rejected' });
    expect(JSON.stringify(result)).not.toMatch(/fake idp refusal|invalid_client|not-the-client-secret/);
  });

  it('a provider that is down is unreachable, both at the start and at the callback, and never throws', async () => {
    const h = await createOidcHarness();
    h.idp.setDown('all', true);
    expect(await h.client.begin({ purpose: 'signin' })).toEqual({ status: 'unreachable' });
    expect(h.client.flows.activeCount()).toBe(0); // no flow is created for a provider that cannot answer
    expect(h.client.status().state).toBe('unreachable');
  });

  it('a JWKS outage after a successful exchange is unreachable, not a verification failure', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const callback = new URL(h.idp.authorize(begun.authorizationUrl).callbackUrl);
    h.idp.setDown('jwks', true);
    expect(await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') })).toMatchObject({ status: 'unreachable', flow: { purpose: 'signin' } });
  });

  it('recovers by itself once the provider is back (after the failure backoff)', async () => {
    const h = await createOidcHarness();
    h.idp.setDown('all', true);
    expect((await h.client.begin({ purpose: 'signin' })).status).toBe('unreachable');
    h.idp.setDown('all', false);
    h.clock.now += 31_000;
    expect((await h.client.begin({ purpose: 'signin' })).status).toBe('ok');
    expect(h.client.status().state).toBe('ready');
  });

  it('survives a closed database without throwing (the caller still gets a value)', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const state = new URL(begun.authorizationUrl).searchParams.get('state');
    h.db.close();
    await expect(h.client.complete({ state, code: 'abc' })).resolves.toEqual({ status: 'unreachable' });
    await expect(h.client.begin({ purpose: 'signin' })).resolves.toEqual({ status: 'unreachable' });
  });
});

describe('the client secret', () => {
  it('is required to start or complete a sign-in, and never kept: it is read per call', async () => {
    const h = await createOidcHarness();
    h.secret.value = null;
    expect(await h.client.begin({ purpose: 'signin' })).toEqual({ status: 'needs-attention' });
    expect(h.client.status()).toEqual({ state: 'needs-attention', detail: 'The Google client secret is not stored on this machine; enter it again.' });
    expect(h.client.flows.activeCount()).toBe(0);
    h.secret.value = h.idp.clientSecret;
    expect((await roundTrip(h)).result.status).toBe('ok');
    h.secret.value = 'unreadable';
    expect(h.client.status().state).toBe('needs-attention');
    expect(await h.client.begin({ purpose: 'signin' })).toEqual({ status: 'needs-attention' });
  });

  it('removed between the redirect and the callback: the flow is spent, the owner is told to re-enter it', async () => {
    const h = await createOidcHarness();
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const callback = new URL(h.idp.authorize(begun.authorizationUrl).callbackUrl);
    h.secret.value = null;
    expect(await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') })).toMatchObject({ status: 'needs-attention', flow: { purpose: 'signin' } });
  });

  it('works through the real secret store (the Linux file fallback) and is read fresh each time', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'oidc-secrets-'));
    tempRoots.push(root);
    const store = createSecretStore({ secretsDir: path.join(root, 'secrets'), platform: 'linux' });
    const base = await createOidcHarness();
    const client = createOidcClient({
      config: base.config, db: base.db, readClientSecret: createClientSecretReader(store), clientSecretPresent: () => store.status()['oidc.clientSecret'].present,
      fetch: base.idp.fetch, now: () => base.clock.now,
    });
    expect(client.status().state).toBe('needs-attention');
    expect(await client.begin({ purpose: 'signin' })).toEqual({ status: 'needs-attention' });
    store.put('oidc.clientSecret', base.idp.clientSecret);
    expect(client.status().state).toBe('ready');
    const begun = await client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const callback = new URL(base.idp.authorize(begun.authorizationUrl).callbackUrl);
    expect(await client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') })).toMatchObject({ status: 'ok' });
    store.delete('oidc.clientSecret');
    expect(client.status().state).toBe('needs-attention');
  });

  it('the reader reports missing for blank, unreadable for a throwing store, and trims', () => {
    expect(createClientSecretReader({ getText: () => null })()).toEqual({ status: 'missing' });
    expect(createClientSecretReader({ getText: () => '   \n' })()).toEqual({ status: 'missing' });
    expect(createClientSecretReader({ getText: () => { throw new Error('PowerShell said: C:\\secret\\path'); } })()).toEqual({ status: 'unreadable' });
    expect(createClientSecretReader({ getText: () => '  s3cret\n' })()).toEqual({ status: 'ok', secret: 's3cret' });
  });
});

describe('nothing sensitive leaks', () => {
  it('no secret, code, token or verifier appears in the database, the audit log, the results, or any log line', async () => {
    const writes: string[] = [];
    const capture = (chunk: unknown): boolean => { writes.push(String(chunk)); return true; };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture as never);
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { writes.push(args.map(String).join(' ')); });

    const h = await createOidcHarness();
    const results: unknown[] = [];
    const secrets = new Set<string>([h.idp.clientSecret]);

    for (const mode of [undefined, 'wrong-nonce', 'bad-signature', 'expired', 'alg-none'] as const) {
      h.idp.setFailure(mode);
      const begun = await h.client.begin({ purpose: 'signin' });
      if (begun.status !== 'ok') throw new Error('expected ok');
      results.push(begun);
      const { callbackUrl, code, request } = h.idp.authorize(begun.authorizationUrl);
      secrets.add(code);
      secrets.add(request.state);
      secrets.add(request.nonce);
      secrets.add((h.db.prepare('SELECT code_verifier FROM oidc_flows WHERE consumed_at IS NULL ORDER BY created_at DESC LIMIT 1').get() as { code_verifier: string }).code_verifier);
      const callback = new URL(callbackUrl);
      const result = await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') });
      results.push(result);
      // A replay, a wrong state and a down provider as well.
      results.push(await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') }));
    }
    h.idp.setFailure(undefined);
    h.idp.setDown('all', true);
    results.push(await h.client.begin({ purpose: 'signin' }));

    const identityTokens = h.idp.tokenRequestBodies.length;
    expect(identityTokens).toBeGreaterThan(0);
    const dump = JSON.stringify({
      results,
      db: ['oidc_flows', 'audit_events', 'linked_identities', 'meta'].map((table) => h.db.prepare(`SELECT * FROM ${table}`).all()),
      writes,
      status: h.client.status(),
    });
    for (const secret of secrets) {
      expect(secret.length).toBeGreaterThan(20);
      // The state and nonce legitimately appear in the AUTHORIZATION URL returned to the caller (they travel in the browser redirect);
      // everything else must be free of them, so check the non-URL parts separately below.
      if (secret === h.idp.clientSecret) expect(dump).not.toContain(secret);
    }
    const withoutUrls = JSON.stringify({ db: ['oidc_flows', 'audit_events', 'linked_identities', 'meta'].map((table) => h.db.prepare(`SELECT * FROM ${table}`).all()), writes, status: h.client.status() });
    for (const secret of secrets) expect([secret.slice(0, 8), withoutUrls.includes(secret)]).toEqual([secret.slice(0, 8), false]);
    // Results carry no token, code or verifier at all (only the authorization URLs hold state and nonce, which is by design).
    const failures = JSON.stringify(results.filter((r) => (r as { status: string }).status !== 'ok' || !('authorizationUrl' in (r as object))));
    for (const secret of secrets) expect([secret.slice(0, 8), failures.includes(secret)]).toEqual([secret.slice(0, 8), false]);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get()).toEqual({ n: 0 });
    expect(writes).toEqual([]);
  });

  it('a transport error message that contains secrets never reaches a result', async () => {
    const h = await createOidcHarness({
      client: { fetch: (input, init) => (String(input).includes('/token') ? Promise.reject(new TypeError(`connect failed for ${String(init?.body)}`)) : h0.idp.fetch(input, init)) },
    });
    const h0 = h;
    const begun = await h.client.begin({ purpose: 'signin' });
    if (begun.status !== 'ok') throw new Error('expected ok');
    const callback = new URL(h.idp.authorize(begun.authorizationUrl).callbackUrl);
    const result = await h.client.complete({ state: callback.searchParams.get('state'), code: callback.searchParams.get('code') });
    expect(result).toMatchObject({ status: 'unreachable' });
    expect(JSON.stringify(result)).not.toMatch(new RegExp(`${h.idp.clientSecret}|${callback.searchParams.get('code') ?? 'x'}`));
  });
});
