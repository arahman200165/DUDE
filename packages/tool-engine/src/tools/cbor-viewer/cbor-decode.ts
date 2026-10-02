/**
 * Pure, framework-free CBOR decoding used by the CBOR Viewer tool.
 */

import { decode } from 'cbor-x';

export interface CborDecodeError {
  readonly message: string;
}

export type CborDecodeResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: CborDecodeError };

export function decodeCbor(bytes: Uint8Array): CborDecodeResult {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    return { ok: true, value: decode(bytes) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
