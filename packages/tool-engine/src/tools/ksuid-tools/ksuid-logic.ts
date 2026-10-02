import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure, framework-free KSUID generate/inspect logic. Hand-rolled rather than
 * depending on the `ksuid` npm package, which hard-requires Node's `crypto`/`Buffer`
 * globals and has no browser build. Uses `base-x` (already a dependency, used by the
 * Base-N Encoder) for the base62 encode/decode step, and Web Crypto for randomness.
 */
import baseX from 'base-x';

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const base62 = baseX(BASE62_ALPHABET);

// KSUID's epoch starts later than Unix time so the 32-bit timestamp field covers ~136 years from 2014.
const KSUID_EPOCH_MS = 1_400_000_000_000;
const TIMESTAMP_BYTES = 4;
const PAYLOAD_BYTES = 16;
const TOTAL_BYTES = TIMESTAMP_BYTES + PAYLOAD_BYTES;
const STRING_LENGTH = 27;

function bytesToBase62(bytes: Uint8Array): string {
  return base62.encode(bytes).padStart(STRING_LENGTH, '0');
}

export function generateKsuid(timestampMs: number = Date.now()): string {
  const seconds = Math.floor((timestampMs - KSUID_EPOCH_MS) / 1000);
  const bytes = new Uint8Array(TOTAL_BYTES);
  new DataView(bytes.buffer).setUint32(0, seconds >>> 0, false);
  hostCrypto().getRandomValues(bytes.subarray(TIMESTAMP_BYTES));
  return bytesToBase62(bytes);
}

export interface KsuidInspection {
  readonly timestamp: Date;
  readonly payloadHex: string;
}

export type InspectResult = { readonly ok: true; readonly value: KsuidInspection } | { readonly ok: false; readonly error: string };

export function inspectKsuid(value: string): InspectResult {
  const trimmed = value.trim();
  if (trimmed.length !== STRING_LENGTH) {
    return { ok: false, error: `A KSUID is ${STRING_LENGTH} base62 characters.` };
  }

  let bytes: Uint8Array;
  try {
    bytes = base62.decode(trimmed);
  } catch {
    return { ok: false, error: 'Not valid base62 text.' };
  }

  if (bytes.length > TOTAL_BYTES) {
    return { ok: false, error: `Decoded to more than ${TOTAL_BYTES} bytes — not a valid KSUID.` };
  }
  const padded = new Uint8Array(TOTAL_BYTES);
  padded.set(bytes, TOTAL_BYTES - bytes.length);

  const seconds = new DataView(padded.buffer).getUint32(0, false);
  const payloadHex = Array.from(padded.subarray(TIMESTAMP_BYTES))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return { ok: true, value: { timestamp: new Date(KSUID_EPOCH_MS + seconds * 1000), payloadHex } };
}
