export interface QueryPair {
  readonly key: string;
  readonly value: string;
}

/**
 * Parses a raw query string (with or without a leading `?`, and tolerant of
 * a full URL — only the part after the first `?` is used) into an ordered
 * list of key/value pairs, preserving duplicate keys.
 */
export function parseQueryString(raw: string): readonly QueryPair[] {
  const trimmed = raw.trim();
  if (trimmed === '') return [];

  const queryPart = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed;
  const params = new URLSearchParams(queryPart.startsWith('?') ? queryPart.slice(1) : queryPart);

  return Array.from(params.entries()).map(([key, value]) => ({ key, value }));
}

/** Builds a query string (no leading `?`) from an ordered list of key/value pairs. */
export function buildQueryString(pairs: readonly QueryPair[]): string {
  const params = new URLSearchParams();
  for (const pair of pairs) {
    if (pair.key === '') continue;
    params.append(pair.key, pair.value);
  }
  return params.toString();
}
