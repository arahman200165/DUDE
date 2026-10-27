import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_BLOB_OWNER_KIND, UPLOAD_MAX_DECLARED_SIZE, negotiateUploadChunkSize, uploadChunkCount, uploadChunkLength } from '@dude/contracts/hub';
import type { HubErrorCode, UploadChunkResponse, UploadCompleteResponse, UploadCreateRequest, UploadFailureReason, UploadSession, UploadState } from '@dude/contracts/hub';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { BlobCatalogueError, BlobHashMismatchError, BlobTooLargeError, addBlobRef, recordBlob, removeBlobRef } from '../blobs/index.js';
import type { BlobPutResult, BlobStore } from '../blobs/index.js';
import type { HubPaths } from '../config/data-dir.js';
import { appendAuditOutbox } from '../savesphere-db/audit-outbox.js';
import type { DiskGuard } from './disk-guard.js';

/**
 * The credential-agnostic core of the resumable upload route family (32-SS1, Milestone 845, PD-118, PD-148). The routes resolve a principal
 * from whatever credential class they accept (the owner today; 32-SS3 may add the ingest-token class) and hand it here; nothing below this
 * line knows about cookies, bearers or tokens. A session belongs to the principal that created it and is invisible (404) to every other.
 */
export interface UploadPrincipal {
  kind: 'owner';
  id: string;
}

export interface UploadFailure {
  ok: false;
  status: 400 | 404 | 409 | 411 | 413 | 507;
  code: HubErrorCode;
  message: string;
}
export type UploadOutcome<T> = { ok: true; value: T } | UploadFailure;

export type CompleteValue = { kind: 'complete'; value: UploadCompleteResponse } | { kind: 'pending'; value: UploadSession };

/** Limits, all injectable for specs. */
export interface UploadLimits {
  /** Idle time before a session expires (default 24 h since the last activity). A completed session keeps its blob reference this long awaiting attachment. */
  ttlMs: number;
  /** Open or completing sessions per principal. */
  maxSessionsPerPrincipal: number;
  /** Declared bytes of every open or completing session together, less what has already arrived. A Hub policy ceiling; the disk guard is the real limit. */
  maxInflightBytes: number;
  /** How long `complete` waits for the assembly before answering 202 (the assembly carries on regardless). */
  completeWaitMs: number;
  /** Final rows are kept this long for status and idempotent answers, then pruned. */
  retentionMs: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  ttlMs: 24 * 3600_000,
  maxSessionsPerPrincipal: 8,
  maxInflightBytes: 2 ** 41,
  completeWaitMs: 50_000,
  retentionMs: 7 * 24 * 3600_000,
};

export interface UploadServiceOptions {
  /** The open `savesphere.db`. */
  db: Db;
  paths: Pick<HubPaths, 'uploadsDir'>;
  blobs: BlobStore;
  guard: DiskGuard;
  now?: () => number;
  limits?: Partial<UploadLimits>;
  /** Writes drained `audit_outbox` rows into `dude.db` (called after a commit that appended some). */
  drainAudit?: () => void;
  /** Crash-injection seams: they run at exactly the points where a killed process leaves a particular on-disk state. */
  hooks?: {
    /** After the chunk file is renamed into place and BEFORE its row is written. */
    afterChunkRename?(): void | Promise<void>;
    /** Before assembly streams the first chunk (a slow assembly for the 202 path). */
    beforeAssemble?(): void | Promise<void>;
  };
}

export interface ExpireResult {
  expired: number;
  releasedRefs: number;
  removedDirs: number;
  pruned: number;
}

export interface UploadService {
  create(principal: UploadPrincipal, input: UploadCreateRequest): UploadOutcome<UploadSession>;
  status(principal: UploadPrincipal, id: string): UploadOutcome<UploadSession>;
  putChunk(principal: UploadPrincipal, id: string, index: number, body: AsyncIterable<Uint8Array>, meta: { contentLength: number; claimedSha256?: string }): Promise<UploadOutcome<UploadChunkResponse>>;
  complete(principal: UploadPrincipal, id: string): Promise<UploadOutcome<CompleteValue>>;
  abort(principal: UploadPrincipal, id: string): Promise<UploadOutcome<{ aborted: boolean }>>;
  /** The `uploads.expire` job: expires idle sessions, releases references, removes stray chunk directories, prunes old rows. */
  expire(): Promise<ExpireResult>;
}

interface UploadRow {
  id: string;
  state: UploadState;
  declared_size: number;
  declared_sha256: string | null;
  chunk_size: number;
  chunk_count: number;
  mime: string | null;
  name: string | null;
  principal_kind: string;
  principal_id: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
  completed_at: number | null;
  blob_sha256: string | null;
  attached_at: number | null;
  failure: UploadFailureReason | null;
}

const COLUMNS = 'id, state, declared_size, declared_sha256, chunk_size, chunk_count, mime, name, principal_kind, principal_id, created_at, updated_at, expires_at, completed_at, blob_sha256, attached_at, failure';
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;
const READ_CHUNK = 1024 * 1024;
const DIR_GRACE_MS = 10 * 60_000;
const EXPIRE_BATCH = 200;

const iso = (ms: number): string => new Date(ms).toISOString();
const isCode = (error: unknown, ...codes: string[]): boolean => codes.includes((error as NodeJS.ErrnoException | undefined)?.code ?? '');
const fail = (status: UploadFailure['status'], code: HubErrorCode, message: string): UploadFailure => ({ ok: false, status, code, message });
const notFound = (): UploadFailure => fail(404, 'not-found', 'That upload does not exist.');
const storageFull = (): UploadFailure => fail(507, 'storage-full', 'The Hub does not have enough free disk space for this upload. Nothing was stored; free some space and retry.');

/** A body that does not have the length its headers promised (a client that stopped sending, or lied). */
class ChunkSizeError extends Error {}
/** A stored chunk file that is gone, the wrong size or no longer hashes to its row: the client re-sends that chunk. */
class ChunkLostError extends Error {
  constructor(readonly index: number) { super('A stored chunk is missing or damaged.'); }
}

/** Display metadata is data, never a path: control and bidirectional-override characters go, directories are dropped, the length is capped. */
export function sanitizeUploadName(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const cleaned = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g, '');
  const base = cleaned.split(/[\\/]/).pop() ?? '';
  const trimmed = base.trim().slice(0, 255).trim();
  return trimmed === '' || trimmed === '.' || trimmed === '..' ? null : trimmed;
}

/** The media type without parameters, lower-cased; null when absent, undefined when present but not a type/subtype. */
export function sanitizeUploadMime(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return null;
  const type = (raw.split(';')[0] ?? '').trim().toLowerCase();
  if (type === '') return null;
  return MIME.test(type) ? type : undefined;
}

/** Ascending, non-overlapping inclusive `[from, to]` runs of the given ascending indexes. */
export function rangesOf(indexes: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const index of indexes) {
    const last = out[out.length - 1];
    if (last !== undefined && last[1] + 1 === index) last[1] = index;
    else out.push([index, index]);
  }
  return out;
}

async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await open(dir, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch { /* not possible on Windows */ }
}

export function createUploadService(options: UploadServiceOptions): UploadService {
  const { db, blobs, guard } = options;
  const now = options.now ?? Date.now;
  const limits: UploadLimits = { ...DEFAULT_UPLOAD_LIMITS, ...options.limits };
  const rootDir = options.paths.uploadsDir;
  const dirOf = (id: string): string => path.join(rootDir, id);
  const partOf = (id: string, index: number): string => path.join(dirOf(id), `${index}.part`);

  const inflightComplete = new Map<string, Promise<UploadOutcome<UploadCompleteResponse>>>();
  const commitLocks = new Map<string, Promise<void>>();

  // Single-process Hub: a session left `completing` by a crash has no assembly running; its chunks are intact, so it simply resumes as `open`.
  db.prepare("UPDATE uploads SET state = 'open' WHERE state = 'completing'").run();

  const drain = (): void => { try { options.drainAudit?.(); } catch { /* retried by the next drain */ } };

  async function withCommitLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = commitLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => mine);
    commitLocks.set(key, chained);
    await previous;
    try { return await fn(); } finally {
      release();
      if (commitLocks.get(key) === chained) commitLocks.delete(key);
    }
  }

  const rowOf = (id: string): UploadRow | undefined => (UPLOAD_ID.test(id) ? db.prepare(`SELECT ${COLUMNS} FROM uploads WHERE id = ?`).get(id) as UploadRow | undefined : undefined);
  const owned = (principal: UploadPrincipal, id: string): UploadRow | undefined => {
    const row = rowOf(id);
    return row !== undefined && row.principal_kind === principal.kind && row.principal_id === principal.id ? row : undefined;
  };

  const chunkRows = (id: string): Array<{ idx: number; size: number }> => db.prepare('SELECT idx, size FROM upload_chunks WHERE upload_id = ? ORDER BY idx').all(id) as Array<{ idx: number; size: number }>;
  const chunkRow = (id: string, index: number): { size: number; sha256: string } | undefined =>
    db.prepare('SELECT size, sha256 FROM upload_chunks WHERE upload_id = ? AND idx = ?').get(id, index) as { size: number; sha256: string } | undefined;

  function view(row: UploadRow): UploadSession {
    const chunks = row.state === 'open' || row.state === 'completing' ? chunkRows(row.id) : [];
    const complete = row.state === 'complete';
    return {
      uploadId: row.id,
      state: row.state,
      size: row.declared_size,
      sha256: row.declared_sha256,
      chunkSize: row.chunk_size,
      chunkCount: row.chunk_count,
      received: rangesOf(chunks.map((c) => c.idx)),
      receivedChunks: complete ? row.chunk_count : chunks.length,
      receivedBytes: complete ? row.declared_size : chunks.reduce((sum, c) => sum + c.size, 0),
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      mime: row.mime,
      name: row.name,
      blob: complete && row.blob_sha256 !== null ? { sha256: row.blob_sha256, size: row.declared_size, blobRef: `${UPLOAD_BLOB_OWNER_KIND}:${row.id}` } : null,
      failure: row.failure,
    };
  }

  const completeValue = (row: UploadRow): UploadCompleteResponse => ({
    uploadId: row.id, state: 'complete', sha256: row.blob_sha256 as string, size: row.declared_size, blobRef: `${UPLOAD_BLOB_OWNER_KIND}:${row.id}`, expiresAt: iso(row.expires_at),
  });

  const touch = (id: string, at: number): number => {
    const expiresAt = at + limits.ttlMs;
    db.prepare("UPDATE uploads SET updated_at = ?, expires_at = ? WHERE id = ? AND state = 'open'").run(at, expiresAt, id);
    return expiresAt;
  };

  /** True when a directory existed and is now gone. */
  const removeDir = async (id: string): Promise<boolean> => {
    const existed = await stat(dirOf(id)).then(() => true, () => false);
    if (!existed) return false;
    try {
      await rm(dirOf(id), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      return true;
    } catch {
      return false; // a transient lock (Windows) or a racing writer: the expiry sweep retries
    }
  };

  // ---- create ------------------------------------------------------------------------------------------------------------------------------

  function create(principal: UploadPrincipal, input: UploadCreateRequest): UploadOutcome<UploadSession> {
    if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > UPLOAD_MAX_DECLARED_SIZE) return fail(400, 'bad-request', 'The declared size is not valid.');
    if (input.sha256 !== undefined && !SHA256.test(input.sha256)) return fail(400, 'bad-request', 'The declared SHA-256 must be 64 lower-case hexadecimal characters.');
    const mime = sanitizeUploadMime(input.mime);
    if (mime === undefined) return fail(400, 'bad-request', 'The media type is not valid.');
    const name = sanitizeUploadName(input.name);
    const chunkSize = negotiateUploadChunkSize(input.chunkSize);
    const chunkCount = uploadChunkCount(input.size, chunkSize);
    const at = now();
    const id = randomUUID();

    let refused: UploadFailure | undefined;
    transaction(db, () => {
      const active = db.prepare("SELECT COUNT(*) AS n FROM uploads WHERE principal_kind = ? AND principal_id = ? AND state IN ('open', 'completing')").get(principal.kind, principal.id) as { n: number };
      if (Number(active.n) >= limits.maxSessionsPerPrincipal) {
        refused = fail(409, 'conflict', `Too many uploads are in progress (at most ${limits.maxSessionsPerPrincipal}). Finish or cancel one first.`);
        return;
      }
      const declared = (db.prepare("SELECT COALESCE(SUM(declared_size), 0) AS n FROM uploads WHERE state IN ('open', 'completing')").get() as { n: number }).n;
      const received = (db.prepare("SELECT COALESCE(SUM(c.size), 0) AS n FROM upload_chunks c JOIN uploads u ON u.id = c.upload_id WHERE u.state IN ('open', 'completing')").get() as { n: number }).n;
      const reserved = Number(declared) - Number(received);
      if (reserved + input.size > limits.maxInflightBytes) {
        refused = fail(409, 'conflict', 'The uploads in progress already account for the most data the Hub accepts at once. Finish one first.');
        return;
      }
      // Everything still owed to open sessions, plus this file, must fit with the reserve to spare (the assembly briefly needs a second copy; `complete` checks that).
      if (!guard.check(reserved + input.size).ok) {
        refused = storageFull();
        return;
      }
      db.prepare(
        `INSERT INTO uploads(id, state, declared_size, declared_sha256, chunk_size, chunk_count, mime, name, principal_kind, principal_id, created_at, updated_at, expires_at)
         VALUES(?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, input.size, input.sha256 ?? null, chunkSize, chunkCount, mime, name, principal.kind, principal.id, at, at, at + limits.ttlMs);
      appendAuditOutbox(db, {
        event: 'upload.created', actorKind: 'owner', actorId: principal.id, dedupeKey: `upload.created:${id}`, now: at,
        detail: { uploadId: id, size: input.size, chunkCount, chunkSize },
      });
    });
    if (refused !== undefined) return refused;
    drain();
    return { ok: true, value: view(rowOf(id) as UploadRow) };
  }

  function status(principal: UploadPrincipal, id: string): UploadOutcome<UploadSession> {
    const row = owned(principal, id);
    return row === undefined ? notFound() : { ok: true, value: view(row) };
  }

  // ---- chunks ------------------------------------------------------------------------------------------------------------------------------

  /** Streams `body` into a fresh temp file beside the final name, hashing as it goes; returns when the file is complete and flushed. */
  async function receive(body: AsyncIterable<Uint8Array>, id: string, index: number, expected: number): Promise<{ tmp: string; sha256: string }> {
    await mkdir(dirOf(id), { recursive: true });
    const tmp = path.join(dirOf(id), `${index}.${randomBytes(8).toString('hex')}.tmp`);
    const handle = await open(tmp, 'wx');
    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > expected) throw new ChunkSizeError();
        hash.update(chunk);
        let written = 0;
        while (written < chunk.byteLength) {
          const { bytesWritten } = await handle.write(chunk, written, chunk.byteLength - written);
          written += bytesWritten;
        }
      }
      if (size !== expected) throw new ChunkSizeError();
      await handle.sync();
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
    return { tmp, sha256: hash.digest('hex') };
  }

  /** Consumes `body` into a hash only (a retry of a chunk that already arrived writes nothing). */
  async function hashOnly(body: AsyncIterable<Uint8Array>, expected: number): Promise<string> {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > expected) throw new ChunkSizeError();
      hash.update(chunk);
    }
    if (size !== expected) throw new ChunkSizeError();
    return hash.digest('hex');
  }

  async function putChunk(
    principal: UploadPrincipal, id: string, index: number, body: AsyncIterable<Uint8Array>, meta: { contentLength: number; claimedSha256?: string },
  ): Promise<UploadOutcome<UploadChunkResponse>> {
    const row = owned(principal, id);
    if (row === undefined) return notFound();
    if (row.state !== 'open') return fail(409, 'conflict', `The upload is ${row.state} and takes no more chunks.`);
    if (!Number.isSafeInteger(index) || index < 0 || index >= row.chunk_count) return fail(400, 'bad-request', `The chunk index is outside 0 to ${row.chunk_count - 1}.`);
    if (meta.claimedSha256 !== undefined && !SHA256.test(meta.claimedSha256)) return fail(400, 'bad-request', 'The chunk SHA-256 must be 64 lower-case hexadecimal characters.');
    if (meta.contentLength > row.chunk_size) return fail(413, 'payload-too-large', `A chunk of this upload is at most ${row.chunk_size} bytes.`);
    const expected = uploadChunkLength(row.declared_size, row.chunk_size, index);
    if (meta.contentLength !== expected) return fail(400, 'bad-request', `Chunk ${index} must be exactly ${expected} bytes.`);

    const existing = chunkRow(id, index);
    const respond = (sha256: string, duplicate: boolean): UploadOutcome<UploadChunkResponse> => {
      const stats = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM upload_chunks WHERE upload_id = ?').get(id) as { n: number; bytes: number };
      const fresh = rowOf(id) as UploadRow;
      return { ok: true, value: { uploadId: id, index, size: expected, sha256, duplicate, receivedChunks: Number(stats.n), receivedBytes: Number(stats.bytes), expiresAt: iso(fresh.expires_at) } };
    };

    try {
      if (existing !== undefined) {
        // A retry: read the body (the client sent it), compare, write nothing.
        const sha256 = await hashOnly(body, expected);
        if (meta.claimedSha256 !== undefined && meta.claimedSha256 !== sha256) return fail(400, 'bad-request', 'The chunk does not match its SHA-256.');
        if (sha256 !== existing.sha256) return fail(409, 'conflict', `Chunk ${index} already arrived with different content.`);
        touch(id, now());
        return respond(sha256, true);
      }
      if (!guard.check(expected).ok) return storageFull();
      const received = await receive(body, id, index, expected);
      if (meta.claimedSha256 !== undefined && meta.claimedSha256 !== received.sha256) {
        await unlink(received.tmp).catch(() => undefined);
        return fail(400, 'bad-request', 'The chunk does not match its SHA-256.');
      }
      return await withCommitLock(`${id}:${index}`, async () => {
        const again = chunkRow(id, index);
        if (again !== undefined) {
          // A concurrent attempt of the same index committed first.
          await unlink(received.tmp).catch(() => undefined);
          return again.sha256 === received.sha256 ? respond(again.sha256, true) : fail(409, 'conflict', `Chunk ${index} already arrived with different content.`);
        }
        if ((rowOf(id) as UploadRow).state !== 'open') {
          await unlink(received.tmp).catch(() => undefined);
          return fail(409, 'conflict', 'The upload is no longer open.');
        }
        await rename(received.tmp, partOf(id, index));
        await syncDirectory(dirOf(id));
        await options.hooks?.afterChunkRename?.();
        const at = now();
        let stillOpen = true;
        transaction(db, () => {
          const state = (db.prepare('SELECT state FROM uploads WHERE id = ?').get(id) as { state: UploadState } | undefined)?.state;
          if (state !== 'open') { stillOpen = false; return; }
          db.prepare('INSERT INTO upload_chunks(upload_id, idx, size, sha256, received_at) VALUES(?, ?, ?, ?, ?)').run(id, index, expected, received.sha256, at);
          touch(id, at);
        });
        if (!stillOpen) {
          await unlink(partOf(id, index)).catch(() => undefined);
          return fail(409, 'conflict', 'The upload is no longer open.');
        }
        return respond(received.sha256, false);
      });
    } catch (error) {
      if (isCode(error, 'ENOSPC', 'EDQUOT')) return storageFull();
      if (error instanceof ChunkSizeError) return fail(400, 'bad-request', `Chunk ${index} was not received completely.`);
      if (isCode(error, 'ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'ECONNABORTED') || (error as Error | undefined)?.message === 'aborted') return fail(400, 'bad-request', `Chunk ${index} was not received completely.`);
      throw error;
    }
  }

  // ---- complete ----------------------------------------------------------------------------------------------------------------------------

  class ChunkStream {
    constructor(private readonly id: string, private readonly count: number) {}
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      await options.hooks?.beforeAssemble?.();
      for (let index = 0; index < this.count; index += 1) {
        const row = chunkRow(this.id, index);
        if (row === undefined) throw new ChunkLostError(index);
        const file = partOf(this.id, index);
        let size: number;
        try { size = (await stat(file)).size; } catch (error) { if (isCode(error, 'ENOENT')) throw new ChunkLostError(index); throw error; }
        if (size !== row.size) throw new ChunkLostError(index);
        const hash = createHash('sha256');
        for await (const buffer of createReadStream(file, { highWaterMark: READ_CHUNK })) {
          hash.update(buffer as Uint8Array);
          yield buffer as Uint8Array;
        }
        if (hash.digest('hex') !== row.sha256) throw new ChunkLostError(index);
      }
    }
  }

  const revertToOpen = (id: string, lostIndex?: number): void => {
    transaction(db, () => {
      if (lostIndex !== undefined) db.prepare('DELETE FROM upload_chunks WHERE upload_id = ? AND idx = ?').run(id, lostIndex);
      db.prepare("UPDATE uploads SET state = 'open', updated_at = ?, expires_at = ? WHERE id = ? AND state = 'completing'").run(now(), now() + limits.ttlMs, id);
    });
  };

  async function failUpload(row: UploadRow, reason: UploadFailureReason): Promise<void> {
    const at = now();
    transaction(db, () => {
      db.prepare("UPDATE uploads SET state = 'failed', failure = ?, updated_at = ? WHERE id = ? AND state = 'completing'").run(reason, at, row.id);
      db.prepare('DELETE FROM upload_chunks WHERE upload_id = ?').run(row.id);
      appendAuditOutbox(db, { event: 'upload.failed', outcome: 'failure', actorKind: 'owner', actorId: row.principal_id, dedupeKey: `upload.failed:${row.id}`, now: at, detail: { uploadId: row.id, reason } });
    });
    drain();
    await removeDir(row.id);
  }

  /** Streams the chunks, in order, through hashing into the blob store and commits the blob, its reference and the session in one transaction. */
  async function assemble(row: UploadRow): Promise<UploadOutcome<UploadCompleteResponse>> {
    const id = row.id;
    let put: BlobPutResult;
    try {
      const source = new ChunkStream(id, row.chunk_count);
      put = await blobs.put(source, { maxBytes: row.declared_size, ...(row.declared_sha256 === null ? {} : { expectedSha256: row.declared_sha256 }) });
      for (let attempt = 0; ; attempt += 1) {
        try {
          const at = now();
          transaction(db, () => {
            recordBlob(db, { sha256: put.sha256, size: put.size, now: at, created: put.created });
            addBlobRef(db, { sha256: put.sha256, ownerKind: UPLOAD_BLOB_OWNER_KIND, ownerId: id, now: at });
            db.prepare("UPDATE uploads SET state = 'complete', blob_sha256 = ?, completed_at = ?, updated_at = ?, expires_at = ? WHERE id = ? AND state = 'completing'")
              .run(put.sha256, at, at, at + limits.ttlMs, id);
            db.prepare('DELETE FROM upload_chunks WHERE upload_id = ?').run(id);
            appendAuditOutbox(db, {
              event: 'upload.completed', actorKind: 'owner', actorId: row.principal_id, dedupeKey: `upload.completed:${id}`, now: at,
              detail: { uploadId: id, size: put.size, blobSha256: put.sha256, chunkCount: row.chunk_count },
            });
          });
          break;
        } catch (error) {
          // Garbage collection was deleting this very blob between our put and our record: store it again and retry.
          if (error instanceof BlobCatalogueError && error.code === 'deleting' && attempt < 3) {
            put = await blobs.put(new ChunkStream(id, row.chunk_count), { maxBytes: row.declared_size, ...(row.declared_sha256 === null ? {} : { expectedSha256: row.declared_sha256 }) });
            continue;
          }
          throw error;
        }
      }
      // The narrow window M833 documents: collection finished completely between put and record, so the row now names a missing file. The chunks are still here: store it again.
      if (!(await blobs.has(put.sha256))) {
        const again = await blobs.put(new ChunkStream(id, row.chunk_count), { maxBytes: row.declared_size, expectedSha256: put.sha256 });
        if (!(await blobs.has(again.sha256))) throw new BlobCatalogueError('not-recorded', 'The blob vanished during commit.');
      }
    } catch (error) {
      if (error instanceof BlobHashMismatchError) {
        await failUpload(row, 'sha256-mismatch');
        return fail(409, 'conflict', 'The assembled content does not match the declared SHA-256. The upload failed and nothing was kept; start a new upload.');
      }
      if (error instanceof ChunkLostError) {
        revertToOpen(id, error.index);
        return fail(409, 'conflict', `Chunk ${error.index} was missing or damaged on the Hub. Send it again, then complete.`);
      }
      revertToOpen(id);
      if (isCode(error, 'ENOSPC', 'EDQUOT')) return storageFull();
      if (error instanceof BlobTooLargeError) return fail(409, 'conflict', 'The stored chunks are larger than the declared size.');
      throw error;
    }
    drain();
    await removeDir(id);
    return { ok: true, value: completeValue(rowOf(id) as UploadRow) };
  }

  async function complete(principal: UploadPrincipal, id: string): Promise<UploadOutcome<CompleteValue>> {
    const row = owned(principal, id);
    if (row === undefined) return notFound();
    if (row.state === 'complete') return { ok: true, value: { kind: 'complete', value: completeValue(row) } };
    if (row.state === 'failed') return fail(409, 'conflict', 'The upload failed verification and nothing was kept. Start a new upload.');
    if (row.state === 'aborted' || row.state === 'expired') return fail(409, 'conflict', `The upload is ${row.state}.`);

    let running = inflightComplete.get(id);
    if (running === undefined) {
      if (row.state === 'completing') return { ok: true, value: { kind: 'pending', value: view(row) } };
      const stats = db.prepare('SELECT COUNT(*) AS n FROM upload_chunks WHERE upload_id = ?').get(id) as { n: number };
      const have = Number(stats.n);
      if (have < row.chunk_count) return fail(409, 'conflict', `${row.chunk_count - have} of ${row.chunk_count} chunks have not arrived yet.`);
      // The chunk files and the finished blob coexist until the commit, so the volume needs the file's size again.
      if (!guard.check(row.declared_size).ok) return storageFull();
      const claimed = db.prepare("UPDATE uploads SET state = 'completing', updated_at = ? WHERE id = ? AND state = 'open'").run(now(), id);
      if (Number(claimed.changes) === 0) return fail(409, 'conflict', 'The upload changed while completing. Check its status.');
      running = assemble(row).finally(() => { inflightComplete.delete(id); });
      inflightComplete.set(id, running);
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'pending'>((resolve) => { timer = setTimeout(() => resolve('pending'), limits.completeWaitMs); });
    try {
      const outcome = await Promise.race([running, timeout]);
      if (outcome === 'pending') return { ok: true, value: { kind: 'pending', value: view(rowOf(id) as UploadRow) } };
      return outcome.ok ? { ok: true, value: { kind: 'complete', value: outcome.value } } : outcome;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  // ---- abort -------------------------------------------------------------------------------------------------------------------------------

  async function abort(principal: UploadPrincipal, id: string): Promise<UploadOutcome<{ aborted: boolean }>> {
    const row = owned(principal, id);
    if (row === undefined) return notFound();
    if (row.state === 'completing') return fail(409, 'conflict', 'The upload is being assembled. Wait for it to finish.');
    if (row.state !== 'open' && row.state !== 'complete') return { ok: true, value: { aborted: false } };
    if (row.state === 'complete' && row.attached_at !== null) return { ok: true, value: { aborted: false } }; // the blob now belongs to what attached it
    const at = now();
    let changed = false;
    transaction(db, () => {
      const result = db.prepare("UPDATE uploads SET state = 'aborted', updated_at = ? WHERE id = ? AND state IN ('open', 'complete') AND attached_at IS NULL").run(at, id);
      if (Number(result.changes) === 0) return;
      changed = true;
      db.prepare('DELETE FROM upload_chunks WHERE upload_id = ?').run(id);
      // Only this session's own reference goes; the immutable blob stays until the two-step garbage collection decides about it.
      if (row.state === 'complete' && row.blob_sha256 !== null) removeBlobRef(db, { sha256: row.blob_sha256, ownerKind: UPLOAD_BLOB_OWNER_KIND, ownerId: id, now: at });
      appendAuditOutbox(db, { event: 'upload.aborted', actorKind: 'owner', actorId: principal.id, dedupeKey: `upload.aborted:${id}`, now: at, detail: { uploadId: id, wasComplete: row.state === 'complete' } });
    });
    if (changed) {
      drain();
      await removeDir(id);
    }
    return { ok: true, value: { aborted: changed } };
  }

  // ---- expiry ------------------------------------------------------------------------------------------------------------------------------

  async function expire(): Promise<ExpireResult> {
    const result: ExpireResult = { expired: 0, releasedRefs: 0, removedDirs: 0, pruned: 0 };
    const at = now();
    const due = db.prepare("SELECT id FROM uploads WHERE state IN ('open', 'complete') AND attached_at IS NULL AND expires_at <= ? ORDER BY expires_at LIMIT ?").all(at, EXPIRE_BATCH) as Array<{ id: string }>;
    for (const { id } of due) {
      transaction(db, () => {
        const row = db.prepare(`SELECT ${COLUMNS} FROM uploads WHERE id = ?`).get(id) as UploadRow | undefined;
        if (row === undefined || (row.state !== 'open' && row.state !== 'complete') || row.attached_at !== null || row.expires_at > at) return;
        db.prepare("UPDATE uploads SET state = 'expired', updated_at = ? WHERE id = ?").run(at, id);
        db.prepare('DELETE FROM upload_chunks WHERE upload_id = ?').run(id);
        if (row.state === 'complete' && row.blob_sha256 !== null && removeBlobRef(db, { sha256: row.blob_sha256, ownerKind: UPLOAD_BLOB_OWNER_KIND, ownerId: id, now: at })) result.releasedRefs += 1;
        appendAuditOutbox(db, { event: 'upload.expired', actorKind: 'system', dedupeKey: `upload.expired:${id}`, now: at, detail: { uploadId: id, wasComplete: row.state === 'complete' } });
        result.expired += 1;
      });
      if (await removeDir(id)) result.removedDirs += 1;
    }

    // A reference held for a session that no longer exists (a restored Hub keeps `blob_refs` but scrubs `uploads`): release it.
    const orphans = db.prepare("SELECT blob_sha256, owner_id FROM blob_refs WHERE owner_kind = ? AND owner_id NOT IN (SELECT id FROM uploads)").all(UPLOAD_BLOB_OWNER_KIND) as Array<{ blob_sha256: string; owner_id: string }>;
    for (const orphan of orphans) {
      if (removeBlobRef(db, { sha256: orphan.blob_sha256, ownerKind: UPLOAD_BLOB_OWNER_KIND, ownerId: orphan.owner_id, now: at })) result.releasedRefs += 1;
    }

    // Chunk directories nobody can use: no session row, a final one, or a completed one (a crash between commit and cleanup), once past a grace period.
    let names: string[] = [];
    try { names = await readdir(rootDir); } catch (error) { if (!isCode(error, 'ENOENT')) throw error; }
    for (const name of names) {
      if (!UPLOAD_ID.test(name)) continue;
      const session = rowOf(name);
      if (session !== undefined && (session.state === 'open' || session.state === 'completing')) continue;
      let newest = 0;
      try {
        const info = await stat(dirOf(name));
        newest = info.mtimeMs;
      } catch { continue; }
      if (at - newest < DIR_GRACE_MS) continue;
      if (await removeDir(name)) result.removedDirs += 1;
    }

    const cutoff = at - limits.retentionMs;
    const pruned = db.prepare("DELETE FROM uploads WHERE ((state IN ('failed', 'aborted', 'expired')) OR attached_at IS NOT NULL) AND updated_at < ?").run(cutoff);
    result.pruned = Number(pruned.changes);
    if (result.expired > 0) drain();
    return result;
  }

  return { create, status, putChunk, complete, abort, expire };
}
