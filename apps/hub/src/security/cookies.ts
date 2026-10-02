/** Name of the owner cookie session (the `__Host-` prefix requires Secure, Path=/ and no Domain). */
export const SESSION_COOKIE = '__Host-dude_session';

export interface ParsedCookies {
  values: Map<string, string>;
  /** Names that appeared more than once. */
  duplicates: Set<string>;
}

/** Tiny RFC 6265 request-header parser: `name=value; name2=value2`, optional double quotes, no decoding. */
export function parseCookies(header: string | undefined): ParsedCookies {
  const values = new Map<string, string>();
  const duplicates = new Set<string>();
  if (!header) return { values, duplicates };
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (name.length === 0) continue;
    if (values.has(name)) duplicates.add(name);
    else values.set(name, value);
  }
  return { values, duplicates };
}

const COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Strict';

/** `Set-Cookie` value for a new session; Max-Age is the absolute lifetime. */
export const sessionCookie = (token: string, maxAgeSeconds: number): string =>
  `${SESSION_COOKIE}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;

/** `Set-Cookie` value that clears the session cookie (sign-out). */
export const clearedSessionCookie = (): string => `${SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
