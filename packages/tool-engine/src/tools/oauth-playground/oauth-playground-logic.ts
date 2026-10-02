import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure, framework-free OAuth 2.0 / OIDC request and response builders and
 * inspectors, used by the OAuth 2.0 Playground tool. Every function here
 * either assembles a request from user-supplied fields or parses a
 * user-pasted response — never performs a live redirect or network call.
 */

import { base64url } from 'jose';
import { JwtDecodeResult, decodeJwt } from "../jwt/jwt-decode.js";

export type GrantType =
  | 'authorization_code'
  | 'pkce'
  | 'client_credentials'
  | 'password'
  | 'device_code'
  | 'implicit'
  | 'refresh_token';

export type PlaygroundResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface UrlBuildResult {
  readonly url: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface TokenRequestBuildResult {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

function appendQuery(endpoint: string, query: Readonly<Record<string, string>>): string {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}${new URLSearchParams(query).toString()}`;
}

// --- PKCE helpers (duplicated from the PKCE Generator tool per the isolation convention) ---

const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function secureRandomInt(exclusiveMax: number): number {
  const limit = Math.floor(256 / exclusiveMax) * exclusiveMax;
  const bytes = new Uint8Array(1);
  let value: number;
  do {
    hostCrypto().getRandomValues(bytes);
    value = bytes[0];
  } while (value >= limit);
  return value % exclusiveMax;
}

export function generatePkceVerifier(length = 64): string {
  const clamped = Math.min(128, Math.max(43, Math.round(length)));
  let verifier = '';
  for (let i = 0; i < clamped; i++) verifier += UNRESERVED_CHARS[secureRandomInt(UNRESERVED_CHARS.length)];
  return verifier;
}

export async function computePkceChallenge(verifier: string): Promise<string> {
  const digest = await hostCrypto().subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

// --- Authorization Code / PKCE / Implicit: build the authorization request URL ---

export interface AuthorizationRequestParams {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope?: string;
  readonly state?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: 'S256' | 'plain';
}

export function buildAuthorizationCodeRequest(params: AuthorizationRequestParams): PlaygroundResult<UrlBuildResult> {
  if (!params.authorizationEndpoint) return { ok: false, error: 'Authorization endpoint is required.' };
  if (!params.clientId) return { ok: false, error: 'Client ID is required.' };
  if (!params.redirectUri) return { ok: false, error: 'Redirect URI is required.' };

  const query: Record<string, string> = {
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
  };
  if (params.scope) query['scope'] = params.scope;
  if (params.state) query['state'] = params.state;
  if (params.codeChallenge) {
    query['code_challenge'] = params.codeChallenge;
    query['code_challenge_method'] = params.codeChallengeMethod ?? 'S256';
  }

  return { ok: true, value: { url: appendQuery(params.authorizationEndpoint, query), params: query } };
}

export function buildImplicitRequest(params: AuthorizationRequestParams): PlaygroundResult<UrlBuildResult> {
  if (!params.authorizationEndpoint) return { ok: false, error: 'Authorization endpoint is required.' };
  if (!params.clientId) return { ok: false, error: 'Client ID is required.' };
  if (!params.redirectUri) return { ok: false, error: 'Redirect URI is required.' };

  const query: Record<string, string> = { response_type: 'token', client_id: params.clientId, redirect_uri: params.redirectUri };
  if (params.scope) query['scope'] = params.scope;
  if (params.state) query['state'] = params.state;

  return { ok: true, value: { url: appendQuery(params.authorizationEndpoint, query), params: query } };
}

export interface CallbackInspection {
  readonly code?: string;
  readonly token?: string;
  readonly state?: string;
  readonly error?: string;
  readonly errorDescription?: string;
}

export function inspectAuthorizationCallback(callbackUrl: string): PlaygroundResult<CallbackInspection> {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return { ok: false, error: 'Not a valid URL.' };
  }

  const params = url.searchParams.toString() !== '' ? url.searchParams : new URLSearchParams(url.hash.replace(/^#/, ''));
  return {
    ok: true,
    value: {
      code: params.get('code') ?? undefined,
      token: params.get('access_token') ?? undefined,
      state: params.get('state') ?? undefined,
      error: params.get('error') ?? undefined,
      errorDescription: params.get('error_description') ?? undefined,
    },
  };
}

// --- Client Credentials / Password / Refresh Token / Authorization Code exchange: token request ---

export type TokenGrantType = 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';

export interface TokenRequestParams {
  readonly grantType: TokenGrantType;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly scope?: string;
  readonly code?: string;
  readonly redirectUri?: string;
  readonly codeVerifier?: string;
  readonly username?: string;
  readonly password?: string;
  readonly refreshToken?: string;
}

export function buildTokenRequestBody(params: TokenRequestParams): PlaygroundResult<TokenRequestBuildResult> {
  if (!params.tokenEndpoint) return { ok: false, error: 'Token endpoint is required.' };
  if (!params.clientId) return { ok: false, error: 'Client ID is required.' };

  const body: Record<string, string> = { grant_type: params.grantType, client_id: params.clientId };
  if (params.clientSecret) body['client_secret'] = params.clientSecret;
  if (params.scope) body['scope'] = params.scope;

  if (params.grantType === 'authorization_code') {
    if (!params.code) return { ok: false, error: 'Authorization code is required.' };
    if (!params.redirectUri) return { ok: false, error: 'Redirect URI is required.' };
    body['code'] = params.code;
    body['redirect_uri'] = params.redirectUri;
    if (params.codeVerifier) body['code_verifier'] = params.codeVerifier;
  } else if (params.grantType === 'password') {
    if (!params.username) return { ok: false, error: 'Username is required.' };
    if (!params.password) return { ok: false, error: 'Password is required.' };
    body['username'] = params.username;
    body['password'] = params.password;
  } else if (params.grantType === 'refresh_token') {
    if (!params.refreshToken) return { ok: false, error: 'Refresh token is required.' };
    body['refresh_token'] = params.refreshToken;
  }

  return {
    ok: true,
    value: { url: params.tokenEndpoint, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() },
  };
}

// --- Device Authorization Grant ---

export interface DeviceAuthorizationParams {
  readonly deviceAuthorizationEndpoint: string;
  readonly clientId: string;
  readonly scope?: string;
}

export function buildDeviceAuthorizationRequest(params: DeviceAuthorizationParams): PlaygroundResult<TokenRequestBuildResult> {
  if (!params.deviceAuthorizationEndpoint) return { ok: false, error: 'Device authorization endpoint is required.' };
  if (!params.clientId) return { ok: false, error: 'Client ID is required.' };

  const body: Record<string, string> = { client_id: params.clientId };
  if (params.scope) body['scope'] = params.scope;

  return {
    ok: true,
    value: {
      url: params.deviceAuthorizationEndpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    },
  };
}

export interface DeviceAuthorizationResponse {
  readonly deviceCode?: string;
  readonly userCode?: string;
  readonly verificationUri?: string;
  readonly verificationUriComplete?: string;
  readonly expiresIn?: number;
  readonly interval?: number;
}

export function inspectDeviceAuthorizationResponse(json: string): PlaygroundResult<DeviceAuthorizationResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: 'Not a JSON object.' };

  const p = parsed as Record<string, unknown>;
  return {
    ok: true,
    value: {
      deviceCode: typeof p['device_code'] === 'string' ? p['device_code'] : undefined,
      userCode: typeof p['user_code'] === 'string' ? p['user_code'] : undefined,
      verificationUri: typeof p['verification_uri'] === 'string' ? p['verification_uri'] : undefined,
      verificationUriComplete: typeof p['verification_uri_complete'] === 'string' ? p['verification_uri_complete'] : undefined,
      expiresIn: typeof p['expires_in'] === 'number' ? p['expires_in'] : undefined,
      interval: typeof p['interval'] === 'number' ? p['interval'] : undefined,
    },
  };
}

// --- Token response inspection (shared across every grant type's "inspect" side) ---

export interface TokenResponseInspection {
  readonly isError: boolean;
  readonly errorCode?: string;
  readonly errorDescription?: string;
  readonly accessToken?: string;
  readonly accessTokenDecoded?: JwtDecodeResult;
  readonly idToken?: string;
  readonly idTokenDecoded?: JwtDecodeResult;
  readonly refreshToken?: string;
  readonly tokenType?: string;
  readonly expiresIn?: number;
  readonly scope?: string;
}

function decodeIfJwt(token: string): JwtDecodeResult | undefined {
  return token.split('.').length === 3 ? decodeJwt(token) : undefined;
}

export function inspectTokenResponse(json: string): PlaygroundResult<TokenResponseInspection> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: 'Not a JSON object.' };

  const p = parsed as Record<string, unknown>;

  if (typeof p['error'] === 'string') {
    return {
      ok: true,
      value: { isError: true, errorCode: p['error'], errorDescription: typeof p['error_description'] === 'string' ? p['error_description'] : undefined },
    };
  }

  const accessToken = typeof p['access_token'] === 'string' ? p['access_token'] : undefined;
  const idToken = typeof p['id_token'] === 'string' ? p['id_token'] : undefined;

  return {
    ok: true,
    value: {
      isError: false,
      accessToken,
      accessTokenDecoded: accessToken ? decodeIfJwt(accessToken) : undefined,
      idToken,
      idTokenDecoded: idToken ? decodeIfJwt(idToken) : undefined,
      refreshToken: typeof p['refresh_token'] === 'string' ? p['refresh_token'] : undefined,
      tokenType: typeof p['token_type'] === 'string' ? p['token_type'] : undefined,
      expiresIn: typeof p['expires_in'] === 'number' ? p['expires_in'] : undefined,
      scope: typeof p['scope'] === 'string' ? p['scope'] : undefined,
    },
  };
}
