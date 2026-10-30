import { afterEach, describe, expect, it } from 'vitest';
import { codeChallengeS256, generateCodeVerifier } from '../auth/oidc/pkce.js';
import { createDriveAuthorizations, driveRedirectUri } from './drive-authorization.js';
import { DRIVE_FILE_SCOPE, GOOGLE_DRIVE_ENDPOINTS, buildDriveAuthorizationUrl, exchangeDriveCode, refreshDriveAccessToken, revokeDriveToken } from './drive-oauth.js';
import { createDriveCredentialStore, validateDriveClientSecret, validateDriveCredentials } from '../backup/destinations/drive/drive-credentials.js';
import { FakeDriveServer } from '../backup/destinations/drive/fake-drive-server.js';

/** Google OAuth for the Drive destination (Milestone 856; lives under hub/ because the callback route must not import backup/): the consent URL, the code exchange, refresh, revoke, the pending authorization and the credential map. */
const servers: FakeDriveServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); });
const start = async (options: ConstructorParameters<typeof FakeDriveServer>[0] = {}) => { const server = new FakeDriveServer(options); servers.push(server); await server.start(); return server; };
const fetchImpl = (input: string, init?: RequestInit): Promise<Response> => fetch(input, init);

describe('the consent URL', () => {
  it('asks for the drive.file scope only, with PKCE S256, offline access and consent, and never sends a secret or a verifier', () => {
    const verifier = generateCodeVerifier();
    const url = new URL(buildDriveAuthorizationUrl({ endpoints: GOOGLE_DRIVE_ENDPOINTS, clientId: 'client.apps.googleusercontent.com', redirectUri: 'https://hub.example.com/api/v1/backup/drive/callback', state: 'S'.repeat(43), codeVerifier: verifier }));
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code', client_id: 'client.apps.googleusercontent.com', redirect_uri: 'https://hub.example.com/api/v1/backup/drive/callback', scope: DRIVE_FILE_SCOPE,
      state: 'S'.repeat(43), code_challenge: codeChallengeS256(verifier), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent',
    });
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    expect(url.toString()).not.toContain(verifier);
  });
});

describe('the token calls', () => {
  it('exchanges a code with the PKCE verifier and keeps only the refresh token', async () => {
    const server = await start();
    const verifier = generateCodeVerifier();
    const consent = server.authorize(buildDriveAuthorizationUrl({ endpoints: server.endpoints(), clientId: server.options.clientId, redirectUri: 'https://hub.example.com/cb', state: 's'.repeat(43), codeVerifier: verifier })) as { code: string };
    const base = { fetch: fetchImpl, endpoints: server.endpoints(), clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectUri: 'https://hub.example.com/cb' };
    expect(await exchangeDriveCode({ ...base, code: consent.code, codeVerifier: generateCodeVerifier() })).toEqual({ status: 'rejected', error: 'invalid_grant' }); // wrong verifier, and the code is spent
    const second = server.authorize(buildDriveAuthorizationUrl({ endpoints: server.endpoints(), clientId: server.options.clientId, redirectUri: 'https://hub.example.com/cb', state: 's'.repeat(43), codeVerifier: verifier })) as { code: string };
    const exchanged = await exchangeDriveCode({ ...base, code: second.code, codeVerifier: verifier });
    expect(exchanged).toEqual({ status: 'ok', refreshToken: expect.stringMatching(/^1\/\/0g/) });
    expect(Object.keys(exchanged)).toEqual(['status', 'refreshToken']);
    expect(await exchangeDriveCode({ ...base, clientSecret: 'GOCSPX-wrong-secret-000000000', code: second.code, codeVerifier: verifier })).toEqual({ status: 'rejected', error: 'invalid_client' });
  });

  it('refuses a response that grants more than drive.file or no refresh token, and reports Google being down as unreachable', async () => {
    const server = await start();
    const base = { endpoints: server.endpoints(), clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectUri: 'r', code: 'c', codeVerifier: generateCodeVerifier() };
    const respond = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    expect(await exchangeDriveCode({ ...base, fetch: respond({ refresh_token: 'rt', scope: `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`, token_type: 'Bearer' }) })).toEqual({ status: 'scope-refused' });
    expect(await exchangeDriveCode({ ...base, fetch: respond({ refresh_token: 'rt', scope: 'https://www.googleapis.com/auth/drive', token_type: 'Bearer' }) })).toEqual({ status: 'scope-refused' });
    expect(await exchangeDriveCode({ ...base, fetch: respond({ scope: DRIVE_FILE_SCOPE, token_type: 'Bearer' }) })).toEqual({ status: 'no-refresh-token' });
    expect(await exchangeDriveCode({ ...base, fetch: respond({ refresh_token: 'has a space', scope: DRIVE_FILE_SCOPE }) })).toEqual({ status: 'invalid-response' });
    expect(await exchangeDriveCode({ ...base, fetch: respond({ error: 'something odd and provider specific' }, 400) })).toEqual({ status: 'rejected', error: 'unknown' });
    expect(await exchangeDriveCode({ ...base, fetch: respond({}, 503) })).toEqual({ status: 'unreachable' });
    expect(await exchangeDriveCode({ ...base, fetch: async () => { throw new Error('ECONNREFUSED secret-in-the-message'); } })).toEqual({ status: 'unreachable' });
  });

  it('refreshes an access token, tells a revoked consent from other refusals, and revokes best effort', async () => {
    const server = await start();
    const token = server.issueRefreshToken();
    const base = { fetch: fetchImpl, endpoints: server.endpoints(), clientId: server.options.clientId, clientSecret: server.options.clientSecret };
    expect(await refreshDriveAccessToken({ ...base, refreshToken: token })).toEqual({ status: 'ok', accessToken: expect.stringMatching(/^ya29\./), expiresInSeconds: 3600 });
    expect(await refreshDriveAccessToken({ ...base, refreshToken: 'unknown-token' })).toEqual({ status: 'revoked' });
    expect(await refreshDriveAccessToken({ ...base, clientSecret: 'GOCSPX-wrong-secret-000000000', refreshToken: token })).toEqual({ status: 'rejected', error: 'invalid_client' });
    expect(await revokeDriveToken({ fetch: fetchImpl, endpoints: server.endpoints(), refreshToken: token })).toBe(true);
    expect(await refreshDriveAccessToken({ ...base, refreshToken: token })).toEqual({ status: 'revoked' });
    expect(await revokeDriveToken({ fetch: fetchImpl, endpoints: server.endpoints(), refreshToken: 'unknown-token' })).toBe(false);
    expect(await revokeDriveToken({ fetch: async () => { throw new Error('down'); }, endpoints: server.endpoints(), refreshToken: token })).toBe(false);
  });

  it('never follows a redirect from a token endpoint', async () => {
    const calls: string[] = [];
    const redirecting = async (input: string, init?: RequestInit): Promise<Response> => {
      calls.push(`${input} ${String(init?.redirect)}`);
      return new Response(null, { status: 302, headers: { location: 'https://evil.example.com/token' } });
    };
    const result = await refreshDriveAccessToken({ fetch: redirecting, endpoints: GOOGLE_DRIVE_ENDPOINTS, clientId: 'c', clientSecret: 'secret-value', refreshToken: 'rt' });
    expect(result).toEqual({ status: 'rejected', error: 'unknown' });
    expect(calls).toEqual(['https://oauth2.googleapis.com/token manual']);
  });
});

describe('the pending authorization', () => {
  const T0 = Date.parse('2026-10-30T12:00:00Z');
  it('is single-use, short-lived, one at a time, and hands the refresh token over exactly once', async () => {
    const server = await start();
    let clock = T0;
    const auth = createDriveAuthorizations({ now: () => clock, endpoints: server.endpoints() });
    const begin = () => auth.begin({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: 'https://hub.example.com' });
    const first = begin();
    expect(first.redirectUri).toBe(driveRedirectUri('https://hub.example.com'));
    expect(auth.waiting()).toBe(true);
    expect(auth.status(first.pendingId)).toEqual({ state: 'waiting', expiresAt: new Date(T0 + 10 * 60_000).toISOString() });
    expect(auth.status('x'.repeat(32))).toEqual({ state: 'unknown' });
    expect(auth.take(first.pendingId)).toBeUndefined(); // nothing authorized yet
    const approved = server.authorize(first.authorizationUrl) as { code: string; state: string };
    expect(await auth.handleCallback({ state: approved.state, code: approved.code, error: undefined })).toEqual({ result: 'authorized' });
    expect(await auth.handleCallback({ state: approved.state, code: approved.code, error: undefined })).toEqual({ result: 'unknown' });
    expect(auth.waiting()).toBe(false);
    const taken = auth.take(first.pendingId);
    expect(taken).toEqual({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, refreshToken: expect.stringMatching(/^1\/\/0g/) });
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

  it('refuses malformed, oversized or wrong states and codes without calling Google', async () => {
    const calls: string[] = [];
    const auth = createDriveAuthorizations({ endpoints: GOOGLE_DRIVE_ENDPOINTS, fetch: async (input) => { calls.push(String(input)); return new Response('{}', { status: 400 }); } });
    const started = auth.begin({ clientId: 'c', clientSecret: 'secret-value-123', redirectOrigin: 'https://hub.example.com' });
    const state = new URL(started.authorizationUrl).searchParams.get('state')!;
    for (const bad of [undefined, 42, '', 'short', 'A'.repeat(300), `${state}x`, 'A'.repeat(43)]) expect(await auth.handleCallback({ state: bad, code: 'c', error: undefined }), String(bad)).toEqual({ result: 'unknown' });
    expect(auth.waiting()).toBe(true); // none of that spent the real state
    expect(await auth.handleCallback({ state, code: 'x'.repeat(3000), error: undefined })).toEqual({ result: 'failed', reason: 'no-code' });
    expect(calls).toEqual([]);
    expect(auth.status(started.pendingId)).toEqual({ state: 'failed', reason: 'no-code' });
  });
});

describe('the credential map', () => {
  const memory = () => {
    const values = new Map<string, Buffer>();
    return {
      get: (p: string) => { const v = values.get(p); return v === undefined ? null : Buffer.from(v); }, put: (p: string, v: Uint8Array | string) => { values.set(p, Buffer.from(v)); },
      delete: (p: string) => values.delete(p), status: () => ({ 'backup.drive.refreshToken': { present: values.has('backup.drive.refreshToken'), needsReentry: false } }), values,
    };
  };
  it('keeps one protected purpose keyed by destination id, validates every field and deletes the purpose with its last entry', () => {
    const raw = memory();
    const store = createDriveCredentialStore(raw as never);
    expect(store.has('d-1')).toBe(false);
    expect(store.get('d-1')).toBeNull();
    store.put('d-1', { clientSecret: 'GOCSPX-secret-0123456789', refreshToken: '1//0gRefresh-token_0123' });
    store.put('d-2', { clientSecret: 'GOCSPX-secret-9876543210', refreshToken: '1//0gOther-token_0123' });
    expect(JSON.parse(raw.values.get('backup.drive.refreshToken')!.toString('utf8'))).toEqual({ v: 1, credentials: { 'd-1': { clientSecret: 'GOCSPX-secret-0123456789', refreshToken: '1//0gRefresh-token_0123' }, 'd-2': { clientSecret: 'GOCSPX-secret-9876543210', refreshToken: '1//0gOther-token_0123' } } });
    expect(store.has('d-1') && store.has('d-2')).toBe(true);
    expect(store.delete('d-1')).toBe(true);
    expect(store.delete('d-1')).toBe(false);
    expect(store.get('d-2')).toMatchObject({ refreshToken: '1//0gOther-token_0123' });
    expect(store.delete('d-2')).toBe(true);
    expect(raw.values.size).toBe(0);
    expect(() => store.put('d-3', { clientSecret: 'short', refreshToken: 'x' })).toThrow(/Invalid Google Drive credentials/);
    expect(validateDriveClientSecret('has space in it 123')).toBeNull();
    expect(validateDriveCredentials({ clientSecret: 'GOCSPX-secret-0123456789', refreshToken: 'x', extra: 1 })).toBe('credentials has an unknown field');
  });

  it('a corrupt or unreadable map is a value-free error, never a partial credential', () => {
    const raw = memory();
    raw.values.set('backup.drive.refreshToken', Buffer.from('{"v":2}'));
    const store = createDriveCredentialStore(raw as never);
    expect(() => store.get('d-1')).toThrow('The stored Google Drive authorization is unreadable or corrupt; connect the Drive destination again.');
    raw.values.set('backup.drive.refreshToken', Buffer.from(JSON.stringify({ v: 1, credentials: { 'd-1': { clientSecret: 'GOCSPX-secret-0123456789', refreshToken: 'has a space' } } })));
    expect(() => store.get('d-1')).toThrow(/unreadable or corrupt/);
    const failing = createDriveCredentialStore({ ...raw, get: () => { throw new Error('DPAPI said: the secret is SECRET-VALUE'); } } as never);
    try { failing.get('d-1'); } catch (error) { expect((error as Error).message).not.toContain('SECRET-VALUE'); }
  });
});
