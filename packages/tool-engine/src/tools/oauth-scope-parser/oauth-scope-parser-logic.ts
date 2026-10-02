/**
 * Pure, framework-free OAuth 2.0 / OIDC scope-string parsing used by the
 * OAuth Scope Parser tool. Scopes are a space-delimited string per RFC 6749
 * §3.3 — this splits, dedupes, and best-effort-annotates well-known scopes.
 */

export interface ScopeParseResult {
  readonly scopes: readonly string[];
  readonly duplicates: readonly string[];
  readonly normalized: string;
}

export function parseScopeString(input: string): ScopeParseResult {
  const tokens = input.trim().split(/\s+/).filter((token) => token !== '');
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const scopes: string[] = [];

  for (const token of tokens) {
    if (seen.has(token)) {
      duplicates.add(token);
      continue;
    }
    seen.add(token);
    scopes.push(token);
  }

  return { scopes, duplicates: [...duplicates], normalized: [...scopes].sort().join(' ') };
}

export interface AnnotatedScope {
  readonly scope: string;
  readonly known: boolean;
  readonly description?: string;
}

/** Well-known OIDC scopes (OpenID Connect Core §5.4). Informational, not authoritative. */
const KNOWN_OIDC_SCOPES: Readonly<Record<string, string>> = {
  openid: 'OIDC — requests an ID token; required to trigger OIDC behavior.',
  profile: 'OIDC — basic profile claims (name, picture, birthdate, etc).',
  email: 'OIDC — "email" and "email_verified" claims.',
  address: 'OIDC — the "address" claim.',
  phone: 'OIDC — "phone_number" and "phone_number_verified" claims.',
  offline_access: 'OIDC — requests a refresh token.',
};

export function annotateKnownScopes(scopes: readonly string[]): readonly AnnotatedScope[] {
  return scopes.map((scope) => {
    if (scope in KNOWN_OIDC_SCOPES) return { scope, known: true, description: KNOWN_OIDC_SCOPES[scope] };
    if (scope.endsWith('.default')) {
      return { scope, known: true, description: 'Vendor "default" scope — commonly used for client-credentials grants (e.g. Azure AD).' };
    }
    if (/\.(read|write)$/.test(scope)) {
      return { scope, known: true, description: 'Vendor read/write suffix convention (e.g. Google APIs, Microsoft Graph).' };
    }
    return { scope, known: false };
  });
}

export function buildScopeString(scopes: readonly string[]): string {
  return scopes.filter((scope) => scope.trim() !== '').join(' ');
}
