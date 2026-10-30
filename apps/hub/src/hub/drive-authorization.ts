import { randomBytes } from 'node:crypto';
import { HUB_BACKUP_DRIVE_PATHS } from '@dude/contracts/hub';
import { constantTimeEqual, generateCodeVerifier, generateState, isWellFormedToken, sha256Hex } from '../auth/oidc/pkce.js';
import { GOOGLE_DRIVE_ENDPOINTS, buildDriveAuthorizationUrl, exchangeDriveCode } from './drive-oauth.js';
import type { DriveEndpoints, DriveFetch } from './drive-oauth.js';

/**
 * The pending Google Drive authorization (32-SS1, Milestone 856, PD-154): the bridge between the elevated admin pipe (which starts a
 * connect, after the two-step confirmation, and completes it) and the one narrow callback GET Google redirects the owner's browser to.
 * Everything lives IN MEMORY of the Hub process and nowhere else:
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
export const DRIVE_AUTHORIZATION_TTL_MS = 10 * 60_000;

export type DriveCallbackOutcome =
  /** The code was exchanged and a refresh token is waiting for the admin pipe. */
  | { result: 'authorized' }
  /** The owner declined, or Google refused (a closed reason). */
  | { result: 'failed'; reason: string }
  /** No live authorization matches this state (unknown, replayed, expired or malformed): nothing was done. */
  | { result: 'unknown' };

export type DriveAuthorizationStatus =
  | { state: 'waiting'; expiresAt: string }
  | { state: 'authorized'; expiresAt: string }
  | { state: 'failed'; reason: string }
  | { state: 'expired' }
  | { state: 'unknown' };

export interface DriveAuthorizationStart {
  clientId: string;
  clientSecret: string;
  /** `https://host` or loopback `http://127.0.0.1:port`, already validated; the callback path is appended. */
  redirectOrigin: string;
}

export interface TakenAuthorization { clientId: string; clientSecret: string; refreshToken: string }

export interface DriveAuthorizations {
  /** Starts (replacing any earlier) an authorization and returns the consent URL the owner opens. */
  begin(input: DriveAuthorizationStart): { pendingId: string; authorizationUrl: string; redirectUri: string; expiresAt: string };
  /** True while an authorization is waiting for the callback (the cross-site GET exemption applies only then). */
  waiting(): boolean;
  status(pendingId: unknown): DriveAuthorizationStatus;
  /** The callback: spends the state once. Never throws. */
  handleCallback(input: { state: unknown; code: unknown; error: unknown }): Promise<DriveCallbackOutcome>;
  /** Hands the authorized client and refresh token to the admin pipe, once; the authorization is gone afterwards. */
  take(pendingId: unknown): TakenAuthorization | undefined;
  cancel(): void;
}

export interface DriveAuthorizationsOptions {
  now?: () => number;
  ttlMs?: number;
  /** Test seams: the Google endpoints and fetch. */
  endpoints?: DriveEndpoints;
  fetch?: DriveFetch;
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

export const driveRedirectUri = (redirectOrigin: string): string => `${redirectOrigin}${HUB_BACKUP_DRIVE_PATHS.callback}`;

export function createDriveAuthorizations(options: DriveAuthorizationsOptions = {}): DriveAuthorizations {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? DRIVE_AUTHORIZATION_TTL_MS;
  const endpoints = options.endpoints ?? GOOGLE_DRIVE_ENDPOINTS;
  const fetchImpl: DriveFetch = options.fetch ?? ((input, init) => fetch(input, init));
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
      const redirectUri = driveRedirectUri(input.redirectOrigin);
      pending = {
        id: randomBytes(16).toString('hex'), stateHash: sha256Hex(state), verifier, clientId: input.clientId, clientSecret: input.clientSecret, redirectUri,
        expiresAt: now() + ttl, spent: false, outcome: 'waiting',
      };
      return {
        pendingId: pending.id, redirectUri, expiresAt: new Date(pending.expiresAt).toISOString(),
        authorizationUrl: buildDriveAuthorizationUrl({ endpoints, clientId: input.clientId, redirectUri, state, codeVerifier: verifier }),
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
      const exchanged = await exchangeDriveCode({ fetch: fetchImpl, endpoints, clientId: p.clientId, clientSecret: p.clientSecret, redirectUri: p.redirectUri, code, codeVerifier: p.verifier });
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
