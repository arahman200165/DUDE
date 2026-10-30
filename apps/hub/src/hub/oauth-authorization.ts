import { randomBytes } from 'node:crypto';
import { constantTimeEqual, generateCodeVerifier, generateState, isWellFormedToken, sha256Hex } from '../auth/oidc/pkce.js';

/**
 * The pending OAuth authorization of a backup destination (32-SS1, Milestones 856 and 857, PD-154, PD-150): the bridge between the
 * elevated admin pipe (which starts a connect, after the two-step confirmation, and completes it) and the one narrow callback GET the
 * provider redirects the owner's browser to. `drive-authorization.ts` (Google) and `onedrive-authorization.ts` (Microsoft) build it with
 * their provider's consent URL and code exchange; everything else is this one implementation. Everything lives IN MEMORY of the Hub
 * process and nowhere else:
 *
 * - one authorization at a time (starting another replaces it), valid for ten minutes;
 * - `state` is 32 random bytes, kept only as a SHA-256 hash and compared in constant time; the PKCE verifier, the owner's OAuth
 *   client secret and (after the callback) the refresh token are held only until the admin pipe takes them or the authorization
 *   expires, are zeroed by being dropped, and never reach a log, an audit row, a response or the database;
 * - the callback spends the state exactly once (a replay, an unknown or an expired state gets nothing) and never answers with a token:
 *   it records the outcome and a plain page tells the owner to return to the terminal;
 * - the callback can do nothing but record a refresh token against an authorization the admin pipe started: it cannot add a
 *   destination, change one or read anything. The destination is only created when the admin pipe completes it with the passphrase.
 *
 * `pkce.ts` (state, verifier, constant-time compare) is shared with Google sign-in; this is a separate flow, store and scope.
 */
export const OAUTH_AUTHORIZATION_TTL_MS = 10 * 60_000;

export type OAuthCallbackOutcome =
  /** The code was exchanged and a refresh token is waiting for the admin pipe. */
  | { result: 'authorized' }
  /** The owner declined, or the provider refused (a closed reason). */
  | { result: 'failed'; reason: string }
  /** No live authorization matches this state (unknown, replayed, expired or malformed): nothing was done. */
  | { result: 'unknown' };

export type OAuthAuthorizationStatus =
  | { state: 'waiting'; expiresAt: string }
  | { state: 'authorized'; expiresAt: string }
  | { state: 'failed'; reason: string }
  | { state: 'expired' }
  | { state: 'unknown' };

export interface OAuthAuthorizationStart {
  clientId: string;
  clientSecret: string;
  /** `https://host` or loopback `http://127.0.0.1:port`, already validated; the callback path is appended. */
  redirectOrigin: string;
}

export interface TakenAuthorization { clientId: string; clientSecret: string; refreshToken: string }

export interface OAuthAuthorizations {
  /** Starts (replacing any earlier) an authorization and returns the consent URL the owner opens. */
  begin(input: OAuthAuthorizationStart): { pendingId: string; authorizationUrl: string; redirectUri: string; expiresAt: string };
  /** True while an authorization is waiting for the callback (the cross-site GET exemption applies only then). */
  waiting(): boolean;
  status(pendingId: unknown): OAuthAuthorizationStatus;
  /** The callback: spends the state once. Never throws. */
  handleCallback(input: { state: unknown; code: unknown; error: unknown }): Promise<OAuthCallbackOutcome>;
  /** Hands the authorized client and refresh token to the admin pipe, once; the authorization is gone afterwards. */
  take(pendingId: unknown): TakenAuthorization | undefined;
  cancel(): void;
}

/** What differs between providers: where the callback lives, the consent URL and the code exchange (a closed result, never the provider's text). */
export interface OAuthProvider {
  callbackPath: string;
  buildAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; codeVerifier: string }): string;
  exchangeCode(input: { clientId: string; clientSecret: string; redirectUri: string; code: string; codeVerifier: string }): Promise<
    { status: 'ok'; refreshToken: string } | { status: 'rejected'; error: string } | { status: 'no-refresh-token' | 'scope-refused' | 'invalid-response' | 'unreachable' }
  >;
}

export interface OAuthAuthorizationsOptions {
  now?: () => number;
  ttlMs?: number;
}

interface Pending {
  id: string;
  stateHash: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  expiresAt: number;
  spent: boolean;
  outcome: 'waiting' | 'authorized' | 'failed';
  reason?: string;
  refreshToken?: string;
}

export function createOAuthAuthorizations(provider: OAuthProvider, options: OAuthAuthorizationsOptions = {}): OAuthAuthorizations {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? OAUTH_AUTHORIZATION_TTL_MS;
  let pending: Pending | undefined;

  const live = (): Pending | undefined => {
    if (pending !== undefined && pending.expiresAt <= now()) {
      pending.clientSecret = '';
      pending.verifier = '';
      delete pending.refreshToken;
      return pending; // kept (secret-free) so status can say `expired` until it is replaced
    }
    return pending;
  };
  const expired = (p: Pending): boolean => p.expiresAt <= now();
  const sameId = (p: Pending | undefined, id: unknown): p is Pending => p !== undefined && typeof id === 'string' && id.length === 32 && constantTimeEqual(p.id, id);

  return {
    begin(input) {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const redirectUri = `${input.redirectOrigin}${provider.callbackPath}`;
      pending = {
        id: randomBytes(16).toString('hex'), stateHash: sha256Hex(state), verifier, clientId: input.clientId, clientSecret: input.clientSecret, redirectUri,
        expiresAt: now() + ttl, spent: false, outcome: 'waiting',
      };
      return {
        pendingId: pending.id, redirectUri, expiresAt: new Date(pending.expiresAt).toISOString(),
        authorizationUrl: provider.buildAuthorizationUrl({ clientId: input.clientId, redirectUri, state, codeVerifier: verifier }),
      };
    },
    waiting() {
      const p = live();
      return p !== undefined && !expired(p) && p.outcome === 'waiting' && !p.spent;
    },
    status(pendingId) {
      const p = live();
      if (!sameId(p, pendingId)) return { state: 'unknown' };
      if (p.outcome === 'failed') return { state: 'failed', reason: p.reason ?? 'unknown' };
      if (expired(p)) return { state: 'expired' };
      return { state: p.outcome, expiresAt: new Date(p.expiresAt).toISOString() };
    },
    async handleCallback(input) {
      const p = live();
      const { state, code, error } = input;
      if (p === undefined || p.spent || expired(p) || !isWellFormedToken(state, 32, 128) || !constantTimeEqual(p.stateHash, sha256Hex(state))) return { result: 'unknown' };
      p.spent = true; // single use, whatever happens next: the owner starts a new connect
      if (typeof error === 'string' && error.length > 0) {
        p.outcome = 'failed';
        p.reason = error === 'access_denied' ? 'declined' : 'provider-error';
        p.clientSecret = '';
        p.verifier = '';
        return { result: 'failed', reason: p.reason };
      }
      if (typeof code !== 'string' || code.length === 0 || code.length > 2048) {
        p.outcome = 'failed';
        p.reason = 'no-code';
        p.clientSecret = '';
        p.verifier = '';
        return { result: 'failed', reason: p.reason };
      }
      const exchanged = await provider.exchangeCode({ clientId: p.clientId, clientSecret: p.clientSecret, redirectUri: p.redirectUri, code, codeVerifier: p.verifier });
      p.verifier = '';
      if (exchanged.status === 'ok') {
        p.outcome = 'authorized';
        p.refreshToken = exchanged.refreshToken;
        return { result: 'authorized' };
      }
      p.outcome = 'failed';
      p.reason = exchanged.status === 'rejected' ? exchanged.error : exchanged.status;
      p.clientSecret = '';
      return { result: 'failed', reason: p.reason };
    },
    take(pendingId) {
      const p = live();
      if (!sameId(p, pendingId) || p.outcome !== 'authorized' || p.refreshToken === undefined || expired(p)) return undefined;
      const taken: TakenAuthorization = { clientId: p.clientId, clientSecret: p.clientSecret, refreshToken: p.refreshToken };
      pending = undefined;
      return taken;
    },
    cancel() {
      pending = undefined;
    },
  };
}
