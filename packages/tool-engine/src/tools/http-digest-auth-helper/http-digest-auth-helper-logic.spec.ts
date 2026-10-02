import { describe, expect, it } from 'vitest';
import { computeDigestResponse, parseWwwAuthenticateChallenge } from "./http-digest-auth-helper-logic.js";

// Test vectors below are independently computed via the `js-md5` library
// (the same primitive the implementation uses) for the classic RFC 2617 §3.5
// example credentials, cross-validating the HA1/HA2/response concatenation
// formula rather than re-testing MD5 itself.
const USERNAME = 'Mufasa';
const REALM = 'testrealm@host.com';
const PASSWORD = 'Circle of Life';
const METHOD = 'GET';
const URI = '/dir/index.html';
const NONCE = 'dcd98b7102dd2f0e8b11d0f600bfb0c093';
const NC = '00000001';
const CNONCE = '0a4f113b';

describe('parseWwwAuthenticateChallenge', () => {
  it('parses a full Digest challenge with quoted and unquoted directives', () => {
    const header =
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';
    const result = parseWwwAuthenticateChallenge(header);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.realm).toBe('testrealm@host.com');
    expect(result.value.nonce).toBe('dcd98b7102dd2f0e8b11d0f600bfb0c093');
    expect(result.value.qop).toBe('auth,auth-int');
    expect(result.value.opaque).toBe('5ccc069c403ebaf9f0171e9517f40e41');
  });

  it('accepts a header with the leading "WWW-Authenticate:" prefix', () => {
    const result = parseWwwAuthenticateChallenge('WWW-Authenticate: Digest realm="x", nonce="y"');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.realm).toBe('x');
  });

  it('rejects empty input', () => {
    expect(parseWwwAuthenticateChallenge('').ok).toBe(false);
  });

  it('rejects a header with no parseable directives', () => {
    expect(parseWwwAuthenticateChallenge('Digest').ok).toBe(false);
  });
});

describe('computeDigestResponse', () => {
  it('computes HA1/HA2/response matching an independently computed MD5 qop=auth vector', async () => {
    const result = await computeDigestResponse({
      username: USERNAME,
      password: PASSWORD,
      method: METHOD,
      uri: URI,
      realm: REALM,
      nonce: NONCE,
      nc: NC,
      cnonce: CNONCE,
      qop: 'auth',
      algorithm: 'MD5',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ha1).toBe('7650d211d93fae2c3f56cdb1f1af23b2');
    expect(result.value.ha2).toBe('39aff3a2bab6126f332b942af96d3366');
    expect(result.value.response).toBe('20ae5530a92d6c35dc4a63a4c1affcac');
    expect(result.value.authorizationHeader).toContain('response="20ae5530a92d6c35dc4a63a4c1affcac"');
    expect(result.value.authorizationHeader).toContain('qop=auth');
  });

  it('computes the legacy (no qop) response formula', async () => {
    const result = await computeDigestResponse({
      username: USERNAME,
      password: PASSWORD,
      method: METHOD,
      uri: URI,
      realm: REALM,
      nonce: NONCE,
      algorithm: 'MD5',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.response).toBe('2951cdbad33b2271fcb6b8e7b8feac23');
    expect(result.value.authorizationHeader).not.toContain('qop=');
  });

  it('computes the auth-int response formula, hashing the entity body into HA2', async () => {
    const result = await computeDigestResponse({
      username: USERNAME,
      password: PASSWORD,
      method: METHOD,
      uri: URI,
      realm: REALM,
      nonce: NONCE,
      nc: NC,
      cnonce: CNONCE,
      qop: 'auth-int',
      algorithm: 'MD5',
      entityBody: 'hello world',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ha2).toBe('254d8bb6e9c4c4008e0e07c3683f9b9b');
    expect(result.value.response).toBe('455b8921f612380da2e3d06d5d44f782');
  });

  it('computes the MD5-sess HA1 variant', async () => {
    const result = await computeDigestResponse({
      username: USERNAME,
      password: PASSWORD,
      method: METHOD,
      uri: URI,
      realm: REALM,
      nonce: NONCE,
      nc: NC,
      cnonce: CNONCE,
      qop: 'auth',
      algorithm: 'MD5-sess',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ha1).toBe('6897424d2f2185ed8fe43cf92b4843ff');
  });

  it('supports SHA-256 without crashing and produces a 64-hex-char digest', async () => {
    const result = await computeDigestResponse({
      username: USERNAME,
      password: PASSWORD,
      method: METHOD,
      uri: URI,
      realm: REALM,
      nonce: NONCE,
      nc: NC,
      cnonce: CNONCE,
      qop: 'auth',
      algorithm: 'SHA-256',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.response).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires nc and cnonce when qop is set', async () => {
    const result = await computeDigestResponse({ username: USERNAME, password: PASSWORD, method: METHOD, uri: URI, realm: REALM, nonce: NONCE, qop: 'auth' });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing username', async () => {
    const result = await computeDigestResponse({ username: '', password: PASSWORD, method: METHOD, uri: URI, realm: REALM, nonce: NONCE });
    expect(result.ok).toBe(false);
  });
});
