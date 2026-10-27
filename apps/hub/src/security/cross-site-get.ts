import { OIDC_CALLBACK_PATH } from '../auth/oidc/constants.js';

/**
 * Cross-site GET navigations to the API (32-SS1, Milestone 841, PD-145).
 *
 * The session cookie is `SameSite=Strict`, so a request another site causes never carries it; the request guard's CSRF checks cover the
 * mutating methods. This module closes the remaining case defence-in-depth: a top-level cross-site NAVIGATION (`Sec-Fetch-Site:
 * cross-site` with `Sec-Fetch-Mode: navigate`) to anything under `/api` is refused, EXCEPT the exact entries of
 * `CROSS_SITE_GET_ALLOWLIST`. Today that is one: the OIDC provider's redirect back to the Hub, which is by nature a cross-site
 * navigation. Cross-site `cors` fetches stay governed by CORS (the Hub sends no `Access-Control-Allow-Origin`), exactly as before.
 *
 * The exemption is deliberately narrow:
 * - exactly `GET` (HEAD included in the refusal, never in the exemption) and exactly the path (no prefix, no variants);
 * - only while OIDC is configured;
 * - only a real navigation to a document (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`) when the metadata says cross-site;
 * - only the named query parameters, each at most once, in at most `QUERY_MAX_CHARS`, with no body;
 * - the request is then treated as CREDENTIAL-LESS: the `Cookie` and `Authorization` headers are removed before any handler runs, so a
 *   session can never be the authority for the callback. The handler (Milestone 842) is session-less: it consumes the single-use
 *   `state`, and then redirects to a same-site page where the (Strict) cookie is available again.
 */

export interface CrossSiteGetEntry {
  readonly method: 'GET';
  readonly path: string;
  /** The query parameters the provider (or the browser) may add; anything else is a bad request. */
  readonly queryParams: readonly string[];
  /** The feature that must be configured for the entry to apply. */
  readonly requires: 'oidc';
}

export const QUERY_MAX_CHARS = 4096;

/**
 * Exhaustive list of cross-site GET exemptions. `code`, `state`, `error` and `error_description` are the authorization response
 * (RFC 6749 section 4.1.2); Google also appends `scope`, `authuser`, `prompt` and (for a Workspace account) `hd`, and RFC 9207 defines
 * `iss`, so they are tolerated: none is used as authority.
 */
export const CROSS_SITE_GET_ALLOWLIST: readonly CrossSiteGetEntry[] = [
  {
    method: 'GET',
    path: OIDC_CALLBACK_PATH,
    queryParams: ['code', 'state', 'error', 'error_description', 'error_uri', 'iss', 'scope', 'authuser', 'prompt', 'hd'],
    requires: 'oidc',
  },
];

export type CrossSiteGetDecision =
  | { action: 'pass' }
  /** The request is an allowlisted cross-site navigation: strip every credential header and let the handler run. */
  | { action: 'allow-credentialless' }
  | { action: 'refuse'; status: 400 | 403; message: string };

export interface CrossSiteGetInput {
  method: string;
  /** The raw request URL (path and query). */
  url: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Whether the optional features named by `requires` are configured. */
  features: { oidc: boolean };
}

const header = (headers: CrossSiteGetInput['headers'], name: string): string | undefined => {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
};

const REFUSED: CrossSiteGetDecision = { action: 'refuse', status: 403, message: 'Cross-site requests are not allowed.' };

export function evaluateCrossSiteGet(input: CrossSiteGetInput): CrossSiteGetDecision {
  if (input.method !== 'GET' && input.method !== 'HEAD') return { action: 'pass' };
  const queryAt = input.url.indexOf('?');
  const pathname = queryAt === -1 ? input.url : input.url.slice(0, queryAt);
  if (!(pathname === '/api' || pathname.startsWith('/api/'))) return { action: 'pass' };

  const site = header(input.headers, 'sec-fetch-site');
  const mode = header(input.headers, 'sec-fetch-mode');
  const entry = CROSS_SITE_GET_ALLOWLIST.find((candidate) => candidate.path === pathname);

  if (entry !== undefined && input.method === 'GET' && input.features[entry.requires]) {
    const query = queryAt === -1 ? '' : input.url.slice(queryAt + 1);
    if (query.length > QUERY_MAX_CHARS) return { action: 'refuse', status: 400, message: 'The request is not valid.' };
    const seen = new Set<string>();
    for (const [name] of new URLSearchParams(query)) {
      if (!entry.queryParams.includes(name) || seen.has(name)) return { action: 'refuse', status: 400, message: 'The request is not valid.' };
      seen.add(name);
    }
    const hasBody = (header(input.headers, 'content-length') ?? '0') !== '0' || input.headers['transfer-encoding'] !== undefined;
    if (hasBody) return { action: 'refuse', status: 400, message: 'The request is not valid.' };
    if (site === 'cross-site') {
      // Tolerated for this path only, and only as a genuine top-level navigation to a document.
      if (mode !== 'navigate' || header(input.headers, 'sec-fetch-dest') !== 'document') return REFUSED;
    }
    return { action: 'allow-credentialless' };
  }

  return site === 'cross-site' && mode === 'navigate' ? REFUSED : { action: 'pass' };
}
