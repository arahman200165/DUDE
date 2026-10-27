import { OIDC_TOKEN_MAX_BYTES } from './constants.js';
import { OidcEgressError } from './egress.js';
import type { OidcEgress } from './egress.js';
import type { OidcMetadata } from './provider.js';

/**
 * The authorization-code exchange at the provider's token endpoint (32-SS1, Milestone 841). The client secret is passed in by the caller
 * (read from the secret store at the moment of the call and never kept) and goes out in the POST body (`client_secret_post`, which Google
 * accepts) or as HTTP Basic when the provider only offers that. Only the ID token is kept from the response: the access token is never
 * stored, returned or logged (the Hub asks for `openid email` and calls no provider API with it).
 *
 * The result is a value, never a throw, and carries a closed error name taken from a fixed list: the provider's own text, the code, the
 * verifier, the secret and the tokens never leave this function.
 */

export const OAUTH_ERRORS = ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope'] as const;
export type OAuthError = (typeof OAUTH_ERRORS)[number];

export type TokenExchangeResult =
  | { status: 'ok'; idToken: string }
  | { status: 'rejected'; error: OAuthError | 'unknown' }
  | { status: 'invalid-response' }
  | { status: 'unreachable' };

export interface TokenExchangeInput {
  egress: OidcEgress;
  metadata: Pick<OidcMetadata, 'tokenEndpoint' | 'tokenAuthMethod'>;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export async function exchangeAuthorizationCode(input: TokenExchangeInput): Promise<TokenExchangeResult> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (input.metadata.tokenAuthMethod === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(`${encodeURIComponent(input.clientId)}:${encodeURIComponent(input.clientSecret)}`, 'utf8').toString('base64')}`;
  } else {
    form.set('client_secret', input.clientSecret);
  }
  let response;
  try {
    response = await input.egress.request(input.metadata.tokenEndpoint, { method: 'POST', maxBytes: OIDC_TOKEN_MAX_BYTES, headers, body: form.toString() });
  } catch (error) {
    if (error instanceof OidcEgressError) return { status: 'unreachable' };
    return { status: 'unreachable' };
  }
  let json: unknown;
  try { json = JSON.parse(response.body) as unknown; } catch { json = undefined; }
  const record = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  if (response.status >= 500 || response.status === 429) return { status: 'unreachable' };
  if (response.status !== 200) {
    const name = record?.['error'];
    return { status: 'rejected', error: (OAUTH_ERRORS as readonly unknown[]).includes(name) ? (name as OAuthError) : 'unknown' };
  }
  const idToken = record?.['id_token'];
  const tokenType = record?.['token_type'];
  if (typeof idToken !== 'string' || idToken.length === 0 || (typeof tokenType === 'string' && tokenType.toLowerCase() !== 'bearer')) return { status: 'invalid-response' };
  return { status: 'ok', idToken };
}
