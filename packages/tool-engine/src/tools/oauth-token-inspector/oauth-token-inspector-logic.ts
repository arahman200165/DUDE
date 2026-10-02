/**
 * Pure, framework-free OAuth access/refresh/ID token triage used by the
 * OAuth Token Inspector tool. Auto-detects a 3-segment JWT shape and
 * delegates to the JWT Debugger's decoder; otherwise honestly reports
 * opaque-token facts rather than guessing at structure that isn't there.
 */

import { JwtDecodeResult, decodeJwt } from "../jwt/jwt-decode.js";

export type TokenInspection =
  | { readonly kind: 'jwt'; readonly decoded: JwtDecodeResult; readonly scopes: readonly string[] }
  | { readonly kind: 'opaque'; readonly length: number; readonly looksLikeUuid: boolean; readonly looksLikeBase64: boolean };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

function extractScopes(payload: unknown): readonly string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;

  if (Array.isArray(record['scp'])) {
    return (record['scp'] as unknown[]).filter((entry): entry is string => typeof entry === 'string');
  }
  const raw = typeof record['scope'] === 'string' ? record['scope'] : typeof record['scp'] === 'string' ? record['scp'] : undefined;
  return raw ? raw.split(/\s+/).filter((token) => token !== '') : [];
}

export function inspectToken(token: string): TokenInspection {
  const trimmed = token.trim();

  if (trimmed.split('.').length === 3) {
    const decoded = decodeJwt(trimmed);
    return { kind: 'jwt', decoded, scopes: decoded.ok ? extractScopes(decoded.payload) : [] };
  }

  return {
    kind: 'opaque',
    length: trimmed.length,
    looksLikeUuid: UUID_PATTERN.test(trimmed),
    looksLikeBase64: trimmed !== '' && BASE64_PATTERN.test(trimmed),
  };
}
