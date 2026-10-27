import { BackupError } from './backup-error.js';
import { concatBytes, isInt, isPlainObject, type BackupSource } from './backup-format.js';
import {
  BACKUP_ID_PATTERN,
  BACKUP_V2_READER_VERSION,
  OBJECT_ID_PATTERN,
  SHA256_HEX_PATTERN,
  V2_ENTRY_NAME_PATTERN,
  V2_MAX_EXTENTS,
  V2_MAX_PACK_BYTES,
  V2_MAX_RECORD_BYTES,
  decodeUtf8,
  encoder,
  type BackupV2BlobEntry,
  type BackupV2EndRecord,
  type BackupV2Extent,
  type BackupV2FileEntry,
  type BackupV2Head,
  type BackupV2PackRecord,
} from './backup-v2-format.js';

/**
 * The manifest plaintext is NDJSON: a `head` record, then `file`, `blob` and `pack` records in any order, then
 * one `end` record. Records are at most `V2_MAX_RECORD_BYTES`, so a reader holds one line at a time.
 *
 * Compatibility rule: a reader ignores unknown fields and unknown record types. A writer may therefore add an
 * optional field or record without raising `minReaderVersion` only when an older reader that skips it still
 * restores correctly; anything an older reader must understand raises `minReaderVersion` in the head (and in
 * the object headers), which an older reader refuses as `unsupported-version`.
 */
export type ManifestItem =
  | { t: 'head'; head: BackupV2Head }
  | { t: 'file'; entry: BackupV2FileEntry }
  | { t: 'blob'; entry: BackupV2BlobEntry }
  | { t: 'pack'; pack: BackupV2PackRecord }
  | { t: 'end'; end: BackupV2EndRecord };

export function encodeRecord(record: object): Uint8Array {
  const bytes = encoder.encode(JSON.stringify(record) + '\n');
  if (bytes.length - 1 > V2_MAX_RECORD_BYTES) throw new BackupError('too-large', 'A backup manifest record is too large.');
  return bytes;
}

export function checkSourceV2(source: unknown): BackupSource | null {
  if (
    !isPlainObject(source) ||
    typeof source['hubInstanceId'] !== 'string' ||
    !isInt(source['authorityEpoch'], 0, Number.MAX_SAFE_INTEGER) ||
    !isInt(source['schemaVersion'], 0, Number.MAX_SAFE_INTEGER) ||
    !isInt(source['dbMinReaderVersion'], 0, Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }
  return {
    hubInstanceId: source['hubInstanceId'],
    authorityEpoch: source['authorityEpoch'],
    schemaVersion: source['schemaVersion'],
    dbMinReaderVersion: source['dbMinReaderVersion'],
  };
}

export function checkCountsV2(counts: unknown): Record<string, number> | null {
  if (!isPlainObject(counts)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out;
}

export function checkExtents(raw: unknown, size: unknown): BackupV2Extent[] | null {
  if (!Array.isArray(raw) || raw.length > V2_MAX_EXTENTS || !isInt(size, 0, Number.MAX_SAFE_INTEGER)) return null;
  const extents: BackupV2Extent[] = [];
  let total = 0;
  for (const extent of raw) {
    if (!Array.isArray(extent) || extent.length !== 3) return null;
    const [packId, offset, length] = extent as unknown[];
    if (typeof packId !== 'string' || !OBJECT_ID_PATTERN.test(packId) || !isInt(offset, 0, V2_MAX_PACK_BYTES - 1) || !isInt(length, 1, V2_MAX_PACK_BYTES)) return null;
    if (offset + length > V2_MAX_PACK_BYTES) return null;
    total += length;
    extents.push(Object.freeze([packId, offset, length]) as BackupV2Extent);
  }
  return total === size ? extents : null;
}

export function checkFileEntry(raw: Record<string, unknown>): BackupV2FileEntry | null {
  const { name, size, sha256 } = raw;
  if (typeof name !== 'string' || !V2_ENTRY_NAME_PATTERN.test(name) || typeof sha256 !== 'string' || !SHA256_HEX_PATTERN.test(sha256)) return null;
  const extents = checkExtents(raw['extents'], size);
  return extents ? { kind: 'file', name, size: size as number, sha256, extents } : null;
}

export function checkBlobEntry(raw: Record<string, unknown>): BackupV2BlobEntry | null {
  const { id, size, sha256 } = raw;
  if (typeof id !== 'string' || !SHA256_HEX_PATTERN.test(id) || typeof sha256 !== 'string' || !SHA256_HEX_PATTERN.test(sha256)) return null;
  const extents = checkExtents(raw['extents'], size);
  return extents ? { kind: 'blob', id, sha256, size: size as number, extents } : null;
}

const bad = (): never => {
  throw new BackupError('integrity', 'The backup manifest is malformed.');
};

/** Validates one parsed record; returns null for an unknown record type (ignored by rule). */
export function parseRecord(raw: unknown): ManifestItem | null {
  if (!isPlainObject(raw) || typeof raw['t'] !== 'string') return bad();
  switch (raw['t']) {
    case 'head': {
      if (!isInt(raw['formatVersion'], 2, Number.MAX_SAFE_INTEGER) || !isInt(raw['minReaderVersion'], 2, Number.MAX_SAFE_INTEGER)) return bad();
      if (raw['minReaderVersion'] > BACKUP_V2_READER_VERSION) throw new BackupError('unsupported-version', 'This backup needs a newer DUDE version to read.');
      const source = checkSourceV2(raw['source']);
      const counts = checkCountsV2(raw['counts']);
      const { backupId, repoId, createdAt, hubVersion, forTransfer } = raw;
      if (!source || !counts || typeof backupId !== 'string' || !BACKUP_ID_PATTERN.test(backupId) || typeof repoId !== 'string' || !OBJECT_ID_PATTERN.test(repoId)) return bad();
      if (typeof createdAt !== 'string' || typeof hubVersion !== 'string' || typeof forTransfer !== 'boolean') return bad();
      return {
        t: 'head',
        head: {
          formatVersion: raw['formatVersion'] as number,
          minReaderVersion: raw['minReaderVersion'] as number,
          backupId,
          repoId,
          createdAt,
          hubVersion,
          source,
          forTransfer,
          counts,
        },
      };
    }
    case 'file':
      return { t: 'file', entry: checkFileEntry(raw) ?? bad() };
    case 'blob':
      return { t: 'blob', entry: checkBlobEntry(raw) ?? bad() };
    case 'pack': {
      const { id, chunks, bytes } = raw;
      if (typeof id !== 'string' || !OBJECT_ID_PATTERN.test(id) || !isInt(chunks, 1, 2 ** 32 - 1) || !isInt(bytes, 1, V2_MAX_PACK_BYTES)) return bad();
      return { t: 'pack', pack: { id, chunks, bytes } };
    }
    case 'end': {
      const { files, blobs, packs, bytes } = raw;
      for (const value of [files, blobs, packs, bytes]) if (!isInt(value, 0, Number.MAX_SAFE_INTEGER)) return bad();
      return { t: 'end', end: { files: files as number, blobs: blobs as number, packs: packs as number, bytes: bytes as number } };
    }
    default:
      return null;
  }
}

/** Splits a byte stream into NDJSON lines, never buffering more than one bounded record. */
export class LineSplitter {
  private parts: Uint8Array[] = [];
  private length = 0;

  *push(chunk: Uint8Array): Generator<unknown> {
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(10, start);
      if (newline === -1) break;
      yield this.take(chunk.subarray(start, newline));
      start = newline + 1;
    }
    if (start < chunk.length) this.append(chunk.subarray(start));
  }

  private append(piece: Uint8Array): void {
    this.length += piece.length;
    if (this.length > V2_MAX_RECORD_BYTES) bad();
    this.parts.push(piece.slice());
  }

  private take(last: Uint8Array): unknown {
    this.append(last);
    const text = decodeUtf8(concatBytes(this.parts));
    this.parts = [];
    this.length = 0;
    if (text === null) return bad();
    try {
      return JSON.parse(text);
    } catch {
      return bad();
    }
  }

  /** A manifest ends with a newline; leftover bytes mean a malformed (never truncated: the trailer checked) stream. */
  finish(): void {
    if (this.length !== 0) bad();
  }
}
