import {
  OIDC_CACHE_DEFAULT_MS, OIDC_CACHE_MAX_MS, OIDC_CACHE_MIN_MS, OIDC_CACHE_STALE_MAX_MS, OIDC_DISCOVERY_MAX_BYTES, OIDC_FAILURE_BACKOFF_MS,
  OIDC_JWKS_MAX_BYTES, OIDC_JWKS_MAX_KEYS, OIDC_JWKS_REFRESH_COOLDOWN_MS,
} from './constants.js';
import type { OidcEgress } from './egress.js';

/**
 * Discovery and JWKS retrieval with a bounded cache (32-SS1, Milestone 841, PD-145). Nothing here throws into a request path: every
 * outcome is a value, and a provider that cannot be reached (or answers with something unusable) is `unreachable`, which sign-in turns
 * into the explanatory fallback to the password path. A fresh cached copy is used without a request; a stale one (up to 24 hours)
 * keeps serving while the provider is down; a failed fetch is itself remembered for 30 seconds so an outage does not put a timeout in
 * front of every sign-in. Concurrent callers share one fetch.
 */

export interface OidcMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  /** How the client authenticates at the token endpoint: the body (`client_secret_post`, the default) or HTTP Basic. */
  tokenAuthMethod: 'post' | 'basic';
}

export interface RsaJwk { kty: 'RSA'; kid: string; n: string; e: string; alg?: 'RS256'; use?: 'sig' }

export type MetadataResult = { status: 'ok'; metadata: OidcMetadata; stale: boolean } | { status: 'unreachable' };
export type JwksResult = { status: 'ok'; keys: readonly RsaJwk[]; stale: boolean; refreshed: boolean } | { status: 'unreachable' };

export interface OidcProviderSnapshot {
  /** `unknown` until the first attempt. */
  discovery: 'unknown' | 'ok' | 'unreachable';
  lastOkAt: number | null;
  lastFailureAt: number | null;
}

export interface OidcProvider {
  metadata(): Promise<MetadataResult>;
  /** `forceRefresh` honors a cooldown: when one happened recently the cached keys are returned with `refreshed: false`. */
  jwks(options?: { forceRefresh?: boolean }): Promise<JwksResult>;
  snapshot(): OidcProviderSnapshot;
}

export interface OidcProviderOptions {
  issuer: string;
  egress: OidcEgress;
  now?: () => number;
}

interface Cached<T> { value: T; fetchedAt: number; ttlMs: number }

/** `Cache-Control: max-age` clamped to the Hub's bounds; the default when absent, `no-store` or unparsable. */
export function cacheTtlMs(cacheControl: string | undefined): number {
  if (cacheControl !== undefined) {
    const match = /(?:^|[\s,])max-age=(\d{1,9})(?:\s*,|\s*$)/i.exec(cacheControl);
    if (match?.[1] !== undefined) return Math.min(OIDC_CACHE_MAX_MS, Math.max(OIDC_CACHE_MIN_MS, Number(match[1]) * 1000));
  }
  return OIDC_CACHE_DEFAULT_MS;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const stringList = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : undefined);

function parseJson(body: string, contentType: string | undefined): unknown {
  if (contentType !== undefined && !/json/i.test(contentType)) return undefined;
  try { return JSON.parse(body) as unknown; } catch { return undefined; }
}

/** Validates a discovery document against the configured issuer and the egress allowlist; undefined when anything is off. */
export function parseDiscoveryDocument(doc: unknown, issuer: string, egress: Pick<OidcEgress, 'isAllowedUrl'>): OidcMetadata | undefined {
  if (!isRecord(doc) || doc['issuer'] !== issuer) return undefined;
  const authorizationEndpoint = doc['authorization_endpoint'];
  const tokenEndpoint = doc['token_endpoint'];
  const jwksUri = doc['jwks_uri'];
  for (const endpoint of [authorizationEndpoint, tokenEndpoint, jwksUri]) {
    if (typeof endpoint !== 'string' || endpoint.length > 512 || !egress.isAllowedUrl(endpoint)) return undefined;
  }
  const responseTypes = stringList(doc['response_types_supported']);
  if (responseTypes !== undefined && !responseTypes.includes('code')) return undefined;
  const challengeMethods = stringList(doc['code_challenge_methods_supported']);
  if (challengeMethods !== undefined && !challengeMethods.includes('S256')) return undefined;
  const algs = stringList(doc['id_token_signing_alg_values_supported']);
  if (algs !== undefined && !algs.includes('RS256')) return undefined;
  const authMethods = stringList(doc['token_endpoint_auth_methods_supported']);
  let tokenAuthMethod: OidcMetadata['tokenAuthMethod'] = 'post';
  if (authMethods !== undefined && !authMethods.includes('client_secret_post')) {
    if (authMethods.includes('client_secret_basic')) tokenAuthMethod = 'basic';
    else return undefined;
  }
  return { issuer, authorizationEndpoint: authorizationEndpoint as string, tokenEndpoint: tokenEndpoint as string, jwksUri: jwksUri as string, tokenAuthMethod };
}

/** Keeps the usable RSA signing keys of a JWKS; undefined when the document is malformed or none is usable. */
export function parseJwks(doc: unknown): RsaJwk[] | undefined {
  if (!isRecord(doc) || !Array.isArray(doc['keys']) || doc['keys'].length > OIDC_JWKS_MAX_KEYS) return undefined;
  const keys: RsaJwk[] = [];
  for (const entry of doc['keys'] as unknown[]) {
    if (!isRecord(entry) || entry['kty'] !== 'RSA') continue;
    const { kid, n, e, alg, use } = entry;
    if (typeof kid !== 'string' || kid.length === 0 || kid.length > 128 || typeof n !== 'string' || typeof e !== 'string' || n.length > 2048 || e.length > 16) continue;
    if (alg !== undefined && alg !== 'RS256') continue;
    if (use !== undefined && use !== 'sig') continue;
    if (keys.some((k) => k.kid === kid)) return undefined; // two keys with one kid are ambiguous
    keys.push({ kty: 'RSA', kid, n, e, ...(alg === 'RS256' ? { alg } : {}), ...(use === 'sig' ? { use } : {}) });
  }
  return keys.length > 0 ? keys : undefined;
}

export function createOidcProvider(options: OidcProviderOptions): OidcProvider {
  const now = options.now ?? Date.now;
  const { egress, issuer } = options;
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

  let metadataCache: Cached<OidcMetadata> | undefined;
  let jwksCache: Cached<readonly RsaJwk[]> | undefined;
  let metadataFailedAt: number | undefined;
  let jwksFailedAt: number | undefined;
  let lastJwksAttemptAt: number | undefined;
  let metadataPending: Promise<MetadataResult> | undefined;
  let jwksPending: Promise<JwksResult> | undefined;
  const state: OidcProviderSnapshot = { lastOkAt: null, lastFailureAt: null, discovery: 'unknown' };

  const ok = (): void => { state.discovery = 'ok'; state.lastOkAt = now(); };
  const failed = (): void => { state.discovery = 'unreachable'; state.lastFailureAt = now(); };
  const fresh = (cached: Cached<unknown> | undefined): boolean => cached !== undefined && now() - cached.fetchedAt < cached.ttlMs;
  const usableStale = (cached: Cached<unknown> | undefined): boolean => cached !== undefined && now() - cached.fetchedAt < OIDC_CACHE_STALE_MAX_MS;

  async function loadMetadata(): Promise<MetadataResult> {
    try {
      const response = await egress.request(discoveryUrl, { method: 'GET', maxBytes: OIDC_DISCOVERY_MAX_BYTES });
      const metadata = response.status === 200 ? parseDiscoveryDocument(parseJson(response.body, response.contentType), issuer, egress) : undefined;
      if (metadata === undefined) throw new Error('unusable');
      metadataCache = { value: metadata, fetchedAt: now(), ttlMs: cacheTtlMs(response.cacheControl) };
      metadataFailedAt = undefined;
      ok();
      return { status: 'ok', metadata, stale: false };
    } catch {
      metadataFailedAt = now();
      failed();
      return metadataCache !== undefined && usableStale(metadataCache) ? { status: 'ok', metadata: metadataCache.value, stale: true } : { status: 'unreachable' };
    }
  }

  async function loadJwks(jwksUri: string, refreshed: boolean): Promise<JwksResult> {
    lastJwksAttemptAt = now();
    try {
      const response = await egress.request(jwksUri, { method: 'GET', maxBytes: OIDC_JWKS_MAX_BYTES });
      const keys = response.status === 200 ? parseJwks(parseJson(response.body, response.contentType)) : undefined;
      if (keys === undefined) throw new Error('unusable');
      jwksCache = { value: keys, fetchedAt: now(), ttlMs: cacheTtlMs(response.cacheControl) };
      jwksFailedAt = undefined;
      ok();
      return { status: 'ok', keys, stale: false, refreshed };
    } catch {
      jwksFailedAt = now();
      failed();
      return jwksCache !== undefined && usableStale(jwksCache) ? { status: 'ok', keys: jwksCache.value, stale: true, refreshed: false } : { status: 'unreachable' };
    }
  }

  const provider: OidcProvider = {
    async metadata() {
      if (metadataCache !== undefined && fresh(metadataCache)) return { status: 'ok', metadata: metadataCache.value, stale: false };
      if (metadataFailedAt !== undefined && now() - metadataFailedAt < OIDC_FAILURE_BACKOFF_MS) {
        return metadataCache !== undefined && usableStale(metadataCache) ? { status: 'ok', metadata: metadataCache.value, stale: true } : { status: 'unreachable' };
      }
      metadataPending ??= loadMetadata().finally(() => { metadataPending = undefined; });
      return metadataPending;
    },
    async jwks(jwksOptions = {}) {
      const metadata = await provider.metadata();
      if (metadata.status !== 'ok') return { status: 'unreachable' };
      const force = jwksOptions.forceRefresh === true;
      const cooling = lastJwksAttemptAt !== undefined && now() - lastJwksAttemptAt < OIDC_JWKS_REFRESH_COOLDOWN_MS;
      if (jwksCache !== undefined && ((!force && fresh(jwksCache)) || (force && cooling))) return { status: 'ok', keys: jwksCache.value, stale: !fresh(jwksCache), refreshed: false };
      if (jwksFailedAt !== undefined && now() - jwksFailedAt < OIDC_FAILURE_BACKOFF_MS) {
        return jwksCache !== undefined && usableStale(jwksCache) ? { status: 'ok', keys: jwksCache.value, stale: true, refreshed: false } : { status: 'unreachable' };
      }
      jwksPending ??= loadJwks(metadata.metadata.jwksUri, force).finally(() => { jwksPending = undefined; });
      return jwksPending;
    },
    snapshot: () => ({ ...state }),
  };
  return provider;
}
