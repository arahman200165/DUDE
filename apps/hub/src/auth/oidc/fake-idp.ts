import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey, JWK } from 'jose';
import { GOOGLE_ISSUER } from './constants.js';
import type { FetchLike } from './egress.js';

/**
 * An in-process fake OpenID Provider for specs (32-SS1, Milestone 841; reused by the sign-in routes of Milestone 842 and the SS1 exit
 * gate of Milestone 854). It is a `fetch` implementation, not a server: hand `idp.fetch` to the OIDC client and every discovery, JWKS and
 * token request is answered here with real signed tokens, so the code under test runs unchanged. It never opens a socket.
 *
 * It behaves like Google: the discovery document names the three Google hosts, the authorization endpoint is only "visited" through
 * `authorize()` (which plays the user approving the request and returns the redirect URL), the authorization code is single use and bound
 * to the PKCE challenge, the redirect URI and the client credentials, and ID tokens are RS256 with a `kid`.
 *
 * Failure modes cover every branch the relying party must refuse. A spec that needs something this does not model builds its own
 * `Response` in a `fetch` wrapper around `idp.fetch`.
 */

export type FakeIdpFailure =
  | 'bad-signature' // signed by a key the provider does not publish, with a published kid
  | 'unknown-kid' // signed by a freshly generated key whose kid is not (yet) in the JWKS
  | 'wrong-nonce' | 'wrong-aud' | 'wrong-iss' | 'wrong-azp'
  | 'expired' | 'not-yet-valid' | 'future-iat' | 'stale-iat'
  | 'alg-none' | 'alg-hs256' | 'missing-sub';

export type FakeIdpPart = 'discovery' | 'jwks' | 'token';

export interface FakeAccount { sub: string; email?: string; emailVerified?: boolean | 'true' | 'false' }

export interface FakeIdpOptions {
  /** Default: Google's issuer, with Google's endpoint hosts. Any other issuer keeps every endpoint on its own host. */
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  /** How the token endpoint expects client authentication. Default `client_secret_post`. */
  tokenAuthMethods?: readonly ('client_secret_post' | 'client_secret_basic')[];
  now?: () => number;
  /** `Cache-Control` the discovery and JWKS responses carry. */
  cacheControl?: string;
}

export interface FakeIdpCall { method: string; host: string; path: string }

export interface AuthorizationRequest {
  state: string;
  nonce: string;
  redirectUri: string;
  codeChallenge: string;
  /** Every query parameter the Hub sent, for assertions such as "no hd, no login_hint". */
  params: Readonly<Record<string, string>>;
}

export interface FakeIdp {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch: FetchLike;
  /** Every request the fake answered (or refused as down), in order. */
  readonly calls: FakeIdpCall[];
  /** The decoded form bodies of token requests, for "no secret in a log" style assertions. */
  readonly tokenRequestBodies: string[];
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  /** The account the next authorization signs in as (default `{ sub: 'fake-sub-1', email: 'owner@example.com' }`). */
  account: FakeAccount;
  /** Marks one endpoint (or `all`) as unreachable: the fetch rejects like a network failure. */
  setDown(part: FakeIdpPart | 'all', down: boolean): void;
  /** Applies a failure mode to the NEXT tokens minted (until cleared with `undefined`). */
  setFailure(mode: FakeIdpFailure | undefined): void;
  /** Merges claims into every minted ID token; a value of `undefined` removes the claim. */
  setClaims(claims: Record<string, unknown>): void;
  /** Plays the user approving `authorizationUrl`: validates it like Google would and returns the redirect back to the Hub. */
  authorize(authorizationUrl: string, options?: { account?: FakeAccount }): { callbackUrl: string; code: string; request: AuthorizationRequest };
  /** Publishes a new signing key (the old one stays published unless `retire`). New tokens are signed with the new key. */
  rotateKey(options?: { retire?: boolean }): Promise<string>;
  /** The kid of the key tokens are currently signed with. */
  readonly signingKid: string;
}

interface Key { kid: string; privateKey: CryptoKey; publicJwk: JWK }
interface IssuedCode { nonce: string; challenge: string; redirectUri: string; account: FakeAccount; used: boolean }

const jsonResponse = (body: unknown, extra: Record<string, string> = {}, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });

async function makeKey(kid: string): Promise<Key> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'RS256' };
  return { kid, privateKey, publicJwk };
}

/** Two RSA keys shared by every fake in a process: generation is the slow part and the keys carry no state. */
let pool: Promise<[Key, Key]> | undefined;

const b64url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

export async function createFakeIdp(options: FakeIdpOptions = {}): Promise<FakeIdp> {
  const issuer = options.issuer ?? GOOGLE_ISSUER;
  const google = issuer === GOOGLE_ISSUER;
  const clientId = options.clientId ?? 'fake-client-id.apps.example';
  const clientSecret = options.clientSecret ?? `fake-client-secret-${randomBytes(12).toString('hex')}`;
  const now = options.now ?? Date.now;
  const cacheControl = options.cacheControl ?? 'public, max-age=3600';
  const authMethods = options.tokenAuthMethods ?? ['client_secret_post', 'client_secret_basic'];
  const authorizationEndpoint = google ? 'https://accounts.google.com/o/oauth2/v2/auth' : `${issuer}/authorize`;
  const tokenEndpoint = google ? 'https://oauth2.googleapis.com/token' : `${issuer}/token`;
  const jwksUri = google ? 'https://www.googleapis.com/oauth2/v3/certs' : `${issuer}/jwks`;

  let serial = 1;
  pool ??= Promise.all([makeKey('fake-kid-1'), makeKey('rogue')]);
  const [first, rogue] = await pool;
  const keys: Key[] = [first];
  let signing: Key = first;
  const codes = new Map<string, IssuedCode>();
  const down = new Set<FakeIdpPart | 'all'>();
  let failure: FakeIdpFailure | undefined;
  let claimOverrides: Record<string, unknown> = {};
  const calls: FakeIdpCall[] = [];
  const tokenRequestBodies: string[] = [];

  const discovery = {
    issuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    jwks_uri: jwksUri,
    response_types_supported: ['code', 'token', 'id_token', 'code token', 'code id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: [...authMethods],
    code_challenge_methods_supported: ['plain', 'S256'],
  };

  async function mintIdToken(code: IssuedCode): Promise<string> {
    const nowSeconds = Math.floor(now() / 1000);
    const claims: Record<string, unknown> = {
      iss: issuer, aud: clientId, azp: clientId, sub: code.account.sub, nonce: code.nonce,
      iat: nowSeconds, exp: nowSeconds + 3600,
      ...(code.account.email !== undefined ? { email: code.account.email, email_verified: code.account.emailVerified ?? true } : {}),
      ...claimOverrides,
    };
    switch (failure) {
      case 'wrong-nonce': claims['nonce'] = 'not-the-nonce-of-this-flow'; break;
      case 'wrong-aud': claims['aud'] = 'someone-elses-client'; claims['azp'] = 'someone-elses-client'; break;
      case 'wrong-iss': claims['iss'] = 'https://evil.example.com'; break;
      case 'wrong-azp': claims['aud'] = [clientId, 'another-client']; claims['azp'] = 'another-client'; break;
      case 'expired': claims['iat'] = nowSeconds - 7200; claims['exp'] = nowSeconds - 3600; break;
      case 'not-yet-valid': claims['nbf'] = nowSeconds + 3600; break;
      case 'future-iat': claims['iat'] = nowSeconds + 3600; claims['exp'] = nowSeconds + 7200; break;
      case 'stale-iat': claims['iat'] = nowSeconds - 3600; claims['exp'] = nowSeconds + 3600; break;
      case 'missing-sub': delete claims['sub']; break;
      default: break;
    }
    for (const [name, value] of Object.entries(claims)) if (value === undefined) delete claims[name];

    if (failure === 'alg-none') {
      return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT', kid: signing.kid }))}.${b64url(JSON.stringify(claims))}.`;
    }
    if (failure === 'alg-hs256') {
      return new SignJWT(claims).setProtectedHeader({ alg: 'HS256', kid: signing.kid }).sign(new TextEncoder().encode(JSON.stringify(signing.publicJwk)));
    }
    let key = signing;
    if (failure === 'bad-signature') key = { ...rogue, kid: signing.kid };
    if (failure === 'unknown-kid') key = rogue;
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT' }).sign(key.privateKey);
  }

  async function token(init: RequestInit | undefined): Promise<Response> {
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    tokenRequestBodies.push(bodyText);
    const form = new URLSearchParams(bodyText);
    const headers = new Headers(init?.headers);
    const oauthError = (error: string, status = 400): Response => jsonResponse({ error, error_description: 'fake idp refusal' }, { 'Cache-Control': 'no-store' }, status);
    if (form.get('grant_type') !== 'authorization_code') return oauthError('unsupported_grant_type');
    let presentedId = form.get('client_id');
    let presentedSecret = form.get('client_secret');
    const basic = /^Basic (.+)$/.exec(headers.get('authorization') ?? '');
    if (basic?.[1] !== undefined) {
      const [id = '', secret = ''] = Buffer.from(basic[1], 'base64').toString('utf8').split(':').map(decodeURIComponent);
      presentedId = presentedId ?? id;
      presentedSecret = secret;
    }
    if (presentedId !== clientId || presentedSecret !== clientSecret) return oauthError('invalid_client', 401);
    const issued = codes.get(form.get('code') ?? '');
    if (issued === undefined || issued.used) return oauthError('invalid_grant'); // an unknown code and a replayed one look the same
    issued.used = true;
    if (form.get('redirect_uri') !== issued.redirectUri) return oauthError('invalid_grant');
    const verifier = form.get('code_verifier') ?? '';
    if (createHash('sha256').update(verifier, 'ascii').digest('base64url') !== issued.challenge) return oauthError('invalid_grant');
    return jsonResponse({ access_token: `fake-access-${randomBytes(8).toString('hex')}`, expires_in: 3599, scope: 'openid https://www.googleapis.com/auth/userinfo.email', token_type: 'Bearer', id_token: await mintIdToken(issued) }, { 'Cache-Control': 'no-store' });
  }

  const idp: FakeIdp = {
    issuer, clientId, clientSecret, calls, tokenRequestBodies, authorizationEndpoint, tokenEndpoint, jwksUri,
    account: { sub: 'fake-sub-1', email: 'owner@example.com' },
    get signingKid() { return signing.kid; },
    setDown(part, isDown) { if (isDown) down.add(part); else down.delete(part); },
    setFailure(mode) { failure = mode; },
    setClaims(claims) { claimOverrides = { ...claims }; },
    async rotateKey(rotateOptions = {}) {
      serial += 1;
      const next = await makeKey(`fake-kid-${String(serial)}`);
      if (rotateOptions.retire === true) keys.length = 0;
      keys.push(next);
      signing = next;
      return next.kid;
    },
    authorize(authorizationUrl, authorizeOptions = {}) {
      const url = new URL(authorizationUrl);
      if (`${url.origin}${url.pathname}` !== authorizationEndpoint) throw new Error('fake idp: not the authorization endpoint');
      const get = (name: string): string => url.searchParams.get(name) ?? '';
      if (get('response_type') !== 'code' || get('client_id') !== clientId) throw new Error('fake idp: bad response_type or client_id');
      if (!get('scope').split(' ').includes('openid')) throw new Error('fake idp: scope must include openid');
      if (get('code_challenge_method') !== 'S256' || get('code_challenge') === '') throw new Error('fake idp: PKCE S256 is required');
      for (const required of ['state', 'nonce', 'redirect_uri']) if (get(required) === '') throw new Error(`fake idp: ${required} is required`);
      const code = `fake-code-${randomBytes(16).toString('hex')}`;
      const account = authorizeOptions.account ?? idp.account;
      codes.set(code, { nonce: get('nonce'), challenge: get('code_challenge'), redirectUri: get('redirect_uri'), account, used: false });
      const callback = new URL(get('redirect_uri'));
      callback.searchParams.set('state', get('state'));
      callback.searchParams.set('code', code);
      callback.searchParams.set('scope', 'email openid https://www.googleapis.com/auth/userinfo.email');
      callback.searchParams.set('authuser', '0');
      callback.searchParams.set('prompt', 'consent');
      const params: Record<string, string> = {};
      for (const [name, value] of url.searchParams) params[name] = value;
      return { callbackUrl: callback.href, code, request: { state: get('state'), nonce: get('nonce'), redirectUri: get('redirect_uri'), codeChallenge: get('code_challenge'), params } };
    },
    fetch: async (input, init) => {
      const url = new URL(input);
      calls.push({ method: init?.method ?? 'GET', host: url.hostname, path: url.pathname });
      const part: FakeIdpPart | undefined = `${url.origin}${url.pathname}` === `${issuer}/.well-known/openid-configuration`
        ? 'discovery'
        : `${url.origin}${url.pathname}` === jwksUri ? 'jwks' : `${url.origin}${url.pathname}` === tokenEndpoint ? 'token' : undefined;
      if (part === undefined) return new Response('not found', { status: 404 });
      if (down.has('all') || down.has(part)) throw new TypeError('fetch failed');
      if (part === 'discovery') return jsonResponse(discovery, { 'Cache-Control': cacheControl });
      if (part === 'jwks') return jsonResponse({ keys: keys.map((k) => k.publicJwk) }, { 'Cache-Control': cacheControl });
      if ((init?.method ?? 'GET') !== 'POST') return new Response('method not allowed', { status: 405 });
      return token(init);
    },
  };
  return idp;
}
