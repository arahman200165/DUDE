import { codeChallengeS256 } from '../auth/oidc/pkce.js';
import { postForm } from './oauth-http.js';
import type { OAuthFetch } from './oauth-http.js';

/**
 * Google OAuth for the Drive backup destination (32-SS1, Milestone 856, PD-154): authorization code with PKCE (S256) against the
 * OWNER'S OWN OAuth client, requesting ONLY the narrow `drive.file` scope (the app sees and touches only files and folders it
 * created, never the rest of the owner's Drive). This consent is separate from Google sign-in (`auth/oidc`): different client use,
 * different scope, different consequence; it shares only the PKCE/state helpers.
 *
 * Every result is a value with a closed code: the provider's text, the code, the verifier, the client secret and the tokens never
 * leave this module in a message. The only outbound hosts are Google's (the fixed `GOOGLE_DRIVE_ENDPOINTS`); the endpoint object is a
 * test seam (a loopback fake) that no configuration, parameter or `hub.json` can reach. Redirects are never followed.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface DriveEndpoints {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  /** `https://www.googleapis.com/drive/v3` */
  apiBase: string;
  /** `https://www.googleapis.com/upload/drive/v3` */
  uploadBase: string;
}

export const GOOGLE_DRIVE_ENDPOINTS: DriveEndpoints = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  apiBase: 'https://www.googleapis.com/drive/v3',
  uploadBase: 'https://www.googleapis.com/upload/drive/v3',
};

export type DriveFetch = OAuthFetch;

export const DRIVE_OAUTH_ERRORS = ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'access_denied'] as const;
export type DriveOAuthError = (typeof DRIVE_OAUTH_ERRORS)[number] | 'unknown';

/** The consent URL the owner opens. `access_type=offline` and `prompt=consent` make Google issue a refresh token. */
export function buildDriveAuthorizationUrl(input: { endpoints: Pick<DriveEndpoints, 'authUrl'>; clientId: string; redirectUri: string; state: string; codeVerifier: string }): string {
  const url = new URL(input.endpoints.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', DRIVE_FILE_SCOPE);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', codeChallengeS256(input.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

const errorName = (json: Record<string, unknown> | undefined): DriveOAuthError => {
  const name = json?.['error'];
  return (DRIVE_OAUTH_ERRORS as readonly unknown[]).includes(name) ? (name as DriveOAuthError) : 'unknown';
};

export type DriveCodeExchange =
  | { status: 'ok'; refreshToken: string }
  | { status: 'rejected'; error: DriveOAuthError }
  | { status: 'no-refresh-token' }
  | { status: 'scope-refused' }
  | { status: 'invalid-response' }
  | { status: 'unreachable' };

/** The authorization-code exchange. Only the refresh token is kept; the access token is discarded (the Hub refreshes on demand). */
export async function exchangeDriveCode(input: {
  fetch: DriveFetch; endpoints: Pick<DriveEndpoints, 'tokenUrl'>; clientId: string; clientSecret: string; redirectUri: string; code: string; codeVerifier: string;
}): Promise<DriveCodeExchange> {
  const result = await postForm(input.fetch, input.endpoints.tokenUrl, new URLSearchParams({
    grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier, client_id: input.clientId, client_secret: input.clientSecret,
  }));
  if (result === 'unreachable' || result.status >= 500 || result.status === 429) return { status: 'unreachable' };
  if (result.status !== 200) return { status: 'rejected', error: errorName(result.json) };
  const json = result.json;
  const tokenType = json?.['token_type'];
  if (json === undefined || (typeof tokenType === 'string' && tokenType.toLowerCase() !== 'bearer')) return { status: 'invalid-response' };
  // Google lists the granted scopes; anything beyond `drive.file` means a different request than the one built here: refuse it.
  const scope = json['scope'];
  if (typeof scope === 'string') {
    const granted = scope.split(/\s+/).filter((s) => s.length > 0);
    if (!granted.includes(DRIVE_FILE_SCOPE) || granted.some((s) => s !== DRIVE_FILE_SCOPE)) return { status: 'scope-refused' };
  }
  const refreshToken = json['refresh_token'];
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return { status: 'no-refresh-token' };
  if (refreshToken.length > 2048 || !/^[\x21-\x7e]+$/.test(refreshToken)) return { status: 'invalid-response' };
  return { status: 'ok', refreshToken };
}

export type DriveTokenRefresh =
  | { status: 'ok'; accessToken: string; expiresInSeconds: number }
  /** `invalid_grant`: the owner revoked the consent, the token expired (a test-mode client's tokens last seven days) or the password changed. */
  | { status: 'revoked' }
  | { status: 'rejected'; error: DriveOAuthError }
  | { status: 'invalid-response' }
  | { status: 'unreachable' };

export async function refreshDriveAccessToken(input: {
  fetch: DriveFetch; endpoints: Pick<DriveEndpoints, 'tokenUrl'>; clientId: string; clientSecret: string; refreshToken: string;
}): Promise<DriveTokenRefresh> {
  const result = await postForm(input.fetch, input.endpoints.tokenUrl, new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: input.refreshToken, client_id: input.clientId, client_secret: input.clientSecret,
  }));
  if (result === 'unreachable' || result.status >= 500 || result.status === 429) return { status: 'unreachable' };
  if (result.status !== 200) {
    const error = errorName(result.json);
    return error === 'invalid_grant' ? { status: 'revoked' } : { status: 'rejected', error };
  }
  const accessToken = result.json?.['access_token'];
  const expires = Number(result.json?.['expires_in']);
  if (typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > 4096 || !/^[\x21-\x7e]+$/.test(accessToken)) return { status: 'invalid-response' };
  return { status: 'ok', accessToken, expiresInSeconds: Number.isFinite(expires) && expires > 0 ? Math.min(expires, 3600) : 3000 };
}

/** Best-effort revocation of a refresh token at Google (the disconnect path). Returns whether Google confirmed it. Never throws. */
export async function revokeDriveToken(input: { fetch: DriveFetch; endpoints: Pick<DriveEndpoints, 'revokeUrl'>; refreshToken: string }): Promise<boolean> {
  const result = await postForm(input.fetch, input.endpoints.revokeUrl, new URLSearchParams({ token: input.refreshToken }));
  return result !== 'unreachable' && result.status === 200;
}
