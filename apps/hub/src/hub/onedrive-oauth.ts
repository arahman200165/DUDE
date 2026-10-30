import { BACKUP_ONEDRIVE_SCOPES } from '@dude/contracts/hub';
import { codeChallengeS256 } from '../auth/oidc/pkce.js';
import { postForm } from './oauth-http.js';
import type { OAuthFetch } from './oauth-http.js';

/**
 * Microsoft OAuth for the OneDrive backup destination (32-SS1, Milestone 857, PD-150): the Microsoft identity platform v2 authorization
 * code flow with PKCE (S256) against the OWNER'S OWN app registration, requesting ONLY `Files.ReadWrite.AppFolder offline_access` (the
 * app sees and touches only its own app folder, the special folder `/me/drive/special/approot`, never the rest of the owner's OneDrive;
 * `offline_access` is what makes Microsoft issue a refresh token). Personal Microsoft accounts only (the `consumers` tenant): the app
 * folder does not exist on OneDrive for Business. Separate from Google sign-in (`auth/oidc`) and from the Drive consent
 * (`drive-oauth.ts`); it shares the PKCE and `state` helpers and the one form POST (`oauth-http.ts`).
 *
 * Differences from Google that the code keeps: a refresh token is ROTATED (every refresh may return a new one, which the caller must
 * persist before the old one is discarded), there is no revocation endpoint (the owner removes the app at account.microsoft.com; the
 * Hub's disconnect deletes its stored copy), and a consent that needs the owner again (`interaction_required`, a password change, 90
 * idle days) is `revoked` like Google's `invalid_grant`.
 *
 * Every result is a value with a closed code: the provider's text, the code, the verifier, the client secret and the tokens never leave
 * this module in a message. The only outbound hosts are Microsoft's (the fixed `MICROSOFT_ONEDRIVE_ENDPOINTS`); the endpoint object is
 * a test seam (a loopback fake) that no configuration, parameter or `hub.json` can reach. Redirects are never followed.
 */
export interface OneDriveEndpoints {
  authUrl: string;
  tokenUrl: string;
  /** `https://graph.microsoft.com/v1.0` */
  graphBase: string;
}

export const MICROSOFT_ONEDRIVE_ENDPOINTS: OneDriveEndpoints = {
  authUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  graphBase: 'https://graph.microsoft.com/v1.0',
};

export type OneDriveFetch = OAuthFetch;

/** The scope parameter exactly as it is sent. */
export const ONEDRIVE_SCOPE = BACKUP_ONEDRIVE_SCOPES.join(' ');

export const ONEDRIVE_OAUTH_ERRORS = [
  'invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'access_denied',
  'interaction_required', 'consent_required', 'login_required',
] as const;
export type OneDriveOAuthError = (typeof ONEDRIVE_OAUTH_ERRORS)[number] | 'unknown';

/** Errors that mean the owner must consent again (the refresh token no longer works and no retry can fix it). */
const REAUTH_ERRORS: readonly OneDriveOAuthError[] = ['invalid_grant', 'interaction_required', 'consent_required', 'login_required'];

/** The consent URL the owner opens. `prompt=consent` makes Microsoft show the consent screen (and issue a refresh token) every time. */
export function buildOneDriveAuthorizationUrl(input: { endpoints: Pick<OneDriveEndpoints, 'authUrl'>; clientId: string; redirectUri: string; state: string; codeVerifier: string }): string {
  const url = new URL(input.endpoints.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', ONEDRIVE_SCOPE);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', codeChallengeS256(input.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

const errorName = (json: Record<string, unknown> | undefined): OneDriveOAuthError => {
  const name = json?.['error'];
  return (ONEDRIVE_OAUTH_ERRORS as readonly unknown[]).includes(name) ? (name as OneDriveOAuthError) : 'unknown';
};

const TOKEN_PATTERN = /^[\x21-\x7e]+$/;
export const ONEDRIVE_REFRESH_TOKEN_MAX = 4096;
const ACCESS_TOKEN_MAX = 16_384;

/** Microsoft names granted scopes bare (`Files.ReadWrite.AppFolder`) or under the Graph resource (`https://graph.microsoft.com/Files.ReadWrite.AppFolder`). */
const normalizeScope = (scope: string): string => scope.replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase();

/** Whether a `scope` response grants the app folder and nothing beyond it and `offline_access`. */
export function grantsOnlyAppFolder(scope: string): boolean {
  const granted = scope.split(/\s+/).filter((s) => s.length > 0).map(normalizeScope);
  const allowed = BACKUP_ONEDRIVE_SCOPES.map((s) => s.toLowerCase());
  return granted.includes('files.readwrite.appfolder') && granted.every((s) => allowed.includes(s));
}

export type OneDriveCodeExchange =
  | { status: 'ok'; refreshToken: string }
  | { status: 'rejected'; error: OneDriveOAuthError }
  | { status: 'no-refresh-token' }
  | { status: 'scope-refused' }
  | { status: 'invalid-response' }
  | { status: 'unreachable' };

/** The authorization-code exchange. Only the refresh token is kept; the access token is discarded (the Hub refreshes on demand). */
export async function exchangeOneDriveCode(input: {
  fetch: OneDriveFetch; endpoints: Pick<OneDriveEndpoints, 'tokenUrl'>; clientId: string; clientSecret: string; redirectUri: string; code: string; codeVerifier: string;
}): Promise<OneDriveCodeExchange> {
  const result = await postForm(input.fetch, input.endpoints.tokenUrl, new URLSearchParams({
    grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier, client_id: input.clientId, client_secret: input.clientSecret,
    scope: ONEDRIVE_SCOPE,
  }));
  if (result === 'unreachable' || result.status >= 500 || result.status === 429) return { status: 'unreachable' };
  if (result.status !== 200) return { status: 'rejected', error: errorName(result.json) };
  const json = result.json;
  const tokenType = json?.['token_type'];
  if (json === undefined || (typeof tokenType === 'string' && tokenType.toLowerCase() !== 'bearer')) return { status: 'invalid-response' };
  // Anything beyond the app folder (and offline access) means a different request than the one built here: refuse it.
  const scope = json['scope'];
  if (typeof scope === 'string' && !grantsOnlyAppFolder(scope)) return { status: 'scope-refused' };
  const refreshToken = json['refresh_token'];
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return { status: 'no-refresh-token' };
  if (refreshToken.length > ONEDRIVE_REFRESH_TOKEN_MAX || !TOKEN_PATTERN.test(refreshToken)) return { status: 'invalid-response' };
  return { status: 'ok', refreshToken };
}

export type OneDriveTokenRefresh =
  /** `refreshToken` is the ROTATED token when Microsoft issued a new one: the caller persists it before the old one is dropped. */
  | { status: 'ok'; accessToken: string; refreshToken: string | undefined; expiresInSeconds: number }
  /** `invalid_grant` and its relatives: the owner revoked the consent, the token expired or the account needs interaction. */
  | { status: 'revoked' }
  | { status: 'rejected'; error: OneDriveOAuthError }
  | { status: 'invalid-response' }
  | { status: 'unreachable' };

export async function refreshOneDriveAccessToken(input: {
  fetch: OneDriveFetch; endpoints: Pick<OneDriveEndpoints, 'tokenUrl'>; clientId: string; clientSecret: string; refreshToken: string;
}): Promise<OneDriveTokenRefresh> {
  const result = await postForm(input.fetch, input.endpoints.tokenUrl, new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: input.refreshToken, client_id: input.clientId, client_secret: input.clientSecret, scope: ONEDRIVE_SCOPE,
  }));
  if (result === 'unreachable' || result.status >= 500 || result.status === 429) return { status: 'unreachable' };
  if (result.status !== 200) {
    const error = errorName(result.json);
    return REAUTH_ERRORS.includes(error) ? { status: 'revoked' } : { status: 'rejected', error };
  }
  const accessToken = result.json?.['access_token'];
  const expires = Number(result.json?.['expires_in']);
  if (typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > ACCESS_TOKEN_MAX || !TOKEN_PATTERN.test(accessToken)) return { status: 'invalid-response' };
  const rotated = result.json?.['refresh_token'];
  let refreshToken: string | undefined;
  if (rotated !== undefined) {
    if (typeof rotated !== 'string' || rotated.length === 0 || rotated.length > ONEDRIVE_REFRESH_TOKEN_MAX || !TOKEN_PATTERN.test(rotated)) return { status: 'invalid-response' };
    refreshToken = rotated;
  }
  return { status: 'ok', accessToken, refreshToken, expiresInSeconds: Number.isFinite(expires) && expires > 0 ? Math.min(expires, 3600) : 3000 };
}
