import { afterEach, describe, expect, it } from 'vitest';
import { codeChallengeS256, generateCodeVerifier } from '../auth/oidc/pkce.js';
import { createOneDriveAuthorizations, onedriveRedirectUri } from './onedrive-authorization.js';
import { MICROSOFT_ONEDRIVE_ENDPOINTS, ONEDRIVE_SCOPE, buildOneDriveAuthorizationUrl, exchangeOneDriveCode, grantsOnlyAppFolder, refreshOneDriveAccessToken } from './onedrive-oauth.js';
import { createOneDriveCredentialStore, validateOneDriveClientSecret, validateOneDriveCredentials } from '../backup/destinations/onedrive/onedrive-credentials.js';
import { FakeGraphServer } from '../backup/destinations/onedrive/fake-graph-server.js';

/** Microsoft OAuth for the OneDrive destination (Milestone 857; lives under hub/ because the callback route must not import backup/): the consent URL, the code exchange, refresh with rotation, the pending authorization and the credential map. */
const servers: FakeGraphServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); });
const start = async (options: ConstructorParameters<typeof FakeGraphServer>[0] = {}) => { const server = new FakeGraphServer(options); servers.push(server); await server.start(); return server; };
const fetchImpl = (input: string, init?: RequestInit): Promise<Response> => fetch(input, init);

describe('the consent URL', () => {
  it('asks for the app folder scope and offline access only, with PKCE S256, and never sends a secret or a verifier', () => {
    const verifier = generateCodeVerifier();
    const url = new URL(buildOneDriveAuthorizationUrl({ endpoints: MICROSOFT_ONEDRIVE_ENDPOINTS, clientId: '11111111-2222-3333-4444-555555555555', redirectUri: 'https://hub.example.com/api/v1/backup/onedrive/callback', state: 'S'.repeat(43), codeVerifier: verifier }));
    expect(`${url.origin}${url.pathname}`).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code', client_id: '11111111-2222-3333-4444-555555555555', redirect_uri: 'https://hub.example.com/api/v1/backup/onedrive/callback', response_mode: 'query', scope: 'Files.ReadWrite.AppFolder offline_access',
      state: 'S'.repeat(43), code_challenge: codeChallengeS256(verifier), code_challenge_method: 'S256', prompt: 'consent',
    });
    expect(ONEDRIVE_SCOPE).toBe('Files.ReadWrite.AppFolder offline_access');
    expect(url.toString()).not.toContain(verifier);
  });

  it('only the app folder (and offline access) counts as granted, under either spelling of the scope', () => {
    for (const ok of ['Files.ReadWrite.AppFolder', 'Files.ReadWrite.AppFolder offline_access', 'https://graph.microsoft.com/Files.ReadWrite.AppFolder', 'files.readwrite.appfolder OFFLINE_ACCESS']) expect(grantsOnlyAppFolder(ok), ok).toBe(true);
    for (const bad of ['', 'offline_access', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Files.ReadWrite.AppFolder User.Read', 'Files.ReadWrite.AppFolder Files.Read.All', 'https://graph.microsoft.com/Files.ReadWrite.AppFolder openid']) expect(grantsOnlyAppFolder(bad), bad).toBe(false);
  });
});

describe('the token calls', () => {
  it('exchanges a code with the PKCE verifier and keeps only the refresh token', async () => {
    const server = await start();
    const verifier = generateCodeVerifier();
    const consent = server.authorize(buildOneDriveAuthorizationUrl({ endpoints: server.endpoints(), clientId: server.options.clientId, redirectUri: 'https://hub.example.com/cb', state: 's'.repeat(43), codeVerifier: verifier })) as { code: string };
    const base = { fetch: fetchImpl, endpoints: server.endpoints(), clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectUri: 'https://hub.example.com/cb' };
    expect(await exchangeOneDriveCode({ ...base, code: consent.code, codeVerifier: generateCodeVerifier() })).toEqual({ status: 'rejected', error: 'invalid_grant' }); // wrong verifier, and the code is spent
    const second = server.authorize(buildOneDriveAuthorizationUrl({ endpoints: server.endpoints(), clientId: server.options.clientId, redirectUri: 'https://hub.example.com/cb', state: 's'.repeat(43), codeVerifier: verifier })) as { code: string };
    const exchanged = await exchangeOneDriveCode({ ...base, code: second.code, codeVerifier: verifier });
    expect(exchanged).toEqual({ status: 'ok', refreshToken: expect.stringMatching(/^M\.C506_BAY\.0\.U\./) });
    expect(Object.keys(exchanged)).toEqual(['status', 'refreshToken']);
    expect(await exchangeOneDriveCode({ ...base, clientSecret: 'not~the.secret_value-0123456789', code: second.code, codeVerifier: verifier })).toEqual({ status: 'rejected', error: 'invalid_client' });
  });

  it('refuses a response that grants more than the app folder or no refresh token, and reports Microsoft being down as unreachable', async () => {
    const server = await start();
    const base = { endpoints: server.endpoints(), clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectUri: 'r', code: 'c', codeVerifier: generateCodeVerifier() };
    const respond = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ refresh_token: 'rt', scope: 'Files.ReadWrite.AppFolder Files.ReadWrite.All', token_type: 'Bearer' }) })).toEqual({ status: 'scope-refused' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ refresh_token: 'rt', scope: 'Files.ReadWrite', token_type: 'Bearer' }) })).toEqual({ status: 'scope-refused' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ scope: 'Files.ReadWrite.AppFolder', token_type: 'Bearer' }) })).toEqual({ status: 'no-refresh-token' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ refresh_token: 'has a space', scope: 'Files.ReadWrite.AppFolder' }) })).toEqual({ status: 'invalid-response' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ refresh_token: 'x'.repeat(4097), scope: 'Files.ReadWrite.AppFolder' }) })).toEqual({ status: 'invalid-response' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ refresh_token: 'rt', token_type: 'mac' }) })).toEqual({ status: 'invalid-response' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({ error: 'something odd and provider specific' }, 400) })).toEqual({ status: 'rejected', error: 'unknown' });
    expect(await exchangeOneDriveCode({ ...base, fetch: respond({}, 503) })).toEqual({ status: 'unreachable' });
    expect(await exchangeOneDriveCode({ ...base, fetch: async () => { throw new Error('ECONNREFUSED secret-in-the-message'); } })).toEqual({ status: 'unreachable' });
  });

  it('refreshes an access token and hands back the ROTATED refresh token; a revoked consent, an expired token and a needed interaction are all `revoked`', async () => {
    const server = await start();
    const token = server.issueRefreshToken();
    const base = { fetch: fetchImpl, endpoints: server.endpoints(), clientId: server.options.clientId, clientSecret: server.options.clientSecret };
    const first = await refreshOneDriveAccessToken({ ...base, refreshToken: token });
    expect(first).toEqual({ status: 'ok', accessToken: expect.stringMatching(/^EwB/), refreshToken: expect.stringMatching(/^M\.C506_BAY\.0\.U\./), expiresInSeconds: 3600 });
    expect((first as { refreshToken: string }).refreshToken).not.toBe(token);
    expect(await refreshOneDriveAccessToken({ ...base, refreshToken: 'unknown-token' })).toEqual({ status: 'revoked' });
    expect(await refreshOneDriveAccessToken({ ...base, clientSecret: 'not~the.secret_value-0123456789', refreshToken: token })).toEqual({ status: 'rejected', error: 'invalid_client' });
    server.revokeAll();
    expect(await refreshOneDriveAccessToken({ ...base, refreshToken: token })).toEqual({ status: 'revoked' });
    const respond = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    for (const error of ['interaction_required', 'consent_required', 'login_required', 'invalid_grant']) expect(await refreshOneDriveAccessToken({ ...base, fetch: respond({ error }, 400), refreshToken: token }), error).toEqual({ status: 'revoked' });
    // No new refresh token in the answer: the caller keeps the one it has. A malformed one is refused, never half-adopted.
    expect(await refreshOneDriveAccessToken({ ...base, fetch: respond({ access_token: 'EwBaccess', expires_in: 600 }), refreshToken: token })).toEqual({ status: 'ok', accessToken: 'EwBaccess', refreshToken: undefined, expiresInSeconds: 600 });
    expect(await refreshOneDriveAccessToken({ ...base, fetch: respond({ access_token: 'EwBaccess', refresh_token: 'has a space' }), refreshToken: token })).toEqual({ status: 'invalid-response' });
    expect(await refreshOneDriveAccessToken({ ...base, fetch: respond({ access_token: 'has a space' }), refreshToken: token })).toEqual({ status: 'invalid-response' });
    expect(await refreshOneDriveAccessToken({ ...base, fetch: respond({}, 429), refreshToken: token })).toEqual({ status: 'unreachable' });
  });

  it('never follows a redirect from the token endpoint', async () => {
    const calls: string[] = [];
    const redirecting = async (input: string, init?: RequestInit): Promise<Response> => {
      calls.push(`${input} ${String(init?.redirect)}`);
      return new Response(null, { status: 302, headers: { location: 'https://evil.example.com/token' } });
    };
    const result = await refreshOneDriveAccessToken({ fetch: redirecting, endpoints: MICROSOFT_ONEDRIVE_ENDPOINTS, clientId: 'c', clientSecret: 'secret-value', refreshToken: 'rt' });
    expect(result).toEqual({ status: 'rejected', error: 'unknown' });
    expect(calls).toEqual(['https://login.microsoftonline.com/consumers/oauth2/v2.0/token manual']);
  });
});

describe('the pending authorization', () => {
  const T0 = Date.parse('2026-10-30T12:00:00Z');
  it('is single-use, short-lived, one at a time, and hands the refresh token over exactly once', async () => {
    const server = await start();
    let clock = T0;
    const auth = createOneDriveAuthorizations({ now: () => clock, endpoints: server.endpoints() });
    const begin = () => auth.begin({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: 'https://hub.example.com' });
    const first = begin();
    expect(first.redirectUri).toBe(onedriveRedirectUri('https://hub.example.com'));
    expect(first.redirectUri).toBe('https://hub.example.com/api/v1/backup/onedrive/callback');
    expect(auth.waiting()).toBe(true);
    expect(auth.status(first.pendingId)).toEqual({ state: 'waiting', expiresAt: new Date(T0 + 10 * 60_000).toISOString() });
    expect(auth.status('x'.repeat(32))).toEqual({ state: 'unknown' });
    expect(auth.take(first.pendingId)).toBeUndefined(); // nothing authorized yet
    const approved = server.authorize(first.authorizationUrl) as { code: string; state: string };
    expect(await auth.handleCallback({ state: approved.state, code: approved.code, error: undefined })).toEqual({ result: 'authorized' });
    expect(await auth.handleCallback({ state: approved.state, code: approved.code, error: undefined })).toEqual({ result: 'unknown' });
    expect(auth.waiting()).toBe(false);
    const taken = auth.take(first.pendingId);
    expect(taken).toEqual({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, refreshToken: expect.stringMatching(/^M\.C506_BAY\.0\.U\./) });
    expect(auth.take(first.pendingId)).toBeUndefined();
    expect(auth.status(first.pendingId)).toEqual({ state: 'unknown' });
    // Expiry: ten minutes, then the state is dead and the held secrets are dropped.
    const second = begin();
    const approvedLate = server.authorize(second.authorizationUrl) as { code: string; state: string };
    clock += 10 * 60_000 + 1;
    expect(auth.waiting()).toBe(false);
    expect(auth.status(second.pendingId)).toEqual({ state: 'expired' });
    expect(await auth.handleCallback({ state: approvedLate.state, code: approvedLate.code, error: undefined })).toEqual({ result: 'unknown' });
    // A new start replaces the old one.
    const third = begin();
    const fourth = begin();
    expect(auth.status(third.pendingId)).toEqual({ state: 'unknown' });
    expect(auth.status(fourth.pendingId)).toMatchObject({ state: 'waiting' });
    auth.cancel();
    expect(auth.waiting()).toBe(false);
  });

  it('refuses malformed, oversized or wrong states and codes without calling Microsoft, and records a decline and a refusal with closed reasons', async () => {
    const calls: string[] = [];
    const auth = createOneDriveAuthorizations({ endpoints: MICROSOFT_ONEDRIVE_ENDPOINTS, fetch: async (input) => { calls.push(String(input)); return new Response('{}', { status: 400 }); } });
    const started = auth.begin({ clientId: 'c', clientSecret: 'secret-value-123', redirectOrigin: 'https://hub.example.com' });
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    for (const bad of [undefined, 42, '', 'short', 'A'.repeat(300), `${state}x`, 'A'.repeat(43)]) expect(await auth.handleCallback({ state: bad, code: 'c', error: undefined }), String(bad)).toEqual({ result: 'unknown' });
    expect(auth.waiting()).toBe(true); // none of that spent the real state
    expect(await auth.handleCallback({ state, code: 'x'.repeat(3000), error: undefined })).toEqual({ result: 'failed', reason: 'no-code' });
    expect(calls).toEqual([]);
    expect(auth.status(started.pendingId)).toEqual({ state: 'failed', reason: 'no-code' });
    const second = auth.begin({ clientId: 'c', clientSecret: 'secret-value-123', redirectOrigin: 'https://hub.example.com' });
    expect(await auth.handleCallback({ state: new URL(second.authorizationUrl).searchParams.get('state'), code: undefined, error: 'access_denied' })).toEqual({ result: 'failed', reason: 'declined' });
    const third = auth.begin({ clientId: 'c', clientSecret: 'secret-value-123', redirectOrigin: 'https://hub.example.com' });
    expect(await auth.handleCallback({ state: new URL(third.authorizationUrl).searchParams.get('state'), code: 'c', error: undefined })).toEqual({ result: 'failed', reason: 'unknown' });
    expect(calls).toHaveLength(1);
  });
});

describe('the credential map', () => {
  const memory = () => {
    const values = new Map<string, Buffer>();
    return {
      get: (p: string) => { const v = values.get(p); return v === undefined ? null : Buffer.from(v); }, put: (p: string, v: Uint8Array | string) => { values.set(p, Buffer.from(v)); },
      delete: (p: string) => values.delete(p), status: () => ({ 'backup.onedrive.refreshToken': { present: values.has('backup.onedrive.refreshToken'), needsReentry: false } }), values,
    };
  };
  const SECRET = 'fake~Client.Secret_Value-0123456789';
  it('keeps one protected purpose keyed by destination id, validates every field and deletes the purpose with its last entry', () => {
    const raw = memory();
    const store = createOneDriveCredentialStore(raw as never);
    expect(store.has('d-1')).toBe(false);
    expect(store.get('d-1')).toBeNull();
    store.put('d-1', { clientSecret: SECRET, refreshToken: 'M.C506_BAY.0.U.refresh-token_0123' });
    store.put('d-2', { clientSecret: `${SECRET}-2`, refreshToken: 'M.C506_BAY.0.U.other-token_0123' });
    expect(JSON.parse(raw.values.get('backup.onedrive.refreshToken')!.toString('utf8'))).toEqual({ v: 1, credentials: { 'd-1': { clientSecret: SECRET, refreshToken: 'M.C506_BAY.0.U.refresh-token_0123' }, 'd-2': { clientSecret: `${SECRET}-2`, refreshToken: 'M.C506_BAY.0.U.other-token_0123' } } });
    expect(store.has('d-1') && store.has('d-2')).toBe(true);
    expect(store.delete('d-1')).toBe(true);
    expect(store.delete('d-1')).toBe(false);
    expect(store.get('d-2')).toMatchObject({ refreshToken: 'M.C506_BAY.0.U.other-token_0123' });
    expect(store.delete('d-2')).toBe(true);
    expect(raw.values.size).toBe(0);
    expect(() => store.put('d-3', { clientSecret: 'short', refreshToken: 'x' })).toThrow(/Invalid OneDrive credentials/);
    expect(validateOneDriveClientSecret('has space in it 123')).toBeNull();
    expect(validateOneDriveCredentials({ clientSecret: SECRET, refreshToken: 'x', extra: 1 })).toBe('credentials has an unknown field');
    expect(validateOneDriveCredentials({ clientSecret: SECRET, refreshToken: 'r'.repeat(4096) })).toEqual({ clientSecret: SECRET, refreshToken: 'r'.repeat(4096) });
    expect(validateOneDriveCredentials({ clientSecret: SECRET, refreshToken: 'r'.repeat(4097) })).toMatch(/refreshToken/);
  });

  it('rotate replaces only the refresh token of an existing entry, atomically, and never brings back a deleted authorization', () => {
    const raw = memory();
    const store = createOneDriveCredentialStore(raw as never);
    store.put('d-1', { clientSecret: SECRET, refreshToken: 'old-token' });
    store.put('d-2', { clientSecret: `${SECRET}-2`, refreshToken: 'other-token' });
    expect(store.rotate('d-1', 'new-token')).toBe(true);
    expect(store.get('d-1')).toEqual({ clientSecret: SECRET, refreshToken: 'new-token' });
    expect(store.get('d-2')).toEqual({ clientSecret: `${SECRET}-2`, refreshToken: 'other-token' });
    expect(store.delete('d-1')).toBe(true);
    expect(store.rotate('d-1', 'late-token')).toBe(false); // a rotation that raced the disconnect
    expect(store.has('d-1')).toBe(false);
    expect(() => store.rotate('d-2', 'has a space')).toThrow(/Invalid OneDrive credentials/);
    expect(store.get('d-2')).toMatchObject({ refreshToken: 'other-token' });
  });

  it('a corrupt or unreadable map is a value-free error, never a partial credential', () => {
    const raw = memory();
    raw.values.set('backup.onedrive.refreshToken', Buffer.from('{"v":2}'));
    const store = createOneDriveCredentialStore(raw as never);
    expect(() => store.get('d-1')).toThrow('The stored OneDrive authorization is unreadable or corrupt; connect the OneDrive destination again.');
    raw.values.set('backup.onedrive.refreshToken', Buffer.from(JSON.stringify({ v: 1, credentials: { 'd-1': { clientSecret: SECRET, refreshToken: 'has a space' } } })));
    expect(() => store.get('d-1')).toThrow(/unreadable or corrupt/);
    const failing = createOneDriveCredentialStore({ ...raw, get: () => { throw new Error('DPAPI said: the secret is SECRET-VALUE'); } } as never);
    try { failing.get('d-1'); } catch (error) { expect((error as Error).message).not.toContain('SECRET-VALUE'); }
  });
});
