import type { HubClient } from '@dude/api-client';
import { HubApiError } from '@dude/api-client';
import type { AgentHubOwnerStatus } from '@dude/contracts';
import { HubManagerError } from './errors.js';

/** What the owner session needs from the connection manager. */
export interface OwnerSessionHost {
  now(): Date;
  /** Runs `fn` with a valid device token (refreshing on 401). `authRetryOn403: false` is for calls where 403 means "wrong password". */
  deviceCall<T>(fn: (api: HubClient, deviceToken: string) => Promise<T>, options?: { authRetryOn403?: boolean }): Promise<T>;
  /** Runs `fn` over the pinned channel with no device credential. */
  call<T>(fn: (api: HubClient) => Promise<T>): Promise<T>;
}

export interface OwnerSession {
  signIn(password: string): Promise<AgentHubOwnerStatus>;
  signOut(): Promise<void>;
  status(): AgentHubOwnerStatus;
  /** Runs an owner operation with the held bearer; a 401 clears the session and fails with `owner-session-expired`. */
  withOwner<T>(fn: (api: HubClient, ownerToken: string) => Promise<T>): Promise<T>;
  /** Drops the bearer (revocation, unenroll, agent exit). Never contacts the Hub. */
  clear(): void;
}

/**
 * Holds the `dob_` owner bearer ONLY in memory: it is never persisted, never returned over RPC and never logged. The owner
 * password is a parameter of `signIn` and is forgotten as soon as the Hub answers.
 */
export function createOwnerSession(host: OwnerSessionHost): OwnerSession {
  let held: { token: string; expiresAt: number; expiresAtIso: string; displayName: string } | null = null;

  const status = (): AgentHubOwnerStatus => (held ? { signedIn: true, displayName: held.displayName, expiresAt: held.expiresAtIso } : { signedIn: false, displayName: null, expiresAt: null });
  const clear = (): void => { held = null; };

  return {
    status,
    clear,
    async signIn(password) {
      const res = await host.deviceCall((api, token) => api.ownerBearer(token, password), { authRetryOn403: false });
      held = { token: res.accessToken, expiresAt: Date.parse(res.expiresAt), expiresAtIso: res.expiresAt, displayName: res.owner.displayName };
      return status();
    },
    async signOut() {
      const current = held;
      held = null;
      if (current) await host.call((api) => api.signOut(current.token)).catch(() => undefined);
    },
    async withOwner(fn) {
      const current = held;
      if (!current) throw new HubManagerError('owner-not-signed-in', 'Sign in as the Hub owner first.');
      if (Number.isFinite(current.expiresAt) && host.now().getTime() >= current.expiresAt) {
        held = null;
        throw new HubManagerError('owner-session-expired', 'The owner session expired. Sign in again.');
      }
      try {
        return await host.call((api) => fn(api, current.token));
      } catch (error) {
        if (error instanceof HubApiError && error.status === 401) {
          if (held === current) held = null;
          throw new HubManagerError('owner-session-expired', 'The owner session expired. Sign in again.');
        }
        throw error;
      }
    },
  };
}
