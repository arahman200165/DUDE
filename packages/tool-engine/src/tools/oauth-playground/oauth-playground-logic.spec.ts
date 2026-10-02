import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildAuthorizationCodeRequest,
  buildDeviceAuthorizationRequest,
  buildImplicitRequest,
  buildTokenRequestBody,
  computePkceChallenge,
  generatePkceVerifier,
  inspectAuthorizationCallback,
  inspectDeviceAuthorizationResponse,
  inspectTokenResponse,
} from "./oauth-playground-logic.js";

describe('buildAuthorizationCodeRequest', () => {
  it('builds an authorization request URL', () => {
    const result = buildAuthorizationCodeRequest({
      authorizationEndpoint: 'https://auth.example.com/authorize',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      scope: 'openid profile',
      state: 'abc',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toContain('response_type=code');
    expect(result.value.url).toContain('client_id=client-1');
  });

  it('includes PKCE parameters when a code challenge is given', () => {
    const result = buildAuthorizationCodeRequest({
      authorizationEndpoint: 'https://auth.example.com/authorize',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: 'challenge-value',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.params['code_challenge']).toBe('challenge-value');
    expect(result.value.params['code_challenge_method']).toBe('S256');
  });

  it('rejects a missing client ID', () => {
    const result = buildAuthorizationCodeRequest({ authorizationEndpoint: 'https://auth.example.com', clientId: '', redirectUri: 'https://app.example.com' });
    expect(result.ok).toBe(false);
  });
});

describe('inspectAuthorizationCallback', () => {
  it('round-trips a build → inspect for an authorization code callback', () => {
    const built = buildAuthorizationCodeRequest({
      authorizationEndpoint: 'https://auth.example.com/authorize',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      state: 'xyz',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const callback = 'https://app.example.com/callback?code=abc123&state=xyz';
    const inspected = inspectAuthorizationCallback(callback);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.value.code).toBe('abc123');
    expect(inspected.value.state).toBe('xyz');
  });

  it('reports an authorization error response', () => {
    const inspected = inspectAuthorizationCallback('https://app.example.com/callback?error=access_denied&error_description=User+declined');
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.value.error).toBe('access_denied');
  });

  it('rejects a malformed URL', () => {
    expect(inspectAuthorizationCallback('not a url').ok).toBe(false);
  });

  it('reads an implicit grant\'s access_token from the URL fragment', () => {
    const inspected = inspectAuthorizationCallback('https://app.example.com/callback#access_token=tok123&state=xyz');
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.value.token).toBe('tok123');
  });
});

describe('buildImplicitRequest', () => {
  it('builds a response_type=token request and warns implicitly via a fixed response_type', () => {
    const result = buildImplicitRequest({ authorizationEndpoint: 'https://auth.example.com/authorize', clientId: 'client-1', redirectUri: 'https://app.example.com/callback' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.params['response_type']).toBe('token');
  });
});

describe('buildTokenRequestBody', () => {
  it('builds a client_credentials request', () => {
    const result = buildTokenRequestBody({ grantType: 'client_credentials', tokenEndpoint: 'https://auth.example.com/token', clientId: 'client-1', clientSecret: 'secret' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toContain('grant_type=client_credentials');
    expect(result.value.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('requires username and password for the password grant', () => {
    const result = buildTokenRequestBody({ grantType: 'password', tokenEndpoint: 'https://auth.example.com/token', clientId: 'client-1' });
    expect(result.ok).toBe(false);
  });

  it('builds a password grant request', () => {
    const result = buildTokenRequestBody({ grantType: 'password', tokenEndpoint: 'https://auth.example.com/token', clientId: 'client-1', username: 'u', password: 'p' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toContain('username=u');
  });

  it('builds a refresh_token grant request', () => {
    const result = buildTokenRequestBody({ grantType: 'refresh_token', tokenEndpoint: 'https://auth.example.com/token', clientId: 'client-1', refreshToken: 'r1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toContain('refresh_token=r1');
  });

  it('builds an authorization_code exchange request including code_verifier', () => {
    const result = buildTokenRequestBody({
      grantType: 'authorization_code',
      tokenEndpoint: 'https://auth.example.com/token',
      clientId: 'client-1',
      code: 'abc123',
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: 'verifier-value',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toContain('code_verifier=verifier-value');
  });
});

describe('device authorization grant', () => {
  it('builds a device authorization request', () => {
    const result = buildDeviceAuthorizationRequest({ deviceAuthorizationEndpoint: 'https://auth.example.com/device', clientId: 'client-1' });
    expect(result.ok).toBe(true);
  });

  it('inspects a device authorization response', () => {
    const result = inspectDeviceAuthorizationResponse(
      JSON.stringify({ device_code: 'd1', user_code: 'ABCD-EFGH', verification_uri: 'https://example.com/device', interval: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userCode).toBe('ABCD-EFGH');
    expect(result.value.interval).toBe(5);
  });

  it('rejects malformed JSON', () => {
    expect(inspectDeviceAuthorizationResponse('{not json').ok).toBe(false);
  });
});

describe('inspectTokenResponse', () => {
  it('reports an RFC 6749 §5.2 error response', () => {
    const result = inspectTokenResponse(JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isError).toBe(true);
    expect(result.value.errorCode).toBe('invalid_grant');
  });

  it('parses a successful token response and decodes a JWT access token', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ sub: 'u1' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const jwt = `${header}.${payload}.sig`;

    const result = inspectTokenResponse(JSON.stringify({ access_token: jwt, token_type: 'Bearer', expires_in: 3600 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isError).toBe(false);
    expect(result.value.accessTokenDecoded?.ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    expect(inspectTokenResponse('{not json').ok).toBe(false);
  });
});

describe('PKCE helpers', () => {
  it('generates a verifier within the RFC 7636 length bounds', () => {
    const verifier = generatePkceVerifier(64);
    expect(verifier.length).toBe(64);
  });

  it('computes a deterministic S256 challenge for a known verifier', async () => {
    const challenge = await computePkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('inspectAuthorizationCallback never throws for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => inspectAuthorizationCallback(input)).not.toThrow();
      }),
    );
  });

  it('inspectDeviceAuthorizationResponse never throws for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => inspectDeviceAuthorizationResponse(input)).not.toThrow();
      }),
    );
  });

  it('inspectTokenResponse never throws for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => inspectTokenResponse(input)).not.toThrow();
      }),
    );
  });
});
