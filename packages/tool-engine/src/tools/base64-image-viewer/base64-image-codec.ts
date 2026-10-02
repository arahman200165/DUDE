import { ImageSignature, sniffImageType } from "../../shared/utils/image-signature.js";

/**
 * Pure, framework-free Base64 <-> image codec. Handles both a raw Base64
 * payload and an already-wrapped `data:image/...;base64,...` URI as input,
 * always producing a usable data URI for preview plus the detected format.
 */

export interface Base64ImageParseResult {
  readonly ok: true;
  readonly dataUri: string;
  readonly base64: string;
  readonly signature: ImageSignature;
  readonly byteLength: number;
}

export interface Base64ImageParseError {
  readonly ok: false;
  readonly error: string;
}

export type Base64ImageParseOutcome = Base64ImageParseResult | Base64ImageParseError;

const DATA_URI_PATTERN = /^data:([^;,]+);base64,(.*)$/is;

export function parseBase64Image(input: string): Base64ImageParseOutcome {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Paste a Base64 string or data URI to preview.' };

  const dataUriMatch = trimmed.match(DATA_URI_PATTERN);
  const base64 = dataUriMatch ? dataUriMatch[2].trim() : trimmed;
  const declaredMime = dataUriMatch?.[1];

  let bytes: Uint8Array;
  try {
    const binary = atob(base64.replace(/\s+/g, ''));
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return { ok: false, error: 'Invalid Base64 -- could not decode.' };
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return {
      ok: false,
      error: declaredMime
        ? `Decoded bytes don't match a recognized image signature (declared as ${declaredMime}).`
        : "Decoded bytes don't match a recognized image signature (png/jpeg/gif/webp/bmp/ico).",
    };
  }

  return {
    ok: true,
    dataUri: `data:${sniffed.mime};base64,${base64.replace(/\s+/g, '')}`,
    base64: base64.replace(/\s+/g, ''),
    signature: sniffed,
    byteLength: bytes.length,
  };
}

export function encodeBytesToBase64(bytes: Uint8Array, mime: string): { readonly dataUri: string; readonly base64: string } {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return { dataUri: `data:${mime};base64,${base64}`, base64 };
}
