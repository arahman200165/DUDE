/**
 * Pure, framework-free RFC 7617 HTTP Basic Authentication header
 * encode/decode used by the Basic Auth Header Generator tool.
 *
 * Basic auth uses standard (non-URL-safe) Base64 — unlike every other tool
 * in this batch, which reaches for `jose`'s base64url by default, this one
 * must use `btoa`/`atob` directly.
 */

export type BasicAuthResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function buildBasicAuthHeader(username: string, password: string): BasicAuthResult {
  if (username === '') return { ok: false, error: 'Enter a username.' };
  if (username.includes(':')) return { ok: false, error: 'Username must not contain a colon (RFC 7617 §2).' };

  try {
    return { ok: true, value: `Basic ${utf8ToBase64(`${username}:${password}`)}` };
  } catch {
    return { ok: false, error: 'Could not encode these credentials.' };
  }
}

export interface BasicAuthCredentials {
  readonly username: string;
  readonly password: string;
}

export function decodeBasicAuthHeader(header: string): { readonly ok: true; readonly value: BasicAuthCredentials } | { readonly ok: false; readonly error: string } {
  const trimmed = header.trim();
  const match = /^Basic\s+(.+)$/i.exec(trimmed);
  const encoded = match ? match[1] : trimmed;
  if (encoded === '') return { ok: false, error: 'Paste a Basic auth header or its Base64 payload.' };

  let decoded: string;
  try {
    decoded = base64ToUtf8(encoded);
  } catch {
    return { ok: false, error: 'Invalid Base64 payload.' };
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return { ok: false, error: 'Decoded value is not in "username:password" form.' };

  return { ok: true, value: { username: decoded.slice(0, separatorIndex), password: decoded.slice(separatorIndex + 1) } };
}
