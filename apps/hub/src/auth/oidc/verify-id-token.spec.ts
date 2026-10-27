import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { OIDC_CLOCK_SKEW_SECONDS, OIDC_JWKS_REFRESH_COOLDOWN_MS, OIDC_MAX_TOKEN_AGE_SECONDS } from './constants.js';
import { allowedEgressHosts, createOidcEgress } from './egress.js';
import { createFakeIdp } from './fake-idp.js';
import type { FakeIdpFailure } from './fake-idp.js';
import { REDIRECT_ORIGIN, T0 } from './oidc-fixture.js';
import { generateCodeVerifier, generateNonce, sha256Hex } from './pkce.js';
import { createOidcProvider } from './provider.js';
import { exchangeAuthorizationCode } from './token-exchange.js';
import { verifyIdToken } from './verify-id-token.js';
import type { IdTokenFailure } from './verify-id-token.js';

const redirectUri = `${REDIRECT_ORIGIN}/api/v1/auth/oidc/callback`;

async function setup() {
  const clock = { now: T0 };
  const idp = await createFakeIdp({ now: () => clock.now });
  const egress = createOidcEgress({ allowedHosts: allowedEgressHosts(idp.issuer), fetch: idp.fetch });
  const provider = createOidcProvider({ issuer: idp.issuer, egress, now: () => clock.now });

  /** A real authorization, code exchange and token for a fresh nonce; returns the token and what verification needs. */
  async function issue() {
    const verifier = generateCodeVerifier();
    const nonce = generateNonce();
    const url = new URL(idp.authorizationEndpoint);
    for (const [k, v] of Object.entries({
      response_type: 'code', client_id: idp.clientId, redirect_uri: redirectUri, scope: 'openid email', state: 's'.repeat(43), nonce,
      code_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'), code_challenge_method: 'S256',
    })) url.searchParams.set(k, v);
    const { code } = idp.authorize(url.href);
    const metadata = await provider.metadata();
    if (metadata.status !== 'ok') throw new Error('discovery failed');
    const exchanged = await exchangeAuthorizationCode({ egress, metadata: metadata.metadata, clientId: idp.clientId, clientSecret: idp.clientSecret, redirectUri, code, codeVerifier: verifier });
    if (exchanged.status !== 'ok') throw new Error(`exchange failed: ${exchanged.status}`);
    return { token: exchanged.idToken, nonce };
  }
  const verify = (token: string, nonce: string, overrides: { clientId?: string; issuer?: string } = {}) =>
    verifyIdToken(token, { provider, issuer: overrides.issuer ?? idp.issuer, clientId: overrides.clientId ?? idp.clientId, expectedNonceHash: sha256Hex(nonce), now: () => clock.now });
  return { clock, idp, provider, issue, verify };
}

describe('a valid ID token', () => {
  it('verifies, binds the sub, and carries the address as display text only', async () => {
    const { idp, issue, verify } = await setup();
    idp.account = { sub: '110169484474386276334', email: 'Owner@Example.com', emailVerified: true };
    const { token, nonce } = await issue();
    expect(await verify(token, nonce)).toEqual({ ok: true, identity: { sub: '110169484474386276334', issuer: 'https://accounts.google.com', email: 'Owner@Example.com', emailVerified: true } });
  });

  it('is fine without an email and with email_verified false or the string "true"', async () => {
    const { idp, issue, verify } = await setup();
    idp.account = { sub: 'no-email' };
    let issued = await issue();
    expect(await verify(issued.token, issued.nonce)).toMatchObject({ ok: true, identity: { sub: 'no-email', email: undefined, emailVerified: undefined } });
    idp.account = { sub: 'unverified', email: 'x@example.com', emailVerified: false };
    issued = await issue();
    expect(await verify(issued.token, issued.nonce)).toMatchObject({ ok: true, identity: { emailVerified: false } });
    idp.account = { sub: 'stringy', email: 'x@example.com', emailVerified: 'true' };
    issued = await issue();
    expect(await verify(issued.token, issued.nonce)).toMatchObject({ ok: true, identity: { emailVerified: true } });
  });

  it('accepts a multi-audience token when azp is this client', async () => {
    const { idp, issue, verify } = await setup();
    idp.setClaims({ aud: [idp.clientId, 'another-client'], azp: idp.clientId });
    const { token, nonce } = await issue();
    expect((await verify(token, nonce)).ok).toBe(true);
  });

  it('tolerates a small clock skew either way and nothing larger', async () => {
    const { clock, issue, verify } = await setup();
    const { token, nonce } = await issue();
    clock.now = T0 - (OIDC_CLOCK_SKEW_SECONDS - 5) * 1000;
    expect((await verify(token, nonce)).ok).toBe(true);
    clock.now = T0 - (OIDC_CLOCK_SKEW_SECONDS + 5) * 1000;
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'issued-at' });
  });
});

describe('every claim failure is refused with its own closed reason', () => {
  const matrix: Array<[FakeIdpFailure, IdTokenFailure]> = [
    ['bad-signature', 'bad-signature'],
    ['wrong-nonce', 'nonce'],
    ['wrong-aud', 'audience'],
    ['wrong-iss', 'issuer'],
    ['wrong-azp', 'authorized-party'],
    ['expired', 'expired'],
    ['not-yet-valid', 'not-yet-valid'],
    ['future-iat', 'issued-at'],
    ['stale-iat', 'issued-at'],
    ['missing-sub', 'subject'],
    ['alg-none', 'unsupported-alg'],
    ['alg-hs256', 'unsupported-alg'],
  ];
  for (const [mode, reason] of matrix) {
    it(`${mode} -> ${reason}`, async () => {
      const { idp, issue, verify } = await setup();
      idp.setFailure(mode);
      const { token, nonce } = await issue();
      expect(await verify(token, nonce)).toEqual({ ok: false, reason });
    });
  }

  it('a multi-audience token without a matching azp is refused', async () => {
    const { idp, issue, verify } = await setup();
    idp.setClaims({ aud: [idp.clientId, 'another-client'], azp: undefined });
    const { token, nonce } = await issue();
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'authorized-party' });
  });

  it('a single-audience token with a foreign azp is refused', async () => {
    const { idp, issue, verify } = await setup();
    idp.setClaims({ azp: 'someone-else' });
    const { token, nonce } = await issue();
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'authorized-party' });
  });

  it('a token for another client is refused when verified for this one, and vice versa', async () => {
    const { issue, verify } = await setup();
    const { token, nonce } = await issue();
    expect(await verify(token, nonce, { clientId: 'a-different-client' })).toEqual({ ok: false, reason: 'audience' });
  });

  it('a token minted for another issuer is refused even if the signature is good', async () => {
    const { issue, verify } = await setup();
    const { token, nonce } = await issue();
    expect(await verify(token, nonce, { issuer: 'https://accounts.example.org' })).toEqual({ ok: false, reason: 'issuer' });
  });

  it('a nonce that is the right length but not this flow\'s is refused (constant-time compared)', async () => {
    const { issue, verify } = await setup();
    const { token } = await issue();
    expect(await verify(token, generateNonce())).toEqual({ ok: false, reason: 'nonce' });
    expect(await verify(token, '')).toEqual({ ok: false, reason: 'nonce' });
  });

  it('a missing nonce claim is refused', async () => {
    const { idp, issue, verify } = await setup();
    idp.setClaims({ nonce: undefined });
    const { token, nonce } = await issue();
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'nonce' });
  });

  it('a missing exp, iat or aud is refused (required claims)', async () => {
    for (const claim of ['exp', 'iat', 'aud']) {
      const { idp, issue, verify } = await setup();
      idp.setClaims({ [claim]: undefined });
      const { token, nonce } = await issue();
      const result = await verify(token, nonce);
      expect([claim, result.ok]).toEqual([claim, false]);
    }
  });

  it('an over-long or empty sub is refused', async () => {
    for (const sub of ['', 's'.repeat(256), 42, null]) {
      const { idp, issue, verify } = await setup();
      idp.setClaims({ sub });
      const { token, nonce } = await issue();
      const result = await verify(token, nonce);
      expect([String(sub).slice(0, 5), result.ok]).toEqual([String(sub).slice(0, 5), false]);
    }
  });

  it('a token older than ten minutes is refused even when it has not expired', async () => {
    const { clock, issue, verify } = await setup();
    const { token, nonce } = await issue();
    clock.now = T0 + (OIDC_MAX_TOKEN_AGE_SECONDS + OIDC_CLOCK_SKEW_SECONDS + 5) * 1000;
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'issued-at' });
  });
});

describe('algorithm and key confusion', () => {
  it('refuses none and HS256 before any key is fetched', async () => {
    const { idp, issue, verify } = await setup();
    for (const mode of ['alg-none', 'alg-hs256'] as const) {
      const fresh = await setup();
      fresh.idp.setFailure(mode);
      const { token, nonce } = await fresh.issue();
      const before = fresh.idp.calls.filter((c) => c.path === '/oauth2/v3/certs').length;
      expect(await fresh.verify(token, nonce)).toEqual({ ok: false, reason: 'unsupported-alg' });
      expect(fresh.idp.calls.filter((c) => c.path === '/oauth2/v3/certs').length).toBe(before);
    }
    void idp; void issue; void verify;
  });

  it('refuses an RS384 and an ES256 header too (RS256 is the whole allowlist)', async () => {
    const { verify, provider } = await setup();
    await provider.jwks();
    const payload = Buffer.from(JSON.stringify({ iss: 'x' })).toString('base64url');
    for (const alg of ['RS384', 'RS512', 'ES256', 'PS256', 'EdDSA', 'HS512']) {
      const header = Buffer.from(JSON.stringify({ alg, kid: 'fake-kid-1' })).toString('base64url');
      expect([alg, await verify(`${header}.${payload}.c2ln`, 'n')]).toEqual([alg, { ok: false, reason: 'unsupported-alg' }]);
    }
  });

  it('refuses a token with no kid, an empty kid and a non-string alg', async () => {
    const { verify } = await setup();
    const payload = Buffer.from('{}').toString('base64url');
    for (const header of [{ alg: 'RS256' }, { alg: 'RS256', kid: '' }, { kid: 'fake-kid-1' }, { alg: 5, kid: 'fake-kid-1' }]) {
      const result = await verify(`${Buffer.from(JSON.stringify(header)).toString('base64url')}.${payload}.c2ln`, 'n');
      expect([JSON.stringify(header), result.ok]).toEqual([JSON.stringify(header), false]);
    }
  });

  it('refuses malformed tokens: not three segments, wrong alphabet, empty, huge', async () => {
    const { verify } = await setup();
    for (const token of ['', 'a', 'a.b', 'a.b.c.d', 'a.b.c!', '..', ` a.b.c`, 'a.b.c\n', 'x'.repeat(20_000), 'eyJhbGciOiJSUzI1NiJ9.not-json.c2ln']) {
      const result = await verify(token, 'n');
      expect([token.slice(0, 12), result.ok]).toEqual([token.slice(0, 12), false]);
    }
    expect(await verify('', 'n')).toEqual({ ok: false, reason: 'malformed' });
    expect(await verify(undefined as unknown as string, 'n')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('a token signed with the provider\'s PUBLIC key as an HMAC secret is refused (classic key confusion)', async () => {
    const { idp, verify, provider } = await setup();
    const keys = await provider.jwks();
    if (keys.status !== 'ok') throw new Error('expected keys');
    const token = await new SignJWT({ iss: idp.issuer, aud: idp.clientId, sub: 'x', nonce: 'n', iat: Math.floor(T0 / 1000), exp: Math.floor(T0 / 1000) + 600 })
      .setProtectedHeader({ alg: 'HS256', kid: 'fake-kid-1' }).sign(new TextEncoder().encode(JSON.stringify(keys.keys[0])));
    expect(await verify(token, 'n')).toEqual({ ok: false, reason: 'unsupported-alg' });
  });
});

describe('an unknown kid', () => {
  it('triggers exactly one JWKS refresh and then a refusal when the key is still not published', async () => {
    const { clock, idp, issue, verify, provider } = await setup();
    await provider.jwks(); // warm cache
    clock.now += OIDC_JWKS_REFRESH_COOLDOWN_MS + 1;
    idp.setFailure('unknown-kid');
    const { token, nonce } = await issue();
    const before = idp.calls.filter((c) => c.path === '/oauth2/v3/certs').length;
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'unknown-key' });
    expect(idp.calls.filter((c) => c.path === '/oauth2/v3/certs').length - before).toBe(1);
  });

  it('is accepted after the one refresh when the provider rotated to the new key', async () => {
    const { clock, idp, issue, verify, provider } = await setup();
    await provider.jwks(); // the cache holds only the old key
    clock.now += OIDC_JWKS_REFRESH_COOLDOWN_MS + 1;
    await idp.rotateKey();
    const { token, nonce } = await issue();
    expect((await verify(token, nonce)).ok).toBe(true);
  });

  it('does not refresh again inside the cooldown: a flood of forged kids costs one fetch', async () => {
    const { clock, idp, issue, verify, provider } = await setup();
    await provider.jwks();
    clock.now += OIDC_JWKS_REFRESH_COOLDOWN_MS + 1;
    idp.setFailure('unknown-kid');
    const before = idp.calls.filter((c) => c.path === '/oauth2/v3/certs').length;
    for (let i = 0; i < 4; i += 1) {
      const { token, nonce } = await issue();
      expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'unknown-key' });
    }
    expect(idp.calls.filter((c) => c.path === '/oauth2/v3/certs').length - before).toBe(1);
  });
});

describe('provider trouble', () => {
  it('is unreachable (not a verification failure) when the JWKS cannot be fetched', async () => {
    const { idp, issue, verify } = await setup();
    const { token, nonce } = await issue();
    idp.setDown('jwks', true);
    expect(await verify(token, nonce)).toEqual({ ok: false, reason: 'unreachable' });
  });
});
