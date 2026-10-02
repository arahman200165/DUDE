/**
 * Pure, framework-free parse/build for the `Cache-Control:` header (RFC 9111 §5.2) — a
 * comma-separated list of directives, some boolean flags (`no-store`), some with a numeric
 * seconds value (`max-age=<seconds>`). Request and response contexts use overlapping but
 * distinct directive sets, so the UI drives its checkbox list off `directivesFor(context)`.
 */
export type CacheControlContext = 'request' | 'response';

export interface CacheControlDirectiveDef {
  readonly name: string;
  readonly hasValue: boolean;
}

const RESPONSE_DIRECTIVES: readonly CacheControlDirectiveDef[] = [
  { name: 'public', hasValue: false },
  { name: 'private', hasValue: false },
  { name: 'no-cache', hasValue: false },
  { name: 'no-store', hasValue: false },
  { name: 'max-age', hasValue: true },
  { name: 's-maxage', hasValue: true },
  { name: 'must-revalidate', hasValue: false },
  { name: 'proxy-revalidate', hasValue: false },
  { name: 'immutable', hasValue: false },
  { name: 'no-transform', hasValue: false },
  { name: 'stale-while-revalidate', hasValue: true },
  { name: 'stale-if-error', hasValue: true },
];

const REQUEST_DIRECTIVES: readonly CacheControlDirectiveDef[] = [
  { name: 'no-cache', hasValue: false },
  { name: 'no-store', hasValue: false },
  { name: 'max-age', hasValue: true },
  { name: 'max-stale', hasValue: true },
  { name: 'min-fresh', hasValue: true },
  { name: 'no-transform', hasValue: false },
  { name: 'only-if-cached', hasValue: false },
];

export function directivesFor(context: CacheControlContext): readonly CacheControlDirectiveDef[] {
  return context === 'request' ? REQUEST_DIRECTIVES : RESPONSE_DIRECTIVES;
}

export interface CacheControlEntry {
  readonly name: string;
  readonly value: string | null; // null = boolean flag present with no value
}

export function parseCacheControl(raw: string): readonly CacheControlEntry[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const equalsIndex = part.indexOf('=');
      if (equalsIndex === -1) return { name: part.toLowerCase(), value: null };
      return { name: part.slice(0, equalsIndex).trim().toLowerCase(), value: part.slice(equalsIndex + 1).trim() };
    });
}

export function buildCacheControl(entries: readonly CacheControlEntry[]): string {
  return entries
    .filter((entry) => entry.name !== '')
    .map((entry) => (entry.value !== null ? `${entry.name}=${entry.value}` : entry.name))
    .join(', ');
}

/** Signals worth flagging (contradictory or ineffective directive combinations). */
export function checkCacheControlWarnings(entries: readonly CacheControlEntry[]): readonly string[] {
  const names = new Set(entries.map((e) => e.name));
  const warnings: string[] = [];

  if (names.has('no-store') && (names.has('max-age') || names.has('public') || names.has('private'))) {
    warnings.push('no-store overrides every other freshness/caching directive — they will be ignored.');
  }
  if (names.has('public') && names.has('private')) {
    warnings.push('public and private are contradictory — only one should be set.');
  }
  if (names.has('immutable') && names.has('no-cache')) {
    warnings.push('immutable and no-cache are contradictory — immutable tells caches to skip revalidation entirely.');
  }

  return warnings;
}
