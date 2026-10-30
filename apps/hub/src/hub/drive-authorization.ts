import { HUB_BACKUP_DRIVE_PATHS } from '@dude/contracts/hub';
import { OAUTH_AUTHORIZATION_TTL_MS, createOAuthAuthorizations } from './oauth-authorization.js';
import type { OAuthAuthorizationStart, OAuthAuthorizationStatus, OAuthAuthorizations, OAuthCallbackOutcome, TakenAuthorization } from './oauth-authorization.js';
import { GOOGLE_DRIVE_ENDPOINTS, buildDriveAuthorizationUrl, exchangeDriveCode } from './drive-oauth.js';
import type { DriveEndpoints, DriveFetch } from './drive-oauth.js';

/**
 * The pending Google Drive authorization (32-SS1, Milestone 856, PD-154): the Google instance of the shared in-memory authorization
 * (`oauth-authorization.ts`, which documents the rules: one at a time, ten minutes, single-use hashed `state`, secrets held only in
 * memory, a callback that can only record a refresh token). Milestone 857 moved the provider-independent code there; the behaviour
 * of this module is unchanged.
 */
export const DRIVE_AUTHORIZATION_TTL_MS = OAUTH_AUTHORIZATION_TTL_MS;

export type DriveCallbackOutcome = OAuthCallbackOutcome;
export type DriveAuthorizationStatus = OAuthAuthorizationStatus;
export type DriveAuthorizationStart = OAuthAuthorizationStart;
export type DriveAuthorizations = OAuthAuthorizations;
export type { TakenAuthorization };

export interface DriveAuthorizationsOptions {
  now?: () => number;
  ttlMs?: number;
  /** Test seams: the Google endpoints and fetch. */
  endpoints?: DriveEndpoints;
  fetch?: DriveFetch;
}

export const driveRedirectUri = (redirectOrigin: string): string => `${redirectOrigin}${HUB_BACKUP_DRIVE_PATHS.callback}`;

export function createDriveAuthorizations(options: DriveAuthorizationsOptions = {}): DriveAuthorizations {
  const endpoints = options.endpoints ?? GOOGLE_DRIVE_ENDPOINTS;
  const fetchImpl: DriveFetch = options.fetch ?? ((input, init) => fetch(input, init));
  return createOAuthAuthorizations({
    callbackPath: HUB_BACKUP_DRIVE_PATHS.callback,
    buildAuthorizationUrl: (input) => buildDriveAuthorizationUrl({ endpoints, ...input }),
    exchangeCode: (input) => exchangeDriveCode({ fetch: fetchImpl, endpoints, ...input }),
  }, { ...(options.now !== undefined ? { now: options.now } : {}), ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}) });
}
