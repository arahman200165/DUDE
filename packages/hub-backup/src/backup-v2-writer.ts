import { sha256 } from '@noble/hashes/sha2.js';
import { BackupError } from './backup-error.js';
import { isInt, isPlainObject, toHex, type BackupSource, type KdfParams } from './backup-format.js';
import {
  BACKUP_V2_FORMAT_VERSION,
  BACKUP_V2_READER_VERSION,
  OBJECT_ID_BYTES,
  REPO_OBJECT_NAME,
  SHA256_HEX_PATTERN,
  V2_DEFAULT_CHUNK_SIZE,
  V2_DEFAULT_PACK_BYTES,
  V2_ENTRY_NAME_PATTERN,
  V2_MAX_CHUNK_SIZE,
  V2_MAX_ENTRIES,
  V2_MAX_EXTENTS,
  V2_MAX_FILES,
  V2_MAX_PACK_BYTES,
  V2_MIN_CHUNK_SIZE,
  backupIdFor,
  manifestObjectName,
  objectNoncePrefix,
  packObjectName,
  serializeObjectHeader,
  type BackupV2BlobEntry,
  type BackupV2Extent,
  type BackupV2FileEntry,
} from './backup-v2-format.js';
import { checkBlobEntry, checkCountsV2, checkSourceV2, encodeRecord } from './backup-v2-manifest.js';
import { createRepository, repositoryKeys, type BackupRepository } from './backup-v2-repo.js';
import { SealedWriter, headerHashOf, objectKey, type ObjectSink } from './backup-v2-stream.js';
import type { BackupDeps } from './backup.js';

export interface BackupV2Metadata {
  hubVersion: string;
  /** The 31G authority fields (instance id, epoch, schema and database reader versions), carried verbatim. */
  source: BackupSource;
  forTransfer: boolean;
  counts?: Record<string, number>;
}

export type BackupWriterOptions = {
  sink: ObjectSink;
  deps: BackupDeps;
  metadata: BackupV2Metadata;
  /** Plaintext bytes per encrypted chunk (default 1 MiB). */
  chunkSize?: number;
  /** A pack is closed once its plaintext reaches this size (default 64 MiB). */
  packBytes?: number;
} & (
  | { repository: BackupRepository }
  /** Creates a new repository and writes its `repo` object first. */
  | { passphrase: string; kdfParams?: KdfParams }
);

export type BackupData = AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

export interface BackupWriteResult {
  backupId: string;
  repoId: string;
  manifestName: string;
  /** Packs this backup created (all committed before the manifest). */
  packIds: string[];
  files: number;
  blobs: number;
  /** Plaintext bytes of every entry, referenced blobs included. */
  bytes: number;
}

export interface BackupWriter {
  readonly backupId: string;
  readonly repository: BackupRepository;
  /** Streams a named file (a database snapshot, `hub.json`) into packs. */
  addFile(name: string, data: BackupData): Promise<BackupV2FileEntry>;
  /** Streams a new blob into packs; `expected` values are checked after the stream ends. */
  addBlob(data: BackupData, expected?: { sha256?: string; size?: number }): Promise<BackupV2BlobEntry>;
  /** Records a blob already stored in an earlier backup's packs (incremental): no bytes are written. */
  addBlobRef(entry: BackupV2BlobEntry): Promise<void>;
  /** Closes the open pack, then writes the end record and commits the manifest (the backup's commit point). */
  finish(): Promise<BackupWriteResult>;
  /** Aborts the open pack and manifest. Committed packs stay as unreferenced objects for garbage collection. */
  abort(): Promise<void>;
}

interface OpenPack {
  id: string;
  writer: SealedWriter;
  key: Uint8Array;
}

function checkMetadata(metadata: unknown): { hubVersion: string; source: BackupSource; forTransfer: boolean; counts: Record<string, number> } {
  if (!isPlainObject(metadata) || typeof metadata['hubVersion'] !== 'string' || typeof metadata['forTransfer'] !== 'boolean') {
    throw new BackupError('bad-input', 'The backup metadata is invalid.');
  }
  const source = checkSourceV2(metadata['source']);
  const counts = checkCountsV2(metadata['counts'] ?? {});
  if (!source) throw new BackupError('bad-input', 'The backup source description is invalid.');
  if (!counts) throw new BackupError('bad-input', 'The backup counts are invalid.');
  return { hubVersion: metadata['hubVersion'], source, forTransfer: metadata['forTransfer'], counts };
}

class StreamingBackupWriter implements BackupWriter {
  readonly backupId: string;
  private pack: OpenPack | null = null;
  private manifest: SealedWriter | null = null;
  private manifestKey: Uint8Array | null = null;
  private readonly packIds: string[] = [];
  private readonly usedIds = new Set<string>();
  private readonly fileNames = new Set<string>();
  private files = 0;
  private blobs = 0;
  private bytes = 0;
  private busy = false;
  private state: 'open' | 'failed' | 'closed' = 'open';

  constructor(
    readonly repository: BackupRepository,
    private readonly ownsRepository: boolean,
    private readonly sink: ObjectSink,
    private readonly deps: BackupDeps,
    private readonly chunkSize: number,
    private readonly packBytes: number,
    now: Date,
  ) {
    this.backupId = backupIdFor(now, this.randomId());
  }

  private randomId(): Uint8Array {
    const id = this.deps.randomBytes(OBJECT_ID_BYTES);
    if (!(id instanceof Uint8Array) || id.length !== OBJECT_ID_BYTES) throw new BackupError('bad-input', 'The random source returned the wrong number of bytes.');
    const hex = toHex(id);
    // Object ids are nonce prefixes; a repeat (a broken random source) must never reach the cipher.
    if (this.usedIds.has(hex)) throw new BackupError('bad-input', 'The random source repeated an object id.');
    this.usedIds.add(hex);
    return id.slice();
  }

  async start(metadata: ReturnType<typeof checkMetadata>, createdAt: string): Promise<void> {
    const name = manifestObjectName(this.backupId);
    const { prefix, headerBytes } = serializeObjectHeader({
      formatVersion: BACKUP_V2_FORMAT_VERSION,
      minReaderVersion: BACKUP_V2_READER_VERSION,
      kind: 'manifest',
      repoId: this.repository.repoId,
      id: this.backupId,
      cipher: 'xchacha20poly1305',
      chunkSize: this.chunkSize,
    });
    this.manifestKey = objectKey(repositoryKeys(this.repository).manifest, name);
    this.manifest = await SealedWriter.open(this.sink, name, prefix, {
      key: this.manifestKey,
      prefix: objectNoncePrefix(this.backupId),
      headerHash: headerHashOf(headerBytes),
      chunkSize: this.chunkSize,
    });
    await this.manifest.write(
      encodeRecord({
        t: 'head',
        formatVersion: BACKUP_V2_FORMAT_VERSION,
        minReaderVersion: BACKUP_V2_READER_VERSION,
        backupId: this.backupId,
        repoId: this.repository.repoId,
        createdAt,
        hubVersion: metadata.hubVersion,
        source: metadata.source,
        forTransfer: metadata.forTransfer,
        counts: metadata.counts,
      }),
    );
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.state !== 'open') throw new BackupError('bad-input', this.state === 'failed' ? 'The backup writer failed; abort it.' : 'The backup writer is closed.');
    if (this.busy) throw new BackupError('bad-input', 'The backup writer takes one entry at a time.');
    this.busy = true;
    try {
      return await work();
    } finally {
      this.busy = false;
    }
  }

  /** Sink and cipher failures leave objects half-written: the writer can then only be aborted. */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.state = 'failed';
      throw error;
    }
  }

  private async openPack(): Promise<OpenPack> {
    if (this.pack) return this.pack;
    const id = toHex(this.randomId());
    const name = packObjectName(id);
    const { prefix, headerBytes } = serializeObjectHeader({
      formatVersion: BACKUP_V2_FORMAT_VERSION,
      minReaderVersion: BACKUP_V2_READER_VERSION,
      kind: 'pack',
      repoId: this.repository.repoId,
      id,
      cipher: 'xchacha20poly1305',
      chunkSize: this.chunkSize,
    });
    const key = objectKey(repositoryKeys(this.repository).content, name);
    try {
      const writer = await SealedWriter.open(this.sink, name, prefix, { key, prefix: objectNoncePrefix(id), headerHash: headerHashOf(headerBytes), chunkSize: this.chunkSize });
      this.pack = { id, writer, key };
      return this.pack;
    } catch (error) {
      key.fill(0);
      throw error;
    }
  }

  private async closePack(): Promise<void> {
    const pack = this.pack;
    if (!pack) return;
    this.pack = null;
    try {
      const stats = await pack.writer.finish();
      this.packIds.push(pack.id);
      await this.record({ t: 'pack', id: pack.id, chunks: stats.chunks, bytes: stats.bytes });
    } finally {
      pack.key.fill(0);
    }
  }

  private async record(record: object): Promise<void> {
    await (this.manifest as SealedWriter).write(encodeRecord(record));
  }

  private countEntry(): void {
    if (this.files + this.blobs >= V2_MAX_ENTRIES) throw new BackupError('too-large', 'The backup has too many entries.');
  }

  /** Streams `data` into packs; an input error or a hash mismatch leaves only unreferenced bytes behind. */
  private async writeData(data: BackupData): Promise<{ size: number; sha256: string; extents: BackupV2Extent[] }> {
    if (data === null || typeof data !== 'object' || (typeof (data as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== 'function' && typeof (data as Iterable<Uint8Array>)[Symbol.iterator] !== 'function')) {
      throw new BackupError('bad-input', 'Backup data must be an iterable of bytes.');
    }
    const hasher = sha256.create();
    const extents: Array<[string, number, number]> = [];
    let size = 0;
    let extent: [string, number, number] | null = null;
    for await (const piece of data) {
      if (!(piece instanceof Uint8Array)) throw new BackupError('bad-input', 'Backup data must yield Uint8Array chunks.');
      hasher.update(piece);
      size += piece.length;
      let at = 0;
      while (at < piece.length) {
        const pack = await this.guarded(() => this.openPack());
        if (!extent || extent[0] !== pack.id) {
          if (extents.length >= V2_MAX_EXTENTS) throw new BackupError('too-large', 'A backup entry is too large.');
          extent = [pack.id, pack.writer.position, 0];
          extents.push(extent);
        }
        const take = Math.min(this.packBytes - pack.writer.position, piece.length - at);
        await this.guarded(() => pack.writer.write(piece.subarray(at, at + take)));
        extent[2] += take;
        at += take;
        if (pack.writer.position >= this.packBytes) await this.guarded(() => this.closePack());
      }
    }
    return { size, sha256: toHex(hasher.digest()), extents: extents.map(e => Object.freeze([e[0], e[1], e[2]]) as BackupV2Extent) };
  }

  addFile(name: string, data: BackupData): Promise<BackupV2FileEntry> {
    return this.exclusive(async () => {
      if (typeof name !== 'string' || !V2_ENTRY_NAME_PATTERN.test(name)) throw new BackupError('bad-input', 'A backup file name is not allowed.');
      // Case-insensitive: restores land on case-insensitive file systems too.
      const folded = name.toLowerCase();
      if (this.fileNames.has(folded)) throw new BackupError('bad-input', 'Backup file names must be unique.');
      if (this.fileNames.size >= V2_MAX_FILES) throw new BackupError('too-large', `A backup holds at most ${V2_MAX_FILES} named files.`);
      this.countEntry();
      const written = await this.writeData(data);
      const entry: BackupV2FileEntry = { kind: 'file', name, size: written.size, sha256: written.sha256, extents: written.extents };
      await this.guarded(() => this.record({ t: 'file', name, size: entry.size, sha256: entry.sha256, extents: entry.extents }));
      this.fileNames.add(folded);
      this.files++;
      this.bytes += entry.size;
      return entry;
    });
  }

  addBlob(data: BackupData, expected: { sha256?: string; size?: number } = {}): Promise<BackupV2BlobEntry> {
    return this.exclusive(async () => {
      if (!isPlainObject(expected)) throw new BackupError('bad-input', 'The expected blob description is invalid.');
      if (expected.sha256 !== undefined && (typeof expected.sha256 !== 'string' || !SHA256_HEX_PATTERN.test(expected.sha256))) throw new BackupError('bad-input', 'A blob hash must be 64 lower-case hex characters.');
      if (expected.size !== undefined && !isInt(expected.size, 0, Number.MAX_SAFE_INTEGER)) throw new BackupError('bad-input', 'The expected blob size is invalid.');
      this.countEntry();
      const written = await this.writeData(data);
      if ((expected.sha256 !== undefined && expected.sha256 !== written.sha256) || (expected.size !== undefined && expected.size !== written.size)) {
        throw new BackupError('integrity', 'The blob content does not match its expected hash or size.');
      }
      const entry: BackupV2BlobEntry = { kind: 'blob', id: this.repository.dedupeId(written.sha256), sha256: written.sha256, size: written.size, extents: written.extents };
      await this.guarded(() => this.record({ t: 'blob', id: entry.id, sha256: entry.sha256, size: entry.size, extents: entry.extents }));
      this.blobs++;
      this.bytes += entry.size;
      return entry;
    });
  }

  addBlobRef(entry: BackupV2BlobEntry): Promise<void> {
    return this.exclusive(async () => {
      const checked = isPlainObject(entry) ? checkBlobEntry(entry as unknown as Record<string, unknown>) : null;
      if (!checked) throw new BackupError('bad-input', 'The referenced blob entry is invalid.');
      // A reference from another repository would point at packs this key hierarchy cannot open.
      if (this.repository.dedupeId(checked.sha256) !== checked.id) throw new BackupError('bad-input', 'The referenced blob belongs to another repository.');
      this.countEntry();
      await this.guarded(() => this.record({ t: 'blob', id: checked.id, sha256: checked.sha256, size: checked.size, extents: checked.extents }));
      this.blobs++;
      this.bytes += checked.size;
    });
  }

  finish(): Promise<BackupWriteResult> {
    return this.exclusive(async () => {
      await this.guarded(async () => {
        await this.closePack();
        await this.record({ t: 'end', files: this.files, blobs: this.blobs, packs: this.packIds.length, bytes: this.bytes });
        await (this.manifest as SealedWriter).finish();
      });
      this.state = 'closed';
      this.release();
      return {
        backupId: this.backupId,
        repoId: this.repository.repoId,
        manifestName: manifestObjectName(this.backupId),
        packIds: [...this.packIds],
        files: this.files,
        blobs: this.blobs,
        bytes: this.bytes,
      };
    });
  }

  async abort(): Promise<void> {
    if (this.state === 'closed') return;
    this.state = 'closed';
    const pack = this.pack;
    this.pack = null;
    if (pack) {
      await pack.writer.abort();
      pack.key.fill(0);
    }
    await this.manifest?.abort();
    this.release();
  }

  private release(): void {
    this.manifestKey?.fill(0);
    this.manifestKey = null;
    if (this.ownsRepository) this.repository.close();
  }
}

/**
 * Starts a streaming v2 backup. Memory is bounded by one chunk per open object (the current pack and the
 * manifest) plus one manifest record, independent of the data size and the number of entries.
 */
export async function createBackupWriter(options: BackupWriterOptions): Promise<BackupWriter> {
  if (!isPlainObject(options) || !isPlainObject(options.sink) || typeof options.sink.create !== 'function') throw new BackupError('bad-input', 'The backup sink is invalid.');
  const metadata = checkMetadata(options.metadata);
  const chunkSize = options.chunkSize ?? V2_DEFAULT_CHUNK_SIZE;
  const packBytes = options.packBytes ?? V2_DEFAULT_PACK_BYTES;
  if (!isInt(chunkSize, V2_MIN_CHUNK_SIZE, V2_MAX_CHUNK_SIZE)) throw new BackupError('bad-input', 'The backup chunk size is out of bounds.');
  if (!isInt(packBytes, chunkSize, V2_MAX_PACK_BYTES)) throw new BackupError('bad-input', 'The backup pack size is out of bounds.');
  const { deps, sink } = options;
  const now = deps.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new BackupError('bad-input', 'The backup timestamp is invalid.');

  let repository: BackupRepository;
  let owns = false;
  if ('repository' in options) {
    repository = options.repository;
    repositoryKeys(repository);
  } else {
    const created = await createRepository(options.passphrase, deps, options.kdfParams);
    repository = created.repository;
    owns = true;
    try {
      const out = await sink.create(REPO_OBJECT_NAME);
      try {
        await out.write(created.object);
        await out.commit();
      } catch (error) {
        await out.abort().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      repository.close();
      throw error;
    }
  }

  let writer: StreamingBackupWriter;
  try {
    writer = new StreamingBackupWriter(repository, owns, sink, deps, chunkSize, packBytes, now);
  } catch (error) {
    if (owns) repository.close();
    throw error;
  }
  try {
    await writer.start(metadata, now.toISOString());
  } catch (error) {
    await writer.abort();
    throw error;
  }
  return writer;
}
