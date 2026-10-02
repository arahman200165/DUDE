/**
 * Pure, framework-free OpenID Connect Discovery Document validation used by
 * the OIDC Discovery Document Inspector tool. Parses a pasted
 * `.well-known/openid-configuration` document and checks it against the
 * OIDC Discovery 1.0 spec's required/recommended metadata fields — never
 * fetches anything itself.
 */

const REQUIRED_FIELDS = [
  'issuer',
  'authorization_endpoint',
  'jwks_uri',
  'response_types_supported',
  'subject_types_supported',
  'id_token_signing_alg_values_supported',
] as const;

const RECOMMENDED_FIELDS = ['token_endpoint', 'userinfo_endpoint', 'scopes_supported', 'claims_supported'] as const;

export interface DiscoveryFinding {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
}

export type DiscoveryParseResult =
  | { readonly ok: true; readonly doc: Record<string, unknown>; readonly findings: readonly DiscoveryFinding[] }
  | { readonly ok: false; readonly error: string };

export function parseDiscoveryDocument(text: string): DiscoveryParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Paste an OIDC discovery document.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'A discovery document must be a JSON object.' };
  }

  const doc = parsed as Record<string, unknown>;
  const findings: DiscoveryFinding[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in doc)) findings.push({ severity: 'error', message: `Missing required field "${field}".` });
  }
  for (const field of RECOMMENDED_FIELDS) {
    if (!(field in doc)) findings.push({ severity: 'warning', message: `Missing recommended field "${field}".` });
  }

  if (typeof doc['issuer'] === 'string' && !doc['issuer'].startsWith('https://')) {
    findings.push({ severity: 'warning', message: '"issuer" does not use https:// — discovery documents should be served over TLS.' });
  }

  if ('code_challenge_methods_supported' in doc) {
    const methods = doc['code_challenge_methods_supported'];
    if (Array.isArray(methods) && !methods.includes('S256')) {
      findings.push({ severity: 'info', message: '"code_challenge_methods_supported" does not include S256 — PKCE clients may be limited to the weaker "plain" method.' });
    }
  } else {
    findings.push({ severity: 'info', message: 'No "code_challenge_methods_supported" field — cannot confirm PKCE support.' });
  }

  return { ok: true, doc, findings };
}

export const DISCOVERY_REQUIRED_FIELDS: readonly string[] = REQUIRED_FIELDS;
export const DISCOVERY_RECOMMENDED_FIELDS: readonly string[] = RECOMMENDED_FIELDS;
