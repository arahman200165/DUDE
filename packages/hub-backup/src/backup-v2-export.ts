import { BackupError } from './backup-error.js';
import {
  BACKUP_MAGIC,
  MAX_BACKUP_PLAINTEXT_BYTES,
  MAX_HEADER_BYTES,
  MIN_CHUNK_SIZE,
  TAG_BYTES,
  concatBytes,
  isInt,
  isPlainObject,
  u32be,
} from './backup-format.js';
import {
  BACKUP_ID_PATTERN,
  BACKUP_V2_FORMAT_VERSION,
  BACKUP_V2_READER_VERSION,
  EXPORT_TAIL_BYTES,
  EXPORT_TAIL_MAGIC,
  OBJECT_ID_PATTERN,
  REPO_OBJECT_NAME,
  V2_MAX_EXPORT_INDEX_BYTES,
  checkMagic,
  checkV2Versions,
  decodeUtf8,
  encoder,
  equalBytes,
  headerLengthOf,
  manifestObjectName,
  packObjectName,
  parseHeaderJson,
  serializeExportHeader,
} from './backup-v2-format.js';
import { openBackupV2, type BackupV2Reader, type BackupV2VerifyOptions, type BackupV2VerifyReport } from './backup-v2-reader.js';
import type { BackupV2Credential } from './backup-v2-repo.js';
import { ByteReader, type ObjectSource, type ObjectWriteStream } from './backup-v2-stream.js';
import { openBackup, type BackupDeps, type DerivedBackupKey, type OpenedBackup } from './backup.js';

/** A random-access byte source for one file (a local `.dudebackup`, a downloaded transfer file). */
export interface ByteSource {
  readonly size: number;
  /** Streams bytes `[start, end)`. */
  read(start: number, end: number): AsyncIterable<Uint8Array>;
}

export interface ExportIndexEntry {
  name: string;
  offset: number;
  length: number;
}

/** Largest v1 file the dispatcher loads whole (the v1 reader's own 512 MiB plaintext ceiling plus framing). */
export const V1_MAX_FILE_BYTES =
  BACKUP_MAGIC.length + 4 + MAX_HEADER_BYTES + MAX_BACKUP_PLAINTEXT_BYTES + Math.ceil(MAX_BACKUP_PLAINTEXT_BYTES / MIN_CHUNK_SIZE) * (4 + TAG_BYTES);

function canonicalIndex(objects: ExportIndexEntry[]): Uint8Array {
  return encoder.encode(JSON.stringify({ objects: objects.map(({ name, offset, length }) => ({ name, offset, length })) }));
}

/**
 * Writes backup `reader` as one `.dudebackup` v2 file into `out`: an export header, then the `repo` object, the
 * manifest and every pack it references (earlier backups' packs included) copied byte for byte, then a JSON
 * index of their offsets and a 12-byte tail (u32 index length, `DUDEBKIX`). Nothing is decrypted or buffered
 * beyond one source piece. `out` is not committed: the caller commits after verifying the result.
 */
export async function writeBackupExport(reader: BackupV2Reader, out: ObjectWriteStream): Promise<{ bytes: number; objects: ExportIndexEntry[] }> {
  const names = [REPO_OBJECT_NAME, reader.manifestName, ...(await reader.referencedPacks()).map(packObjectName)];
  const { prefix } = serializeExportHeader({
    formatVersion: BACKUP_V2_FORMAT_VERSION,
    minReaderVersion: BACKUP_V2_READER_VERSION,
    kind: 'export',
    repoId: reader.repository.repoId,
    backupId: reader.backupId,
  });
  await out.write(prefix);
  let position = prefix.length;
  const objects: ExportIndexEntry[] = [];
  for (const name of names) {
    const offset = position;
    for await (const piece of reader.source.read(name)) {
      if (!(piece instanceof Uint8Array)) throw new BackupError('bad-input', 'A backup source yielded something other than bytes.');
      await out.write(piece);
      position += piece.length;
    }
    objects.push({ name, offset, length: position - offset });
  }
  const index = canonicalIndex(objects);
  if (index.length > V2_MAX_EXPORT_INDEX_BYTES) throw new BackupError('too-large', 'The backup has too many packs for one file.');
  await out.write(concatBytes([index, u32be(index.length), EXPORT_TAIL_MAGIC]));
  return { bytes: position + index.length + EXPORT_TAIL_BYTES, objects };
}

async function readSpan(file: ByteSource, start: number, end: number): Promise<Uint8Array> {
  const reader = new ByteReader(file.read(start, end));
  try {
    const bytes = await reader.readExact(end - start);
    if (bytes === null) throw new BackupError('truncated', 'The backup file is shorter than it claims.');
    return bytes;
  } finally {
    await reader.close();
  }
}

function parseIndex(bytes: Uint8Array, firstOffset: number, endOffset: number, backupId: string): ExportIndexEntry[] {
  const bad = (): never => {
    throw new BackupError('integrity', 'The backup file index is malformed.');
  };
  const text = decodeUtf8(bytes);
  let raw: unknown;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  if (!isPlainObject(raw) || !Array.isArray(raw['objects']) || raw['objects'].length < 2) return bad();
  const objects: ExportIndexEntry[] = [];
  const names = new Set<string>();
  let expected = firstOffset;
  for (const [position, entry] of (raw['objects'] as unknown[]).entries()) {
    if (!isPlainObject(entry) || typeof entry['name'] !== 'string' || !isInt(entry['offset'], 0, Number.MAX_SAFE_INTEGER) || !isInt(entry['length'], 1, Number.MAX_SAFE_INTEGER)) return bad();
    const name = entry['name'];
    const wanted = position === 0 ? name === REPO_OBJECT_NAME : position === 1 ? name === manifestObjectName(backupId) : /^packs\/[0-9a-f]{32}$/.test(name);
    if (!wanted || names.has(name) || entry['offset'] !== expected) return bad();
    names.add(name);
    expected += entry['length'];
    objects.push({ name, offset: entry['offset'], length: entry['length'] });
  }
  if (expected !== endOffset || !equalBytes(canonicalIndex(objects), bytes)) return bad();
  return objects;
}

export type BackupFileCredential = BackupV2Credential | { derived: DerivedBackupKey };

export type OpenedBackupFile = { formatVersion: 1; backup: OpenedBackup } | { formatVersion: 2; reader: BackupV2Reader };

/**
 * Opens a `.dudebackup` file of either version. A v1 file goes, unchanged and whole, to the v1 reader (within
 * its own 512 MiB ceiling). A v2 export is opened as an object source over its index; its `verify` also checks
 * that the file holds exactly the packs the manifest references.
 */
export async function openBackupFile(file: ByteSource, credential: BackupFileCredential, deps: BackupDeps): Promise<OpenedBackupFile> {
  if (!isPlainObject(file) || !isInt(file.size, 0, Number.MAX_SAFE_INTEGER) || typeof file.read !== 'function') throw new BackupError('bad-input', 'The backup file source is invalid.');
  const prefix = await readSpan(file, 0, Math.min(file.size, BACKUP_MAGIC.length + 4));
  checkMagic(prefix);
  const headerLength = headerLengthOf(prefix);
  const bodyOffset = BACKUP_MAGIC.length + 4 + headerLength;
  if (file.size < bodyOffset) throw new BackupError('truncated', 'The backup file ends inside its header.');
  const { raw, headerBytes } = parseHeaderJson(await readSpan(file, BACKUP_MAGIC.length + 4, bodyOffset));

  if (raw['formatVersion'] === 1 && raw['minReaderVersion'] === 1) {
    if (file.size > V1_MAX_FILE_BYTES) throw new BackupError('too-large', 'The backup is too large.');
    if (isPlainObject(credential) && 'masterKey' in credential) throw new BackupError('bad-input', 'A version 1 backup needs its passphrase.');
    const bytes = await readSpan(file, 0, file.size);
    return { formatVersion: 1, backup: await openBackup(bytes, credential as { passphrase: string } | { derived: DerivedBackupKey }, deps) };
  }

  checkV2Versions(raw, 'export');
  const repoId = raw['repoId'];
  const backupId = raw['backupId'];
  if (typeof repoId !== 'string' || !OBJECT_ID_PATTERN.test(repoId) || typeof backupId !== 'string' || !BACKUP_ID_PATTERN.test(backupId)) {
    throw new BackupError('bad-header', 'The backup file header is malformed.');
  }
  // The export header is not under a key; any change to it must still be caught, so it must be canonical.
  const canonical = serializeExportHeader({
    formatVersion: raw['formatVersion'] as number,
    minReaderVersion: raw['minReaderVersion'] as number,
    kind: 'export',
    repoId,
    backupId,
  }).headerBytes;
  if (!equalBytes(canonical, headerBytes)) throw new BackupError('bad-header', 'The backup file header is not canonical.');

  if (file.size < bodyOffset + EXPORT_TAIL_BYTES) throw new BackupError('truncated', 'The backup file has no index.');
  const tail = await readSpan(file, file.size - EXPORT_TAIL_BYTES, file.size);
  if (!equalBytes(tail.subarray(4), EXPORT_TAIL_MAGIC)) throw new BackupError('truncated', 'The backup file has no index (it may be cut off).');
  const indexLength = new DataView(tail.buffer, tail.byteOffset, 4).getUint32(0, false);
  const indexStart = file.size - EXPORT_TAIL_BYTES - indexLength;
  if (indexLength === 0 || indexLength > V2_MAX_EXPORT_INDEX_BYTES || indexStart < bodyOffset) throw new BackupError('integrity', 'The backup file index is malformed.');
  const objects = parseIndex(await readSpan(file, indexStart, indexStart + indexLength), bodyOffset, indexStart, backupId);
  const byName = new Map(objects.map(entry => [entry.name, entry]));

  const source: ObjectSource = {
    read(name: string, start = 0): AsyncIterable<Uint8Array> {
      const entry = byName.get(name);
      if (!entry) throw new BackupError('integrity', 'The backup file is missing an object.');
      if (!isInt(start, 0, entry.length)) throw new BackupError('integrity', 'A backup read is out of range.');
      return file.read(entry.offset + start, entry.offset + entry.length);
    },
  };
  const reader = await openBackupV2(source, backupId, credential as BackupV2Credential, deps);
  // Every export header field is bound to authenticated data: the ids to the repository and manifest, the
  // versions to the manifest head.
  if (reader.repository.repoId !== repoId || reader.head.formatVersion !== raw['formatVersion'] || reader.head.minReaderVersion !== raw['minReaderVersion']) {
    reader.close();
    throw new BackupError('integrity', 'The backup file header does not match its contents.');
  }
  const verifyObjects = reader.verify.bind(reader) as (options?: BackupV2VerifyOptions) => Promise<BackupV2VerifyReport>;
  reader.verify = async (options?: BackupV2VerifyOptions): Promise<BackupV2VerifyReport> => {
    const report = await verifyObjects(options);
    const referenced = new Set((await reader.referencedPacks()).map(packObjectName));
    const held = objects.slice(2).map(entry => entry.name);
    if (held.length !== referenced.size || held.some(name => !referenced.has(name))) throw new BackupError('integrity', 'The backup file does not hold exactly the packs its manifest references.');
    return report;
  };
  return { formatVersion: 2, reader };
}
