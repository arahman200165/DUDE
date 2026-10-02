/**
 * Pure, framework-free BSON decoding used by the BSON Viewer tool. Decoded
 * documents are passed through `EJSON.serialize` so BSON-specific types
 * (ObjectId, Date, Decimal128, Binary, ...) become plain JSON-safe values
 * (`{ "$oid": "..." }`, `{ "$date": "..." }`, ...) before display, rather
 * than showing their internal representation.
 */

import { deserialize, EJSON } from 'bson';

export interface BsonDecodeError {
  readonly message: string;
}

export type BsonDecodeResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: BsonDecodeError };

export function decodeBson(bytes: Uint8Array): BsonDecodeResult {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    const document = deserialize(bytes);
    return { ok: true, value: EJSON.serialize(document) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
