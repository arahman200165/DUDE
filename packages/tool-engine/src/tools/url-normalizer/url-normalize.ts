/**
 * Pure, framework-free URL normalization/resolution/comparison, built on the native `URL` API.
 * `URL` already handles scheme/host case-folding, default-port removal, and path dot-segment
 * removal for special schemes (RFC 3986 §6.2.2/§6.2.3); the one genuinely fiddly piece it
 * doesn't do is RFC 3986 §6.2.2.2 percent-encoding normalization (uppercase hex digits, decode
 * percent-encoded unreserved octets back to their literal character), which is hand-rolled below.
 */
export interface NormalizeOptions {
  readonly sortQueryParams: boolean;
  readonly stripTrailingSlash: boolean;
  readonly stripFragment: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  sortQueryParams: false,
  stripTrailingSlash: false,
  stripFragment: false,
};

export type NormalizeResult =
  | { readonly ok: true; readonly normalized: string; readonly changed: boolean }
  | { readonly ok: false; readonly error: string };

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

function normalizePercentEncoding(input: string): string {
  return input.replace(/%[0-9A-Fa-f]{2}/g, (match) => {
    const hex = match.slice(1);
    const char = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

export function normalizeUrl(raw: string, options: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS): NormalizeResult {
  if (raw.trim() === '') {
    return { ok: false, error: 'Enter a URL to normalize.' };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Not a valid absolute URL.' };
  }

  let pathname = normalizePercentEncoding(url.pathname);
  let search = normalizePercentEncoding(url.search);
  const hash = options.stripFragment ? '' : normalizePercentEncoding(url.hash);

  if (options.sortQueryParams && search.length > 1) {
    const sorted = new URLSearchParams(search);
    const entries = Array.from(sorted.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const rebuilt = new URLSearchParams(entries);
    search = rebuilt.toString() === '' ? '' : `?${rebuilt.toString()}`;
  }

  if (options.stripTrailingSlash) {
    while (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
  }

  const cloned = new URL(url.href);
  cloned.pathname = pathname;
  cloned.search = search;
  cloned.hash = hash;

  return { ok: true, normalized: cloned.href, changed: cloned.href !== raw };
}

export type ResolveResult = { readonly ok: true; readonly resolved: string } | { readonly ok: false; readonly error: string };

export function resolveUrl(base: string, relative: string): ResolveResult {
  if (base.trim() === '') {
    return { ok: false, error: 'Enter a base URL.' };
  }

  try {
    return { ok: true, resolved: new URL(relative, base).href };
  } catch {
    return { ok: false, error: 'Could not resolve — check the base URL is absolute.' };
  }
}

export type UrlComponentName = 'scheme' | 'host' | 'port' | 'path' | 'query' | 'fragment';

export interface ComponentDiff {
  readonly component: UrlComponentName;
  readonly a: string;
  readonly b: string;
  readonly equal: boolean;
}

export type CompareResult =
  | {
      readonly ok: true;
      readonly equivalent: boolean;
      readonly normalizedA: string;
      readonly normalizedB: string;
      readonly diffs: readonly ComponentDiff[];
    }
  | { readonly ok: false; readonly error: string };

export function compareUrls(rawA: string, rawB: string, options: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS): CompareResult {
  const normA = normalizeUrl(rawA, options);
  if (!normA.ok) return { ok: false, error: `First URL: ${normA.error}` };

  const normB = normalizeUrl(rawB, options);
  if (!normB.ok) return { ok: false, error: `Second URL: ${normB.error}` };

  const urlA = new URL(normA.normalized);
  const urlB = new URL(normB.normalized);

  const diffs: ComponentDiff[] = (
    [
      ['scheme', urlA.protocol, urlB.protocol],
      ['host', urlA.hostname, urlB.hostname],
      ['port', urlA.port, urlB.port],
      ['path', urlA.pathname, urlB.pathname],
      ['query', urlA.search, urlB.search],
      ['fragment', urlA.hash, urlB.hash],
    ] as const
  ).map(([component, a, b]) => ({ component, a, b, equal: a === b }));

  return {
    ok: true,
    equivalent: normA.normalized === normB.normalized,
    normalizedA: normA.normalized,
    normalizedB: normB.normalized,
    diffs,
  };
}
