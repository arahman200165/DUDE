import { hostCrypto } from "@dude/crypto/host";
import { v1 as uuidV1, v3 as uuidV3, v5 as uuidV5, v6 as uuidV6, v7 as uuidV7, validate as uuidValidate } from 'uuid';

export function generateUuidV4(): string {
  return hostCrypto().randomUUID();
}

export type UuidVersion = 'v1' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';

/** RFC 4122 Appendix C predefined namespaces — not exported by the `uuid` package. */
export const PREDEFINED_NAMESPACES: Record<'DNS' | 'URL' | 'OID' | 'X500', string> = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
};

export interface GenerateOptions {
  readonly namespace?: string;
  readonly name?: string;
}

export type GenerateResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export function generateUuid(version: UuidVersion, opts: GenerateOptions = {}): GenerateResult {
  if (version === 'v4') return { ok: true, value: hostCrypto().randomUUID() };
  if (version === 'v1') return { ok: true, value: uuidV1() };
  if (version === 'v6') return { ok: true, value: uuidV6() };
  if (version === 'v7') return { ok: true, value: uuidV7() };

  if (!opts.namespace || !uuidValidate(opts.namespace)) {
    return { ok: false, error: 'Enter a valid namespace UUID.' };
  }
  if (!opts.name) {
    return { ok: false, error: 'Enter a name to hash.' };
  }
  return version === 'v3'
    ? { ok: true, value: uuidV3(opts.name, opts.namespace) }
    : { ok: true, value: uuidV5(opts.name, opts.namespace) };
}

export interface UuidInspection {
  readonly valid: boolean;
  readonly version?: number;
  readonly variant?: string;
}

const UUID_PATTERN =
  /^([0-9a-f]{8})-([0-9a-f]{4})-([1-8])[0-9a-f]{3}-([89ab][0-9a-f]{3})-([0-9a-f]{12})$/i;

export function inspectUuid(value: string): UuidInspection {
  const match = UUID_PATTERN.exec(value.trim());
  if (!match) return { valid: false };

  const version = parseInt(match[3], 16);
  return { valid: true, version, variant: 'RFC 4122' };
}

const GREGORIAN_TO_UNIX_EPOCH_100NS = 122192928000000000n;

/** Decodes the 60-bit 100ns-tick timestamp embedded in a v1 UUID, or null if not a v1 UUID. */
export function decodeV1Timestamp(value: string): Date | null {
  const match = UUID_PATTERN.exec(value.trim());
  if (!match || parseInt(match[3], 16) !== 1) return null;

  const timeLow = match[1];
  const timeMid = match[2];
  const timeHiAndVersion = value.trim().split('-')[2];
  if (!timeHiAndVersion) return null;

  const timeHi = timeHiAndVersion.slice(1); // strip the version nibble
  const ticks = BigInt(`0x${timeHi}${timeMid}${timeLow}`);
  const unixMillis = Number((ticks - GREGORIAN_TO_UNIX_EPOCH_100NS) / 10000n);
  return new Date(unixMillis);
}

/** Decodes the 60-bit 100ns-tick timestamp embedded in a v6 UUID (v1's fields, reordered to sort lexicographically). */
export function decodeV6Timestamp(value: string): Date | null {
  const match = UUID_PATTERN.exec(value.trim());
  if (!match || parseInt(match[3], 16) !== 6) return null;

  const segments = value.trim().split('-');
  const timeHigh = segments[0]; // most-significant 32 bits
  const timeMid = segments[1]; // next 16 bits
  const timeLow = segments[2].slice(1); // least-significant 12 bits, after the version nibble

  const ticks = BigInt(`0x${timeHigh}${timeMid}${timeLow}`);
  const unixMillis = Number((ticks - GREGORIAN_TO_UNIX_EPOCH_100NS) / 10000n);
  return new Date(unixMillis);
}

/** Decodes the 48-bit Unix-ms timestamp embedded in the top bits of a v7 UUID — no epoch conversion needed. */
export function decodeV7Timestamp(value: string): Date | null {
  const match = UUID_PATTERN.exec(value.trim());
  if (!match || parseInt(match[3], 16) !== 7) return null;

  const hex = value.trim().replace(/-/g, '').slice(0, 12);
  return new Date(Number(BigInt(`0x${hex}`)));
}
