/**
 * Pure, framework-free SVG <-> `data:image/svg+xml` URI helpers. URL-encoded
 * form mirrors the common "no base64" SVG data-URI trick (smaller, and the
 * markup stays readable in CSS); base64 form is offered as the universally-
 * safe alternative. UTF-8-safe byte<->base64 pair mirrors `data-uri-codec.ts`.
 */

export interface SvgDataUriEncodeResult {
  readonly urlEncoded: string;
  readonly base64Encoded: string;
}

export function encodeSvgDataUri(svg: string): SvgDataUriEncodeResult {
  const urlSafe = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/%20/g, ' ');

  return {
    urlEncoded: `data:image/svg+xml,${urlSafe}`,
    base64Encoded: `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`,
  };
}

export type SvgDataUriDecodeResult = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly error: string };

const DATA_URI_PATTERN = /^data:image\/svg\+xml(;charset=[^;,]+)?(;base64)?,([\s\S]*)$/;

export function decodeSvgDataUri(input: string): SvgDataUriDecodeResult {
  if (input.trim() === '') return { ok: false, error: 'Enter a data URI to decode.' };

  // Match the raw input first -- the urlEncoded form deliberately leaves literal spaces
  // unescaped (see encodeSvgDataUri's %20 unescaping above), so blanket-trimming before matching
  // would silently eat meaningful leading/trailing whitespace that's actually part of the SVG
  // payload, not incidental copy-paste padding around the URI. Only fall back to a trimmed match
  // for genuinely-padded input that doesn't match as-is.
  const match = input.match(DATA_URI_PATTERN) ?? input.trim().match(DATA_URI_PATTERN);
  if (!match) return { ok: false, error: 'Not a valid "data:image/svg+xml" URI.' };

  const [, , isBase64, payload] = match;

  try {
    const svg = isBase64 ? new TextDecoder().decode(base64ToBytes(payload)) : decodeURIComponent(payload);
    return { ok: true, svg };
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
