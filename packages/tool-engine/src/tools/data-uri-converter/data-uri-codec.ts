/**
 * Pure, framework-free Data URI (RFC 2397) generate/decode helpers. Keeps its
 * own small byte<->Base64 pair rather than importing `file-base64`'s, mirroring
 * that tool's own deliberate separation from the text `base64` tool's codec.
 */

export function generateDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

export type DataUriDecodeResult =
  | { readonly ok: true; readonly mimeType: string; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: string };

const DATA_URI_PATTERN = /^data:([^;,]*)(;charset=[^;,]+)?(;base64)?,([\s\S]*)$/;

export function decodeDataUri(input: string): DataUriDecodeResult {
  const trimmed = input.trim();
  const match = trimmed.match(DATA_URI_PATTERN);
  if (!match) return { ok: false, error: 'Not a valid data URI (expected "data:<mime-type>;base64,<data>").' };

  const [, mimeType, , isBase64, payload] = match;
  const resolvedMimeType = mimeType || 'text/plain';

  try {
    if (isBase64) return { ok: true, mimeType: resolvedMimeType, bytes: base64ToBytes(payload) };
    return { ok: true, mimeType: resolvedMimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
  } catch {
    return { ok: false, error: 'Could not decode the data URI payload.' };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
