import { HUB_BACKUP_ONEDRIVE_PATHS } from '@dude/contracts/hub';
import { createOAuthAuthorizations } from './oauth-authorization.js';
import type { OAuthAuthorizations } from './oauth-authorization.js';
import { MICROSOFT_ONEDRIVE_ENDPOINTS, buildOneDriveAuthorizationUrl, exchangeOneDriveCode } from './onedrive-oauth.js';
import type { OneDriveEndpoints, OneDriveFetch } from './onedrive-oauth.js';

/**
 * The pending OneDrive authorization (32-SS1, Milestone 857, PD-150): the Microsoft instance of the shared in-memory authorization
 * (`oauth-authorization.ts`, which documents the rules: one at a time, ten minutes, single-use hashed `state`, secrets held only in
 * memory, a callback that can only record a refresh token). Its callback is `GET /api/v1/backup/onedrive/callback`.
 */
export type OneDriveAuthorizations = OAuthAuthorizations;

export interface OneDriveAuthorizationsOptions {
  now?: () => number;
  ttlMs?: number;
  /** Test seams: the Microsoft endpoints and fetch. */
  endpoints?: OneDriveEndpoints;
  fetch?: OneDriveFetch;
}

export const onedriveRedirectUri = (redirectOrigin: string): string => `${redirectOrigin}${HUB_BACKUP_ONEDRIVE_PATHS.callback}`;

export function createOneDriveAuthorizations(options: OneDriveAuthorizationsOptions = {}): OneDriveAuthorizations {
  const endpoints = options.endpoints ?? MICROSOFT_ONEDRIVE_ENDPOINTS;
  const fetchImpl: OneDriveFetch = options.fetch ?? ((input, init) => fetch(input, init));
  return createOAuthAuthorizations({
    callbackPath: HUB_BACKUP_ONEDRIVE_PATHS.callback,
    buildAuthorizationUrl: (input) => buildOneDriveAuthorizationUrl({ endpoints, ...input }),
    exchangeCode: (input) => exchangeOneDriveCode({ fetch: fetchImpl, endpoints, ...input }),
  }, { ...(options.now !== undefined ? { now: options.now } : {}), ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}) });
}
