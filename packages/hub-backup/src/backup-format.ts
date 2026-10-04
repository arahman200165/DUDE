import { sha256 } from '@noble/hashes/sha2.js';
import { BackupError } from './backup-error.js';

export const BACKUP_MAGIC = new Uint8Array([0x44, 0x55, 0x44, 0x45, 0x42, 0x4b, 0x55, 0x50]); // "DUDEBKUP"
export const BACKUP_FORMAT_VERSION = 1;
/** Highest `minReaderVersion` this build can read. */
export const BACKUP_READER_VERSION = 1;
export const MAX_BACKUP_PLAINTEXT_BYTES = 512 * 1024 * 1024;
export const MAX_BACKUP_FILES = 32;
export const BACKUP_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const SALT_BYTES = 16;
export const STREAM_ID_BYTES = 16;
export const NONCE_BYTES = 24;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
export const CHUNK_SIZE = 65536;
export const MIN_CHUNK_SIZE = 1024;
export const MAX_CHUNK_SIZE = 1024 * 1024;
export const MAX_HEADER_BYTES = 4096;
export const MAX_MANIFEST_BYTES = 1024 * 1024;

export type KdfParams = { m: number; t: number; p: number; len: 32 };

export const DEFAULT_KDF_PARAMS: KdfParams = Object.freeze({ m: 65536, t: 3, p: 1, len: 32 }) as KdfParams;

export interface BackupHeader {
  formatVersion: number;
  minReaderVersion: number;
  kdf: KdfParams & { name: 'argon2id'; salt: string };
  cipher: 'xchacha20poly1305';
  chunkSize: number;
  streamId: string;
}

export interface BackupSource {
  hubInstanceId: string;
  authorityEpoch: number;
  schemaVersion: number;
  dbMinReaderVersion: number;
}

export interface BackupManifestFile {
  name: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  formatVersion: number;
  minReaderVersion: number;
  createdAt: string;
  hubVersion: string;
  source: BackupSource;
  forTransfer: boolean;
  files: BackupManifestFile[];
  counts: Record<string, number>;
}

export function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validFileName(name: unknown): name is string {
  return typeof name === 'string' && BACKUP_FILE_NAME_PATTERN.test(name);
}

/** Bounds on KDF cost so a hostile file cannot make the reader allocate gigabytes. */
export function kdfParamsInBounds(params: { m: unknown; t: unknown; p: unknown; len: unknown }): boolean {
  return isInt(params.m, 8192, 1048576) && isInt(params.t, 1, 10) && isInt(params.p, 1, 16) && params.len === KEY_BYTES;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_LOOKUP: Record<string, number> = Object.fromEntries([...B64URL].map((c, i) => [c, i]));

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[n & 63];
  }
  return out;
}

/** Strict unpadded base64url decode to exactly `length` bytes, or null. */
export function fromBase64Url(text: unknown, length: number): Uint8Array | null {
  if (typeof text !== 'string' || text.length !== Math.ceil((length * 4) / 3) || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const out = new Uint8Array(length);
  let bits = 0;
  let acc = 0;
  let index = 0;
  for (const char of text) {
    acc = (acc << 6) | B64URL_LOOKUP[char];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (acc >> bits) & 255;
      acc &= (1 << bits) - 1;
    }
  }
  // Unused trailing bits must be zero so the encoding is canonical.
  return acc === 0 && index === length ? out : null;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += (byte < 16 ? '0' : '') + byte.toString(16);
  return out;
}

export function sha256Hex(bytes: Uint8Array): string {
  return toHex(sha256(bytes));
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

/** UTF-8 bytes of the NFKC-normalized passphrase; the caller zeroes them. */
export function normalizePassphrase(passphrase: unknown): Uint8Array {
  if (typeof passphrase !== 'string') throw new BackupError('bad-input', 'The passphrase must be a string.');
  const normalized = passphrase.normalize('NFKC');
  if (normalized.length === 0) throw new BackupError('bad-input', 'The passphrase must not be empty.');
  return new TextEncoder().encode(normalized);
}

export function serializeHeader(header: BackupHeader): Uint8Array {
  const { formatVersion, minReaderVersion, kdf, cipher, chunkSize, streamId } = header;
  const json = JSON.stringify({
    formatVersion,
    minReaderVersion,
    kdf: { name: kdf.name, m: kdf.m, t: kdf.t, p: kdf.p, len: kdf.len, salt: kdf.salt },
    cipher,
    chunkSize,
    streamId,
  });
  const body = new TextEncoder().encode(json);
  return concatBytes([BACKUP_MAGIC, u32be(body.length), body]);
}

export interface ParsedHeader {
  header: BackupHeader;
  /** The exact header JSON bytes (the input to the associated-data hash). */
  headerBytes: Uint8Array;
  /** Offset of the first chunk. */
  bodyOffset: number;
}

/** Validates magic, versions and bounds without any key material; never allocates based on untrusted sizes. */
export function parseHeader(bytes: Uint8Array): ParsedHeader {
  if (!(bytes instanceof Uint8Array)) throw new BackupError('bad-input', 'The backup must be a Uint8Array.');
  const available = Math.min(bytes.length, BACKUP_MAGIC.length);
  for (let i = 0; i < available; i++) if (bytes[i] !== BACKUP_MAGIC[i]) throw new BackupError('bad-magic', 'Not a DUDE backup file.');
  if (bytes.length < BACKUP_MAGIC.length + 4) throw new BackupError('truncated', 'The backup file ends before its header.');
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(BACKUP_MAGIC.length, false);
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) throw new BackupError('bad-header', 'The backup header length is invalid.');
  const bodyOffset = BACKUP_MAGIC.length + 4 + headerLength;
  if (bytes.length < bodyOffset) throw new BackupError('truncated', 'The backup file ends inside its header.');
  const headerBytes = bytes.subarray(BACKUP_MAGIC.length + 4, bodyOffset);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(headerBytes));
  } catch {
    throw new BackupError('bad-header', 'The backup header is not valid JSON.');
  }
  if (!isPlainObject(raw)) throw new BackupError('bad-header', 'The backup header is malformed.');
  // Version gating comes first: a newer file must be refused before anything else is trusted or derived.
  if (!isInt(raw['minReaderVersion'], 1, Number.MAX_SAFE_INTEGER) || !isInt(raw['formatVersion'], 1, Number.MAX_SAFE_INTEGER)) {
    throw new BackupError('bad-header', 'The backup header versions are invalid.');
  }
  if (raw['minReaderVersion'] > BACKUP_READER_VERSION) throw new BackupError('unsupported-version', 'This backup needs a newer DUDE version to read.');
  const kdf = raw['kdf'];
  if (!isPlainObject(kdf)) throw new BackupError('bad-header', 'The backup header KDF is malformed.');
  if (kdf['name'] !== 'argon2id' || raw['cipher'] !== 'xchacha20poly1305') {
    throw new BackupError('unsupported-version', 'The backup uses an unsupported key derivation or cipher.');
  }
  if (!kdfParamsInBounds({ m: kdf['m'], t: kdf['t'], p: kdf['p'], len: kdf['len'] })) {
    throw new BackupError('bad-header', 'The backup key derivation parameters are out of bounds.');
  }
  if (!isInt(raw['chunkSize'], MIN_CHUNK_SIZE, MAX_CHUNK_SIZE)) throw new BackupError('bad-header', 'The backup chunk size is out of bounds.');
  if (fromBase64Url(kdf['salt'], SALT_BYTES) === null || fromBase64Url(raw['streamId'], STREAM_ID_BYTES) === null) {
    throw new BackupError('bad-header', 'The backup salt or stream id is malformed.');
  }
  const header: BackupHeader = {
    formatVersion: raw['formatVersion'] as number,
    minReaderVersion: raw['minReaderVersion'] as number,
    kdf: {
      name: 'argon2id',
      m: kdf['m'] as number,
      t: kdf['t'] as number,
      p: kdf['p'] as number,
      len: 32,
      salt: kdf['salt'] as string,
    },
    cipher: 'xchacha20poly1305',
    chunkSize: raw['chunkSize'] as number,
    streamId: raw['streamId'] as string,
  };
  return { header, headerBytes, bodyOffset };
}
