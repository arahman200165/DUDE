import { GOOGLE_EGRESS_HOSTS, GOOGLE_ISSUER, OIDC_FETCH_TIMEOUT_MS, OIDC_MAX_REDIRECTS } from './constants.js';

/**
 * The only outbound HTTP the OIDC feature makes (32-SS1, Milestone 841): discovery, JWKS and the token exchange, to the configured
 * issuer's own hosts and nowhere else. It is the Hub's third outbound path after ACME and the tunnel connector and is disclosed as such
 * (SECURITY.md, the provisioning `oidc` component). Rules, all enforced here and never by callers:
 *
 * - `https` only, no credentials in the URL, default port only, host in the allowlist (exact match, no wildcard);
 * - redirects are never followed to another host; a same-host redirect is followed on GET only (at most two hops); POST never redirects;
 * - one timeout covers every hop and the body read; the body is read as a bounded stream and refused past `maxBytes`;
 * - no cookies, no cache, no caller-supplied `Host`;
 * - a failure is a closed code (`OidcEgressError.code`), never a URL, a header or a body, so nothing sensitive reaches a log or an audit row.
 */

export type EgressFailure = 'not-https' | 'host-not-allowed' | 'redirect-refused' | 'too-large' | 'timeout' | 'network';

export class OidcEgressError extends Error {
  readonly code: EgressFailure;
  constructor(code: EgressFailure) {
    super(`OIDC request refused or failed (${code}).`);
    this.name = 'OidcEgressError';
    this.code = code;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface EgressResponse {
  status: number;
  contentType: string | undefined;
  cacheControl: string | undefined;
  body: string;
}

export interface EgressRequest {
  method: 'GET' | 'POST';
  maxBytes: number;
  headers?: Record<string, string>;
  /** `application/x-www-form-urlencoded` body for the token exchange. */
  body?: string;
}

export interface OidcEgress {
  readonly allowedHosts: readonly string[];
  isAllowedUrl(url: string): boolean;
  request(url: string, request: EgressRequest): Promise<EgressResponse>;
}

/** The hosts an issuer's endpoints may live on: Google's three, or (any other issuer) its own host and nothing else. */
export function allowedEgressHosts(issuer: string): readonly string[] {
  if (issuer === GOOGLE_ISSUER) return GOOGLE_EGRESS_HOSTS;
  return [new URL(issuer).hostname.toLowerCase()];
}

function checkUrl(raw: string, allowed: ReadonlySet<string>): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new OidcEgressError('not-https'); }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') throw new OidcEgressError('not-https');
  if (url.port !== '' && url.port !== '443') throw new OidcEgressError('host-not-allowed');
  if (!allowed.has(url.hostname.toLowerCase())) throw new OidcEgressError('host-not-allowed');
  return url;
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await response.body?.cancel(); } catch { /* best effort */ }
    throw new OidcEgressError('too-large');
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best effort */ }
        throw new OidcEgressError('too-large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createOidcEgress(options: { allowedHosts: readonly string[]; fetch?: FetchLike; timeoutMs?: number }): OidcEgress {
  const allowed = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? OIDC_FETCH_TIMEOUT_MS;

  return {
    allowedHosts: [...allowed],
    isAllowedUrl(url) {
      try { checkUrl(url, allowed); return true; } catch { return false; }
    },
    async request(rawUrl, request) {
      const signal = AbortSignal.timeout(timeoutMs);
      let current = checkUrl(rawUrl, allowed);
      const originHost = current.hostname.toLowerCase();
      try {
        for (let hop = 0; ; hop += 1) {
          const init: RequestInit = {
            method: request.method,
            headers: { Accept: 'application/json', ...request.headers },
            redirect: 'manual',
            credentials: 'omit',
            cache: 'no-store',
            signal,
            ...(request.body !== undefined ? { body: request.body } : {}),
          };
          const response = await doFetch(current.href, init);
          if (response.status >= 300 && response.status < 400) {
            try { await response.body?.cancel(); } catch { /* best effort */ }
            const location = response.headers.get('location');
            if (request.method !== 'GET' || location === null || hop >= OIDC_MAX_REDIRECTS) throw new OidcEgressError('redirect-refused');
            let next: URL;
            try { next = checkUrl(new URL(location, current).href, allowed); } catch { throw new OidcEgressError('redirect-refused'); }
            if (next.hostname.toLowerCase() !== originHost) throw new OidcEgressError('redirect-refused');
            current = next;
            continue;
          }
          const body = await readBounded(response, request.maxBytes);
          return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, cacheControl: response.headers.get('cache-control') ?? undefined, body };
        }
      } catch (error) {
        if (error instanceof OidcEgressError) throw error;
        if (signal.aborted) throw new OidcEgressError('timeout');
        throw new OidcEgressError('network');
      }
    },
  };
}
