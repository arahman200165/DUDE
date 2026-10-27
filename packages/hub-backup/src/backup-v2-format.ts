import { BackupError } from './backup-error.js';
import { BACKUP_MAGIC, MAX_HEADER_BYTES, concatBytes, isInt, isPlainObject, u32be, type BackupSource } from './backup-format.js';

/**
 * Backup v2 (Phase 32-SS1, Milestone 846): a repository of independently verifiable, write-once objects
 * (`repo`, `packs/<id>`, `manifests/<backupId>`) plus a single-file export form. Every object starts with the
 * v1 magic and a JSON header carrying `formatVersion` 2 and `minReaderVersion` 2, so a v1 reader refuses it as
 * `unsupported-version`.
 */
export const BACKUP_V2_FORMAT_VERSION = 2;
/** Highest `minReaderVersion` the v2 reader understands (objects, manifests and export files). */
export const BACKUP_V2_READER_VERSION = 2;

export const V2_DEFAULT_CHUNK_SIZE = 1024 * 1024;
export const V2_MIN_CHUNK_SIZE = 1024;
export const V2_MAX_CHUNK_SIZE = 4 * 1024 * 1024;
export const V2_DEFAULT_PACK_BYTES = 64 * 1024 * 1024;
/** A pack's plaintext never exceeds 2^32 bytes (offsets and the chunk counter stay far inside u32/u64). */
export const V2_MAX_PACK_BYTES = 2 ** 32;
/** Chunk counter ceiling per object (the nonce carries a u64; the reader and writer stop at 2^32 - 1). */
export const V2_MAX_CHUNKS = 2 ** 32 - 1;
/** File plus blob entries in one manifest. */
export const V2_MAX_ENTRIES = 2 ** 24;
/** Named file entries (database snapshots, configuration) in one manifest; blobs are counted separately. */
export const V2_MAX_FILES = 4096;
/** Extents per entry; with the default 64 MiB packs one entry can reach about 1 TiB. */
export const V2_MAX_EXTENTS = 16384;
/** One manifest record (an NDJSON line) is bounded so the reader buffers at most this much. */
export const V2_MAX_RECORD_BYTES = 1024 * 1024;
export const V2_MAX_EXPORT_INDEX_BYTES = 16 * 1024 * 1024;
export const V2_ENTRY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const OBJECT_ID_BYTES = 16;
export const OBJECT_ID_PATTERN = /^[0-9a-f]{32}$/;
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
export const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{32}$/;
export const REPO_OBJECT_NAME = 'repo';
export const TRAILER_BYTES = 8 + 8 + 32;
/** Export footer tail: u32 index length then this magic, so a reader finds the index from the end. */
export const EXPORT_TAIL_MAGIC = new Uint8Array([0x44, 0x55, 0x44, 0x45, 0x42, 0x4b, 0x49, 0x58]); // "DUDEBKIX"
export const EXPORT_TAIL_BYTES = 4 + EXPORT_TAIL_MAGIC.length;

export function packObjectName(packId: string): string {
  return `packs/${packId}`;
}

export function manifestObjectName(backupId: string): string {
  return `manifests/${backupId}`;
}

export type V2ObjectKind = 'repo' | 'pack' | 'manifest' | 'export';

export interface RepoHeader {
  formatVersion: number;
  minReaderVersion: number;
  kind: 'repo';
  repoId: string;
  kdf: { name: 'argon2id'; m: number; t: number; p: number; len: 32; salt: string };
  cipher: 'xchacha20poly1305';
  keyCheck: string;
}

export interface ObjectHeader {
  formatVersion: number;
  minReaderVersion: number;
  kind: 'pack' | 'manifest';
  repoId: string;
  id: string;
  cipher: 'xchacha20poly1305';
  chunkSize: number;
}

export interface ExportHeader {
  formatVersion: number;
  minReaderVersion: number;
  kind: 'export';
  repoId: string;
  backupId: string;
}

/** `[packId, plaintext offset in that pack, length]`. */
export type BackupV2Extent = readonly [string, number, number];

export interface BackupV2FileEntry {
  kind: 'file';
  name: string;
  size: number;
  sha256: string;
  extents: readonly BackupV2Extent[];
}

export interface BackupV2BlobEntry {
  kind: 'blob';
  /** HMAC-SHA256(dedupe key, SHA-256 of the blob), hex: the identity a destination or index may see. */
  id: string;
  sha256: string;
  size: number;
  extents: readonly BackupV2Extent[];
}

export type BackupV2Entry = BackupV2FileEntry | BackupV2BlobEntry;

export interface BackupV2Head {
  formatVersion: number;
  minReaderVersion: number;
  backupId: string;
  repoId: string;
  createdAt: string;
  hubVersion: string;
  /** The 31G authority fields, supplied by the caller and carried verbatim. */
  source: BackupSource;
  forTransfer: boolean;
  counts: Record<string, number>;
}

export interface BackupV2PackRecord {
  id: string;
  chunks: number;
  bytes: number;
}

export interface BackupV2EndRecord {
  files: number;
  blobs: number;
  packs: number;
  bytes: number;
}

export const encoder = new TextEncoder();

export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function u64be(value: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(value / 2 ** 32), false);
  view.setUint32(4, value >>> 0, false);
  return out;
}

export function readU64be(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, false) * 2 ** 32 + view.getUint32(offset + 4, false);
}

/** Constant-time equality for equal-length byte strings (lengths are public). */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Magic, u32 length and the exact JSON bytes; `headerBytes` is the input to the object's associated-data hash. */
export function encodeHeaderObject(header: object): { prefix: Uint8Array; headerBytes: Uint8Array } {
  const headerBytes = encoder.encode(JSON.stringify(header));
  if (headerBytes.length > MAX_HEADER_BYTES) throw new BackupError('bad-input', 'The backup header is too large.');
  return { prefix: concatBytes([BACKUP_MAGIC, u32be(headerBytes.length), headerBytes]), headerBytes };
}

export function serializeRepoHeader(header: RepoHeader): { prefix: Uint8Array; headerBytes: Uint8Array } {
  const { formatVersion, minReaderVersion, kind, repoId, kdf, cipher, keyCheck } = header;
  return encodeHeaderObject({
    formatVersion,
    minReaderVersion,
    kind,
    repoId,
    kdf: { name: kdf.name, m: kdf.m, t: kdf.t, p: kdf.p, len: kdf.len, salt: kdf.salt },
    cipher,
    keyCheck,
  });
}

export function serializeObjectHeader(header: ObjectHeader): { prefix: Uint8Array; headerBytes: Uint8Array } {
  const { formatVersion, minReaderVersion, kind, repoId, id, cipher, chunkSize } = header;
  return encodeHeaderObject({ formatVersion, minReaderVersion, kind, repoId, id, cipher, chunkSize });
}

export function serializeExportHeader(header: ExportHeader): { prefix: Uint8Array; headerBytes: Uint8Array } {
  const { formatVersion, minReaderVersion, kind, repoId, backupId } = header;
  return encodeHeaderObject({ formatVersion, minReaderVersion, kind, repoId, backupId });
}

export interface ParsedPrefix {
  raw: Record<string, unknown>;
  headerBytes: Uint8Array;
  /** Bytes from the start of the object to the first frame. */
  length: number;
}

/** Checks the magic of a (possibly short) prefix: a mismatch in the bytes present is `bad-magic`, a short prefix `truncated`. */
export function checkMagic(bytes: Uint8Array): void {
  const available = Math.min(bytes.length, BACKUP_MAGIC.length);
  for (let i = 0; i < available; i++) if (bytes[i] !== BACKUP_MAGIC[i]) throw new BackupError('bad-magic', 'Not a DUDE backup file.');
  if (bytes.length < BACKUP_MAGIC.length + 4) throw new BackupError('truncated', 'The backup ends before its header.');
}

/** The header JSON length from a 12-byte prefix whose magic was checked. */
export function headerLengthOf(prefix: Uint8Array): number {
  const length = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(BACKUP_MAGIC.length, false);
  if (length === 0 || length > MAX_HEADER_BYTES) throw new BackupError('bad-header', 'The backup header length is invalid.');
  return length;
}

/**
 * Parses header JSON and applies the version gate before anything else is trusted: a header whose
 * `minReaderVersion` exceeds this reader is `unsupported-version`. `formatVersion` 1 is returned as is so the
 * caller can route a v1 file to the unchanged v1 reader.
 */
export function parseHeaderJson(headerBytes: Uint8Array): ParsedPrefix {
  const text = decodeUtf8(headerBytes);
  let raw: unknown;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  if (!isPlainObject(raw)) throw new BackupError('bad-header', 'The backup header is not valid JSON.');
  if (!isInt(raw['formatVersion'], 1, Number.MAX_SAFE_INTEGER) || !isInt(raw['minReaderVersion'], 1, Number.MAX_SAFE_INTEGER)) {
    throw new BackupError('bad-header', 'The backup header versions are invalid.');
  }
  if (raw['minReaderVersion'] > BACKUP_V2_READER_VERSION) throw new BackupError('unsupported-version', 'This backup needs a newer DUDE version to read.');
  return { raw, headerBytes, length: BACKUP_MAGIC.length + 4 + headerBytes.length };
}

/** Common v2 header checks; a `formatVersion` 1 header reaching a v2 object path is malformed, not a downgrade. */
export function checkV2Versions(raw: Record<string, unknown>, kind: V2ObjectKind): void {
  if ((raw['formatVersion'] as number) < 2 || (raw['minReaderVersion'] as number) < 2) throw new BackupError('bad-header', 'The backup header versions are invalid.');
  if (raw['kind'] !== kind) throw new BackupError('bad-header', `The backup object is not a ${kind}.`);
}

export function checkObjectHeader(raw: Record<string, unknown>, kind: 'pack' | 'manifest', repoId: string, id: string): ObjectHeader {
  checkV2Versions(raw, kind);
  if (raw['cipher'] !== 'xchacha20poly1305') throw new BackupError('unsupported-version', 'The backup uses an unsupported cipher.');
  if (raw['repoId'] !== repoId || raw['id'] !== id) throw new BackupError('integrity', 'The backup object belongs to another repository or name.');
  if (!isInt(raw['chunkSize'], V2_MIN_CHUNK_SIZE, V2_MAX_CHUNK_SIZE)) throw new BackupError('bad-header', 'The backup chunk size is out of bounds.');
  return {
    formatVersion: raw['formatVersion'] as number,
    minReaderVersion: raw['minReaderVersion'] as number,
    kind,
    repoId,
    id,
    cipher: 'xchacha20poly1305',
    chunkSize: raw['chunkSize'] as number,
  };
}

/** The 16 nonce-prefix bytes of an object: the pack id, or the random part of a backup id. */
export function objectNoncePrefix(id: string): Uint8Array {
  return hexToBytes(id.slice(-32));
}

export function backupIdFor(now: Date, random: Uint8Array): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new BackupError('bad-input', 'The backup timestamp is invalid.');
  const iso = now.toISOString();
  if (!/^\d{4}-/.test(iso)) throw new BackupError('bad-input', 'The backup timestamp is out of range.');
  const stamp = iso.slice(0, 19).replace(/[-:]/g, '') + 'Z';
  let hex = '';
  for (const byte of random) hex += (byte < 16 ? '0' : '') + byte.toString(16);
  return `${stamp}-${hex}`;
}
