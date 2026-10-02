/**
 * Pure, framework-free RFC 6750 Bearer Authorization header formatting used
 * by the Bearer Token Builder tool.
 */

const B64TOKEN_PATTERN = /^[A-Za-z0-9\-._~+/]+=*$/;

export interface BearerHeaderResult {
  readonly header: string;
  readonly warnings: readonly string[];
}

export type BearerHeaderBuildResult = { readonly ok: true; readonly value: BearerHeaderResult } | { readonly ok: false; readonly error: string };

export function buildBearerHeader(rawToken: string): BearerHeaderBuildResult {
  if (rawToken.trim() === '') return { ok: false, error: 'Enter a token.' };

  // Strip an accidentally double-pasted "Bearer " prefix before trimming — trimming first
  // would eat the trailing space the prefix regex depends on for a token-less "Bearer " input.
  const withoutPrefix = rawToken.replace(/^\s*Bearer\s+/i, '').trim();
  if (withoutPrefix === '') return { ok: false, error: 'Enter a token.' };

  const warnings: string[] = [];
  if (!B64TOKEN_PATTERN.test(withoutPrefix)) {
    warnings.push('Token contains characters outside RFC 6750\'s b64token charset ([A-Za-z0-9-._~+/]=*) — some servers may reject it.');
  }

  return { ok: true, value: { header: `Bearer ${withoutPrefix}`, warnings } };
}
