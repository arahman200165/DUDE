/**
 * Pure, framework-free URL decomposition/reconstruction, built on the
 * native `URL`/`URLSearchParams` APIs (same try/catch-around-`new URL()`
 * convention already used by `curl-export-http.ts`).
 */
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export interface UrlParts {
  readonly protocol: string; // without trailing ':'
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly queryParams: readonly KeyValuePair[];
  readonly hash: string; // without leading '#'
  readonly origin: string;
}

export type ParseUrlResult = { readonly ok: true; readonly parts: UrlParts } | { readonly ok: false; readonly error: string };

export function parseUrl(raw: string): ParseUrlResult {
  if (raw.trim() === '') {
    return { ok: false, error: 'Enter a URL to inspect.' };
  }

  try {
    return { ok: true, parts: toParts(new URL(raw)) };
  } catch {
    return { ok: false, error: 'Not a valid absolute URL.' };
  }
}

export type BuildUrlResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly error: string };

export function buildUrl(parts: UrlParts): BuildUrlResult {
  if (parts.protocol.trim() === '') {
    return { ok: false, error: 'Scheme is required.' };
  }
  if (parts.hostname.trim() === '') {
    return { ok: false, error: 'Host is required.' };
  }

  try {
    const url = new URL(`${parts.protocol}://${parts.hostname}`);
    if (parts.username !== '') url.username = parts.username;
    if (parts.password !== '') url.password = parts.password;
    if (parts.port !== '') url.port = parts.port;
    url.pathname = parts.pathname === '' || parts.pathname.startsWith('/') ? parts.pathname : `/${parts.pathname}`;

    const search = new URLSearchParams();
    for (const pair of parts.queryParams) {
      if (pair.key === '') continue;
      search.append(pair.key, pair.value);
    }
    url.search = search.toString();
    url.hash = parts.hash;

    return { ok: true, url: url.toString() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not build a URL from these parts.' };
  }
}

function toParts(url: URL): UrlParts {
  return {
    protocol: url.protocol.replace(/:$/, ''),
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    queryParams: Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value })),
    hash: url.hash.replace(/^#/, ''),
    origin: url.origin,
  };
}
