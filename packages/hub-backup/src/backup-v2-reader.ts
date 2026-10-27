import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { BackupError } from './backup-error.js';
import { isPlainObject, toHex } from './backup-format.js';
import {
  BACKUP_ID_PATTERN,
  V2_MAX_ENTRIES,
  V2_MAX_FILES,
  checkObjectHeader,
  equalHex,
  hexToBytes,
  manifestObjectName,
  objectNoncePrefix,
  packObjectName,
  type BackupV2Entry,
  type BackupV2Head,
} from './backup-v2-format.js';
import { LineSplitter, parseRecord, type ManifestItem } from './backup-v2-manifest.js';
import { openRepository, readRepositoryObject, repositoryKeys, type BackupRepository, type BackupV2Credential } from './backup-v2-repo.js';
import { ByteReader, frameOffset, headerHashOf, objectKey, readDataChunk, readPrefix, readSealed, type ObjectSource, type SealedContext, type SealedStats } from './backup-v2-stream.js';
import type { BackupDeps } from './backup.js';

export interface BackupV2VerifyOptions {
  /**
   * `full` (default) decrypts every pack the manifest references and hashes every entry. `new` checks the
   * manifest, the packs this backup created and the entries stored in them; blobs referenced from earlier
   * packs are only checked for a well-formed dedupe identity (they were verified when written).
   */
  scope?: 'full' | 'new';
}

export interface BackupV2VerifyReport {
  backupId: string;
  files: number;
  blobs: number;
  /** Packs decrypted end to end. */
  packs: number;
  /** Plaintext bytes hashed. */
  bytes: number;
}

export type BackupV2OpenCredential = BackupV2Credential | { repository: BackupRepository };

interface PackInfo {
  ctx: SealedContext;
  headerLength: number;
}

const PACK_INFO_CACHE = 16;

/**
 * Reads a v2 backup from a repository-shaped source. Entry streams yield authenticated plaintext as they go and
 * throw `integrity` at the end if the entry's hash or size does not match: a consumer must stage what it reads
 * and commit only when the stream completed (the Hub restore does). `verify` never materializes an entry.
 */
export class BackupV2Reader {
  readonly manifestName: string;
  private readonly packs = new Map<string, PackInfo>();
  private cached: { packId: string; index: number; plain: Uint8Array } | null = null;
  private closed = false;

  constructor(
    readonly source: ObjectSource,
    readonly repository: BackupRepository,
    private readonly ownsRepository: boolean,
    readonly head: BackupV2Head,
  ) {
    this.manifestName = manifestObjectName(head.backupId);
  }

  get backupId(): string {
    return this.head.backupId;
  }

  private check(): void {
    if (this.closed) throw new BackupError('bad-input', 'The backup reader is closed.');
  }

  /** Every validated manifest item in order, enforcing head first, end last, the counts and unique file names. */
  async *items(): AsyncGenerator<ManifestItem> {
    this.check();
    const name = this.manifestName;
    const reader = new ByteReader(this.source.read(name));
    const key = objectKey(repositoryKeys(this.repository).manifest, name);
    try {
      const { raw, headerBytes } = await readPrefix(reader);
      const header = checkObjectHeader(raw, 'manifest', this.repository.repoId, this.head.backupId);
      const ctx: SealedContext = { key, prefix: objectNoncePrefix(header.id), headerHash: headerHashOf(headerBytes), chunkSize: header.chunkSize };
      const lines = new LineSplitter();
      const names = new Set<string>();
      const seen = { files: 0, blobs: 0, packs: 0, bytes: 0 };
      let index = 0;
      let ended = false;
      for await (const plain of readSealed(reader, ctx)) {
        for (const raw of lines.push(plain)) {
          const item = parseRecord(raw);
          const position = index++;
          if (item === null) continue;
          if (ended || (position === 0) !== (item.t === 'head')) throw new BackupError('integrity', 'The backup manifest is out of order.');
          switch (item.t) {
            case 'head':
              if (item.head.backupId !== this.head.backupId || item.head.repoId !== this.repository.repoId) throw new BackupError('integrity', 'The backup manifest belongs to another backup.');
              break;
            case 'file': {
              const folded = item.entry.name.toLowerCase();
              if (names.has(folded) || names.size >= V2_MAX_FILES) throw new BackupError('integrity', 'The backup manifest has duplicate or too many files.');
              names.add(folded);
              seen.files++;
              seen.bytes += item.entry.size;
              break;
            }
            case 'blob':
              seen.blobs++;
              seen.bytes += item.entry.size;
              break;
            case 'pack':
              seen.packs++;
              break;
            case 'end': {
              const { end } = item;
              if (end.files !== seen.files || end.blobs !== seen.blobs || end.packs !== seen.packs || end.bytes !== seen.bytes) {
                throw new BackupError('integrity', 'The backup manifest counts do not match its entries.');
              }
              ended = true;
              break;
            }
          }
          if (seen.files + seen.blobs > V2_MAX_ENTRIES) throw new BackupError('integrity', 'The backup manifest has too many entries.');
          yield item;
        }
      }
      lines.finish();
      if (!ended) throw new BackupError('integrity', 'The backup manifest has no end record.');
    } finally {
      key.fill(0);
      await reader.close();
    }
  }

  /** File and blob entries, streamed from the manifest (nothing is held). */
  async *listEntries(): AsyncGenerator<BackupV2Entry> {
    for await (const item of this.items()) if (item.t === 'file' || item.t === 'blob') yield item.entry;
  }

  private async findEntry(match: (entry: BackupV2Entry) => boolean): Promise<BackupV2Entry> {
    for await (const entry of this.listEntries()) if (match(entry)) return entry;
    throw new BackupError('bad-input', 'The backup has no such entry.');
  }

  /** Streams a file entry's bytes (by name or entry) and checks its size and SHA-256 at the end. */
  async *readEntry(nameOrEntry: string | BackupV2Entry): AsyncGenerator<Uint8Array> {
    const entry = typeof nameOrEntry === 'string' ? await this.findEntry(e => e.kind === 'file' && e.name === nameOrEntry) : nameOrEntry;
    if (!isPlainObject(entry) || !Array.isArray(entry.extents)) throw new BackupError('bad-input', 'The backup entry is invalid.');
    const hasher = sha256.create();
    let size = 0;
    for (const [packId, offset, length] of entry.extents) {
      for await (const piece of this.readRange(packId, offset, length)) {
        hasher.update(piece);
        size += piece.length;
        yield piece;
      }
    }
    if (size !== entry.size || !equalHex(toHex(hasher.digest()), entry.sha256)) throw new BackupError('integrity', 'A backup entry failed its checksum.');
  }

  /** Streams a blob by its dedupe identity. */
  async *readBlob(dedupeId: string): AsyncGenerator<Uint8Array> {
    yield* this.readEntry(await this.findEntry(e => e.kind === 'blob' && e.id === dedupeId));
  }

  private async packInfo(packId: string): Promise<PackInfo> {
    const known = this.packs.get(packId);
    if (known) return known;
    const name = packObjectName(packId);
    const reader = new ByteReader(this.source.read(name));
    let info: PackInfo;
    try {
      const { raw, headerBytes, length } = await readPrefix(reader);
      const header = checkObjectHeader(raw, 'pack', this.repository.repoId, packId);
      info = {
        ctx: { key: objectKey(repositoryKeys(this.repository).content, name), prefix: objectNoncePrefix(packId), headerHash: headerHashOf(headerBytes), chunkSize: header.chunkSize },
        headerLength: length,
      };
    } finally {
      await reader.close();
    }
    if (this.packs.size >= PACK_INFO_CACHE) {
      const [oldest, evicted] = this.packs.entries().next().value as [string, PackInfo];
      evicted.ctx.key.fill(0);
      this.packs.delete(oldest);
    }
    this.packs.set(packId, info);
    return info;
  }

  /** Authenticated plaintext of `[offset, offset + length)` in a pack, decrypting only the covering chunks. */
  private async *readRange(packId: string, offset: number, length: number): AsyncGenerator<Uint8Array> {
    this.check();
    const info = await this.packInfo(packId);
    const { chunkSize } = info.ctx;
    const end = offset + length;
    const last = Math.floor((end - 1) / chunkSize);
    let reader: ByteReader | null = null;
    try {
      for (let index = Math.floor(offset / chunkSize); index <= last; index++) {
        let plain: Uint8Array;
        if (this.cached && this.cached.packId === packId && this.cached.index === index) {
          plain = this.cached.plain;
        } else {
          reader ??= new ByteReader(this.source.read(packObjectName(packId), frameOffset(info.headerLength, chunkSize, index)));
          plain = await readDataChunk(reader, info.ctx, index);
          this.cached?.plain.fill(0);
          this.cached = { packId, index, plain };
        }
        const chunkStart = index * chunkSize;
        const from = Math.max(offset, chunkStart) - chunkStart;
        const to = Math.min(end, chunkStart + chunkSize) - chunkStart;
        if (to > plain.length) throw new BackupError('integrity', 'A backup entry points past the end of its pack.');
        yield plain.slice(from, to);
      }
    } finally {
      await reader?.close();
    }
  }

  /** Decrypts one pack end to end (trailer, counts and tag chain included) without keeping its plaintext. */
  private async verifyPack(packId: string): Promise<SealedStats> {
    const name = packObjectName(packId);
    const reader = new ByteReader(this.source.read(name));
    const key = objectKey(repositoryKeys(this.repository).content, name);
    try {
      const { raw, headerBytes } = await readPrefix(reader);
      const header = checkObjectHeader(raw, 'pack', this.repository.repoId, packId);
      const stats: SealedStats = { chunks: 0, bytes: 0 };
      for await (const plain of readSealed(reader, { key, prefix: objectNoncePrefix(packId), headerHash: headerHashOf(headerBytes), chunkSize: header.chunkSize }, stats)) plain.fill(0);
      return stats;
    } finally {
      key.fill(0);
      await reader.close();
    }
  }

  /** The packs this manifest references, in first-reference order. */
  async referencedPacks(): Promise<string[]> {
    const packs = new Set<string>();
    for await (const entry of this.listEntries()) for (const [packId] of entry.extents) packs.add(packId);
    return [...packs];
  }

  /**
   * Full decrypt-and-check without materializing anything: the manifest (structure, counts, end record), every
   * entry's size and SHA-256, every blob's dedupe identity and every pack end to end. Throws on the first failure.
   */
  async verify(options: BackupV2VerifyOptions = {}): Promise<BackupV2VerifyReport> {
    const scope = options.scope ?? 'full';
    if (scope !== 'full' && scope !== 'new') throw new BackupError('bad-input', 'Unknown verify scope.');
    const referenced = new Set<string>();
    const created = new Map<string, { chunks: number; bytes: number }>();
    let files = 0;
    let blobs = 0;
    for await (const item of this.items()) {
      if (item.t === 'pack') {
        if (created.has(item.pack.id)) throw new BackupError('integrity', 'The backup manifest lists a pack twice.');
        created.set(item.pack.id, { chunks: item.pack.chunks, bytes: item.pack.bytes });
      } else if (item.t === 'file' || item.t === 'blob') {
        for (const [packId] of item.entry.extents) referenced.add(packId);
        if (item.t === 'file') files++;
        else blobs++;
      }
    }

    const dedupeKey = repositoryKeys(this.repository).dedupe;
    let bytes = 0;
    for await (const entry of this.listEntries()) {
      if (entry.kind === 'blob' && !equalHex(toHex(hmac(sha256, dedupeKey, hexToBytes(entry.sha256))), entry.id)) {
        throw new BackupError('integrity', 'A backup blob has the wrong dedupe identity.');
      }
      for (const [packId, offset, length] of entry.extents) {
        const own = created.get(packId);
        if (own && offset + length > own.bytes) throw new BackupError('integrity', 'A backup entry points past the end of its pack.');
      }
      if (scope === 'new' && !entry.extents.some(([packId]) => created.has(packId))) continue;
      for await (const piece of this.readEntry(entry)) {
        bytes += piece.length;
        piece.fill(0);
      }
    }

    // A created pack may hold only bytes of an entry the writer rejected (a hash mismatch); it is still checked.
    const packs = scope === 'full' ? [...new Set([...referenced, ...created.keys()])] : [...created.keys()];
    for (const packId of packs) {
      const stats = await this.verifyPack(packId);
      const own = created.get(packId);
      if (own && (own.chunks !== stats.chunks || own.bytes !== stats.bytes)) throw new BackupError('integrity', 'A backup pack does not match its manifest record.');
    }
    return { backupId: this.backupId, files, blobs, packs: packs.length, bytes };
  }

  /** Zeroes cached plaintext and keys; closes the repository if this reader opened it. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cached?.plain.fill(0);
    this.cached = null;
    for (const info of this.packs.values()) info.ctx.key.fill(0);
    this.packs.clear();
    if (this.ownsRepository) this.repository.close();
  }
}

/**
 * Opens backup `backupId` in a repository-shaped source: reads and unwraps `repo` (or uses an opened repository),
 * then authenticates the manifest's head record. Nothing else is read until asked.
 */
export async function openBackupV2(source: ObjectSource, backupId: string, credential: BackupV2OpenCredential, deps: Pick<BackupDeps, 'deriveKey'>): Promise<BackupV2Reader> {
  if (!isPlainObject(source) || typeof source.read !== 'function') throw new BackupError('bad-input', 'The backup source is invalid.');
  if (typeof backupId !== 'string' || !BACKUP_ID_PATTERN.test(backupId)) throw new BackupError('bad-input', 'The backup id is invalid.');
  let repository: BackupRepository;
  let owns = false;
  if (isPlainObject(credential) && 'repository' in credential) {
    repository = credential.repository;
    repositoryKeys(repository);
  } else {
    repository = await openRepository(await readRepositoryObject(source), credential as BackupV2Credential, deps);
    owns = true;
  }
  try {
    const probe = new BackupV2Reader(source, repository, false, {
      formatVersion: 2,
      minReaderVersion: 2,
      backupId,
      repoId: repository.repoId,
      createdAt: '',
      hubVersion: '',
      source: { hubInstanceId: '', authorityEpoch: 0, schemaVersion: 0, dbMinReaderVersion: 0 },
      forTransfer: false,
      counts: {},
    });
    let head: BackupV2Head | null = null;
    for await (const item of probe.items()) {
      if (item.t === 'head') head = item.head;
      break;
    }
    probe.close();
    if (!head) throw new BackupError('integrity', 'The backup manifest has no head record.');
    return new BackupV2Reader(source, repository, owns, head);
  } catch (error) {
    if (owns) repository.close();
    throw error;
  }
}

