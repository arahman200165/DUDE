import { randomInt } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { BackupError, createBackupWriter, openBackupV2, openRepository, readRepositoryObject } from '@dude/hub-backup';
import type { BackupDeps, BackupRepository, BackupV2BlobEntry, BackupWriteResult, BackupWriter, ObjectSink, ObjectWriteStream } from '@dude/hub-backup';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import { BlobNotFoundError } from '../blobs/blob-store.js';
import type { BlobStore } from '../blobs/blob-store.js';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import { releaseBlobLease, renewBlobLease, tryAcquireBlobLease } from '../blobs/lease.js';
import { getAuthorityEpoch } from '../hub/authority.js';
import { updateDestinationState } from '../hub/backup-destination-state.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { audit as writeAuditRow } from '../security/audit.js';
import { backupFailureCode } from './backup-state.js';
import { destinationLockKey, tryLockDestination } from './destination-lock.js';
import { MANIFEST_PREFIX, PACK_PREFIX, backupIdOfManifest } from './destinations/destination.js';
import type { BackupDestination } from './destinations/destination.js';
import { HUB_SNAPSHOT_SPEC, SAVESPHERE_SNAPSHOT_SPEC, createScrubbedSnapshotFile } from './snapshot.js';
import type { SnapshotFile } from './snapshot.js';
import { TempIndex } from './temp-index.js';

/**
 * The backup v2 engine (32-SS1, Milestone 847, PD-150). One run writes one backup of the WHOLE Hub into one destination repository:
 *
 * 1. takes the `backup` blob lease (`blobs/lease.ts`), so garbage collection cannot delete a blob while the run reads the blob set;
 * 2. snapshots `dude.db` (scrubbed `VACUUM INTO`, `snapshot.ts`) FIRST, then `savesphere.db` with its own scrub list, and takes the
 *    blob set from THAT snapshot's `blobs`/`blob_refs` (never a directory listing): a blob added after the snapshot is not in it, and
 *    a blob whose last reference goes after the snapshot is still on disk because GC is fenced by the lease;
 * 3. streams both snapshots and `hub.json` as file entries and every referenced blob as a blob entry; a blob the previous manifest
 *    (the dedupe index, streamed into a temp SQLite file) already holds is recorded by reference (its extents may point into
 *    earlier packs), so only new blobs are written into new packs;
 * 4. commits the manifest LAST (the backup's commit point);
 * 5. verifies on write: re-reads the new objects (`verify({ scope: 'new' })`) and fully reads a few deduplicated blobs; a backup that
 *    fails is deleted again and never recorded as successful;
 * 6. releases the lease and records the result (per-destination state, audit `backup.v2-created` and `backup.v2-verified`, or
 *    `backup.v2-failed` with a short code).
 *
 * Crash safety: every object the run commits is listed in a journal (`dude.db` meta `backup_dest_journal:<id>`) until the run is
 * recorded; the next run (or prune) deletes the leftovers of a run that never finished, so a kill between the packs and the
 * manifest leaves no manifest and its packs are swept. Memory is bounded by chunks: snapshots are files, blobs are streams and the
 * dedupe index is on disk. Nothing here logs or records a key, a passphrase or a path.
 */
export const BACKUP_V2_DB_FILE = 'dude.db';
export const BACKUP_V2_SAVESPHERE_FILE = 'savesphere.db';
export const BACKUP_V2_CONFIG_FILE = 'hub.json';
export const BACKUP_JOURNAL_PREFIX = 'backup_dest_journal:';
/** Deduplicated blobs fully re-read after each run (verify-on-write of the references). */
export const BACKUP_SPOT_CHECKS = 4;
const LEASE_RENEW_MS = 60_000;
const READ_PIECE = 1024 * 1024;
const INCOMPLETE_MAX_AGE_MS = 3600_000;

export type BackupRunErrorCode =
  | 'busy'
  | 'blob-lease-held'
  | 'repository-missing'
  | 'repository-key-mismatch'
  | 'verification-failed'
  | 'master-key-missing'
  | 'master-key-unreadable'
  | 'no-destination';

/** A refusal or failure with a stable, credential-free code. */
export class BackupRunError extends Error {
  constructor(readonly code: BackupRunErrorCode, message: string) {
    super(message);
    this.name = 'BackupRunError';
  }
}

/** Spec-only: models a killed process (no cleanup, no record). Production code never throws it. */
export class SimulatedCrash extends Error {
  constructor() {
    super('simulated crash');
    this.name = 'SimulatedCrash';
  }
}

export interface BackupRunHooks {
  /** After both snapshots, before any byte is written (consistency and GC-lease specs). */
  afterSnapshots?(): void | Promise<void>;
  /** After every entry, before the manifest commit (crash injection). */
  beforeManifest?(): void | Promise<void>;
  /** After the manifest commit, before verify-on-write (failure injection). */
  afterManifest?(): void | Promise<void>;
}

export type BackupV2AuditEvent = 'backup.v2-created' | 'backup.v2-failed' | 'backup.v2-verified';
export type BackupV2AuditFn = (event: BackupV2AuditEvent, outcome: 'success' | 'failure', detail: Record<string, unknown>) => void;

/** A short, stable failure code (never a message, which can name a folder). */
export function backupRunFailureCode(error: unknown): string {
  if (error instanceof BackupRunError) return error.code;
  if (error instanceof BlobNotFoundError) return 'blob-missing';
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[a-z][a-z-]{1,40}$/.test(code)) return code;
  return backupFailureCode(error);
}

async function* fileChunks(file: string): AsyncGenerator<Uint8Array> {
  const stream = createReadStream(file, { highWaterMark: READ_PIECE });
  try {
    for await (const chunk of stream) yield chunk as Uint8Array;
  } finally {
    stream.destroy();
  }
}

/** Reservoir sample of at most `size` items, in O(size) memory. */
class Reservoir<T> {
  readonly items: T[] = [];
  private seen = 0;
  constructor(private readonly size: number) {}
  offer(item: T): void {
    this.seen += 1;
    if (this.items.length < this.size) this.items.push(item);
    else {
      const slot = randomInt(this.seen);
      if (slot < this.size) this.items[slot] = item;
    }
  }
}

/** Wraps a sink so the run knows every object it committed (the journal) and how many bytes it sent. */
function trackingSink(inner: ObjectSink, onCommit: (name: string, bytes: number) => void): ObjectSink {
  return {
    async create(name: string): Promise<ObjectWriteStream> {
      const out = await inner.create(name);
      let bytes = 0;
      return {
        write: async (chunk) => { await out.write(chunk); bytes += chunk.length; },
        commit: async () => { await out.commit(); onCommit(name, bytes); },
        abort: () => out.abort(),
      };
    },
  };
}

export interface SnapshotBackupOptions {
  db: Db;
  paths: HubPaths;
  hubVersion: string;
  hubInstanceId: string;
  forTransfer: boolean;
  repository: BackupRepository;
  sink: ObjectSink;
  deps: BackupDeps;
  now: () => number;
  /** The Hub's live `savesphere.db` connection; when absent and the file exists, the run opens (and closes) its own. */
  saveSphereDb?: Db;
  blobStore: Pick<BlobStore, 'open'>;
  beforeSnapshot?: () => void;
  workDir: string;
  /** The dedupe index of the previous manifest (absent: every blob is written). */
  previous?: TempIndex;
  chunkSize?: number;
  packBytes?: number;
  hooks?: BackupRunHooks;
  /** Called once the writer exists (the journal starts here). */
  onStarted?: (backupId: string) => void;
}

export interface SnapshotBackupResult {
  write: BackupWriteResult;
  newBlobs: number;
  reusedBlobs: number;
  skippedBlobs: { missing: number; corrupt: number };
  reusedSample: BackupV2BlobEntry[];
}

/**
 * The shared core of a destination run and of the single-file export: lease, snapshots, entries, manifest. The caller owns the
 * repository and the sink; on failure the writer is aborted (committed packs stay for the caller's cleanup).
 */
export async function writeSnapshotBackup(options: SnapshotBackupOptions): Promise<SnapshotBackupResult> {
  let ownSaveSphere: { close(): void } | undefined;
  let sdb = options.saveSphereDb;
  if (sdb === undefined && existsSync(options.paths.saveSphereDbPath)) {
    const opened = openSaveSphereDb(options.paths);
    if (opened.status !== 'ready') throw new BackupError('integrity', 'The SaveSphere database could not be opened for the backup.');
    sdb = opened.store.db;
    ownSaveSphere = opened.store;
  }
  let leased = false;
  let renewTimer: NodeJS.Timeout | undefined;
  const snapshots: SnapshotFile[] = [];
  let writer: BackupWriter | undefined;
  let finished = false;
  try {
    if (sdb !== undefined) {
      const lease = tryAcquireBlobLease(sdb, 'backup', options.now());
      if (!lease.acquired) throw new BackupRunError('blob-lease-held', 'The blob store is held by garbage collection; the backup will run again later.');
      leased = true;
      const leaseDb = sdb;
      renewTimer = setInterval(() => { try { renewBlobLease(leaseDb, 'backup', options.now()); } catch { /* the lease expires on its own */ } }, LEASE_RENEW_MS);
      renewTimer.unref();
    }

    options.beforeSnapshot?.();
    const hubSnap = await createScrubbedSnapshotFile(options.db, options.workDir, HUB_SNAPSHOT_SPEC);
    snapshots.push(hubSnap);
    const ssSnap = sdb === undefined ? undefined : await createScrubbedSnapshotFile(sdb, options.workDir, SAVESPHERE_SNAPSHOT_SPEC);
    if (ssSnap) snapshots.push(ssSnap);
    await options.hooks?.afterSnapshots?.();

    const counts: Record<string, number> = { ...hubSnap.counts };
    if (ssSnap) for (const [table, n] of Object.entries(ssSnap.counts)) counts[`savesphere.${table}`] = n;
    const configBytes = existsSync(options.paths.configFile) ? new Uint8Array(readFileSync(options.paths.configFile)) : new TextEncoder().encode('{}');

    writer = await createBackupWriter({
      sink: options.sink, deps: options.deps, repository: options.repository,
      metadata: {
        hubVersion: options.hubVersion,
        source: { hubInstanceId: options.hubInstanceId, authorityEpoch: getAuthorityEpoch(options.db), schemaVersion: hubSnap.schemaVersion, dbMinReaderVersion: hubSnap.dbMinReaderVersion },
        forTransfer: options.forTransfer,
        counts,
      },
      ...(options.chunkSize !== undefined ? { chunkSize: options.chunkSize } : {}),
      ...(options.packBytes !== undefined ? { packBytes: options.packBytes } : {}),
    });
    options.onStarted?.(writer.backupId);

    await writer.addFile(BACKUP_V2_DB_FILE, fileChunks(hubSnap.file));
    if (ssSnap) await writer.addFile(BACKUP_V2_SAVESPHERE_FILE, fileChunks(ssSnap.file));
    await writer.addFile(BACKUP_V2_CONFIG_FILE, [configBytes]);

    let newBlobs = 0;
    let reusedBlobs = 0;
    const skippedBlobs = { missing: 0, corrupt: 0 };
    const sample = new Reservoir<BackupV2BlobEntry>(BACKUP_SPOT_CHECKS);
    if (ssSnap) {
      const copy = new DatabaseSync(ssSnap.file, { readOnly: true });
      try {
        const hasBlobs = copy.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'blobs'").get() !== undefined;
        const rows = hasBlobs ? copy.prepare('SELECT sha256, size FROM blobs ORDER BY sha256').iterate() : [];
        for (const raw of rows) {
          const row = raw as { sha256: string; size: number | bigint };
          const size = Number(row.size);
          const known = options.previous?.getBlob(options.repository.dedupeId(row.sha256)) ?? null;
          if (known !== null && known.sha256 === row.sha256 && known.size === size) {
            await writer.addBlobRef(known);
            reusedBlobs += 1;
            sample.offer(known);
            continue;
          }
          let stream: AsyncIterable<Uint8Array>;
          try {
            stream = await options.blobStore.open(row.sha256);
          } catch (error) {
            if (error instanceof BlobNotFoundError) { skippedBlobs.missing += 1; continue; }
            throw error;
          }
          try {
            await writer.addBlob(stream, { sha256: row.sha256, size });
            newBlobs += 1;
          } catch (error) {
            // A blob whose bytes no longer match its name is skipped (the restore marks it missing); the writer stays usable.
            if (error instanceof BackupError && error.code === 'integrity') { skippedBlobs.corrupt += 1; continue; }
            throw error;
          } finally {
            (stream as { destroy?: () => void }).destroy?.();
          }
        }
      } finally {
        copy.close();
      }
    }

    await options.hooks?.beforeManifest?.();
    const write = await writer.finish();
    finished = true;
    return { write, newBlobs, reusedBlobs, skippedBlobs, reusedSample: sample.items };
  } catch (error) {
    if (!finished && writer !== undefined && !(error instanceof SimulatedCrash)) await writer.abort().catch(() => undefined);
    throw error;
  } finally {
    if (renewTimer !== undefined) clearInterval(renewTimer);
    for (const snapshot of snapshots) snapshot.dispose();
    if (leased && sdb !== undefined) {
      try { releaseBlobLease(sdb, 'backup'); } catch { /* it expires on its own */ }
    }
    ownSaveSphere?.close();
  }
}

interface Journal { backupId: string | null; objects: string[] }

const journalKey = (destinationId: string): string => `${BACKUP_JOURNAL_PREFIX}${destinationId}`;

export function readJournal(db: Db, destinationId: string): Journal | null {
  const raw = getMeta(db, journalKey(destinationId));
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as { backupId?: unknown; objects?: unknown };
    const objects = Array.isArray(parsed.objects) ? parsed.objects.filter((o): o is string => typeof o === 'string') : [];
    return { backupId: typeof parsed.backupId === 'string' ? parsed.backupId : null, objects };
  } catch {
    return { backupId: null, objects: [] };
  }
}

function writeJournal(db: Db, destinationId: string, journal: Journal): void {
  setMeta(db, journalKey(destinationId), JSON.stringify(journal));
}

function clearJournal(db: Db, destinationId: string): void {
  db.prepare('DELETE FROM meta WHERE key = ?').run(journalKey(destinationId));
}

/**
 * Deletes what an unfinished run committed (its manifest first, then its packs) and clears the journal. A run that never recorded
 * success never counts, even if its manifest was committed: it was not verified. Returns how many objects were removed.
 */
export async function sweepJournal(db: Db, destination: BackupDestination): Promise<number> {
  const journal = readJournal(db, destination.id);
  if (journal === null) return 0;
  const ordered = [...journal.objects.filter((o) => o.startsWith(MANIFEST_PREFIX)), ...journal.objects.filter((o) => !o.startsWith(MANIFEST_PREFIX))];
  for (const name of ordered) await destination.deleteObject(name);
  clearJournal(db, destination.id);
  return ordered.length;
}

/** The newest manifest of the destination whose blob entries all stream into `index`; null when there is none (a full backup). */
async function loadPreviousIndex(destination: BackupDestination, repository: BackupRepository, deps: BackupDeps, index: TempIndex, skip: string | null): Promise<string | null> {
  const manifests = (await destination.list(MANIFEST_PREFIX)).map((m) => backupIdOfManifest(m.name)).filter((id): id is string => id !== null && id !== skip);
  for (const backupId of manifests.reverse()) {
    index.clearBlobs();
    try {
      const reader = await openBackupV2(destination.source(), backupId, { repository }, deps);
      try {
        const batch: BackupV2BlobEntry[] = [];
        const flush = (): void => { index.batch(() => { for (const entry of batch) index.putBlob(entry); }); batch.length = 0; };
        for await (const entry of reader.listEntries()) {
          if (entry.kind !== 'blob') continue;
          batch.push(entry);
          if (batch.length >= 500) flush();
        }
        flush();
      } finally {
        reader.close();
      }
      return backupId;
    } catch {
      /* an unreadable manifest is skipped: dedupe falls back to an older one or to a full backup */
    }
  }
  index.clearBlobs();
  return null;
}

export interface RunBackupV2Options {
  db: Db;
  paths: HubPaths;
  hubVersion: string;
  hubInstanceId: string;
  destination: BackupDestination;
  /** The Hub's master key (from the secret store); the caller zeroes its copy. */
  masterKey: Uint8Array;
  deps: BackupDeps;
  now?: () => number;
  trigger: 'schedule' | 'manual';
  saveSphereDb?: Db;
  blobStore?: Pick<BlobStore, 'open'>;
  beforeSnapshot?: () => void;
  /** Default: writes the audit row (system actor for the schedule, cli for a manual run). */
  audit?: BackupV2AuditFn;
  workDir?: string;
  chunkSize?: number;
  packBytes?: number;
  hooks?: BackupRunHooks;
}

export interface RunBackupV2Result {
  destinationId: string;
  backupId: string;
  repoId: string;
  files: number;
  blobs: number;
  newBlobs: number;
  reusedBlobs: number;
  skippedBlobs: number;
  packs: number;
  /** Bytes sent to the destination by this run (packs and manifest). */
  bytesWritten: number;
  /** Of those, bytes of pack objects. */
  packBytesWritten: number;
  /** Plaintext bytes of every entry of the backup (referenced blobs included). */
  backupBytes: number;
}

/**
 * One backup into one destination, recorded and audited. Refuses with `busy` (and records nothing) when another operation holds
 * the destination; every other failure is recorded as a failure of this destination and rethrown as is.
 */
export async function runBackupV2(options: RunBackupV2Options): Promise<RunBackupV2Result> {
  const now = options.now ?? Date.now;
  const destination = options.destination;
  const workDir = options.workDir ?? path.join(options.paths.backupsDir, '.tmp');
  const writeAudit: BackupV2AuditFn = options.audit
    ?? ((event, outcome, detail) => writeAuditRow(options.db, { event, outcome, actorKind: options.trigger === 'schedule' ? 'system' : 'cli', detail, now: now() }));
  const safeAudit: BackupV2AuditFn = (event, outcome, detail) => { try { writeAudit(event, outcome, detail); } catch { /* an audit failure must not break a run */ } };
  const lock = tryLockDestination(destinationLockKey(options.paths.root, destination.id), 'backup');
  if ('heldBy' in lock) throw new BackupRunError('busy', `Another backup operation (${lock.heldBy}) is running on this destination.`);

  let repository: BackupRepository | undefined;
  const index = new TempIndex(workDir);
  const committed: string[] = [];
  let bytesWritten = 0;
  let packBytesWritten = 0;
  let journalOpen = false;
  const at = (): string => new Date(now()).toISOString();
  updateDestinationState(options.db, destination.id, { lastAttemptAt: at() });
  try {
    await sweepJournal(options.db, destination);
    await destination.sweepIncomplete?.(INCOMPLETE_MAX_AGE_MS, now());

    if ((await destination.stat('repo')) === null) throw new BackupRunError('repository-missing', 'The destination has no backup repository; add it again with the passphrase.');
    try {
      repository = await openRepository(await readRepositoryObject(destination.source()), { masterKey: options.masterKey }, options.deps);
    } catch (error) {
      if (error instanceof BackupError && error.code === 'wrong-passphrase-or-corrupt') throw new BackupRunError('repository-key-mismatch', 'The destination repository was made with another key; add it again with its passphrase.');
      throw error;
    }
    const repo = repository;
    await loadPreviousIndex(destination, repo, options.deps, index, null);

    let journalBackupId: string | null = null;
    const sink = trackingSink(destination.sink(), (name, bytes) => {
      committed.push(name);
      bytesWritten += bytes;
      if (name.startsWith(PACK_PREFIX)) packBytesWritten += bytes;
      writeJournal(options.db, destination.id, { backupId: journalBackupId, objects: committed });
    });
    const written = await writeSnapshotBackup({
      db: options.db, paths: options.paths, hubVersion: options.hubVersion, hubInstanceId: options.hubInstanceId, forTransfer: false,
      repository: repo, sink, deps: options.deps, now, blobStore: options.blobStore ?? createLocalBlobStore(options.paths), workDir, previous: index,
      ...(options.saveSphereDb !== undefined ? { saveSphereDb: options.saveSphereDb } : {}),
      ...(options.beforeSnapshot !== undefined ? { beforeSnapshot: options.beforeSnapshot } : {}),
      ...(options.chunkSize !== undefined ? { chunkSize: options.chunkSize } : {}),
      ...(options.packBytes !== undefined ? { packBytes: options.packBytes } : {}),
      ...(options.hooks !== undefined ? { hooks: options.hooks } : {}),
      onStarted: (backupId) => {
        journalBackupId = backupId;
        journalOpen = true;
        writeJournal(options.db, destination.id, { backupId, objects: committed });
      },
    });
    await options.hooks?.afterManifest?.();

    // Verify on write: the new objects end to end, then a sample of the deduplicated references in full.
    let verifiedPacks = 0;
    try {
      const reader = await openBackupV2(destination.source(), written.write.backupId, { repository: repo }, options.deps);
      try {
        verifiedPacks = (await reader.verify({ scope: 'new' })).packs;
        for (const entry of written.reusedSample) for await (const piece of reader.readEntry(entry)) piece.fill(0);
      } finally {
        reader.close();
      }
    } catch (error) {
      throw new BackupRunError('verification-failed', `The backup failed verification after it was written (${backupRunFailureCode(error)}).`);
    }

    clearJournal(options.db, destination.id);
    journalOpen = false;
    let repoBytes = 0;
    try {
      for (const prefix of [PACK_PREFIX, MANIFEST_PREFIX] as const) for (const object of await destination.list(prefix)) repoBytes += object.size;
      repoBytes += (await destination.stat('repo'))?.size ?? 0;
    } catch { /* a size is informational */ }
    const result: RunBackupV2Result = {
      destinationId: destination.id, backupId: written.write.backupId, repoId: repo.repoId, files: written.write.files, blobs: written.write.blobs,
      newBlobs: written.newBlobs, reusedBlobs: written.reusedBlobs, skippedBlobs: written.skippedBlobs.missing + written.skippedBlobs.corrupt,
      packs: written.write.packIds.length, bytesWritten, packBytesWritten, backupBytes: written.write.bytes,
    };
    const doneAt = at();
    updateDestinationState(options.db, destination.id, {
      lastOutcome: 'success', lastSuccessAt: doneAt, lastBackupId: result.backupId, lastVerifiedAt: doneAt, repoId: result.repoId, repoBytes, lastWrittenBytes: bytesWritten,
    });
    const detail = { destination: destination.id, backupId: result.backupId, files: result.files, blobs: result.blobs, newBlobs: result.newBlobs, reusedBlobs: result.reusedBlobs, skippedBlobs: result.skippedBlobs, bytes: bytesWritten, trigger: options.trigger };
    safeAudit('backup.v2-created', 'success', detail);
    safeAudit('backup.v2-verified', 'success', { destination: destination.id, backupId: result.backupId, scope: 'new', packs: verifiedPacks, spotChecks: written.reusedSample.length, trigger: options.trigger });
    return result;
  } catch (error) {
    if (error instanceof SimulatedCrash) throw error;
    if (journalOpen || committed.length > 0) {
      // This run's own objects (an unverified manifest first, then its packs). If the cleanup fails, the journal keeps them for the next run.
      try { await sweepJournal(options.db, destination); } catch { /* left in the journal */ }
    }
    const code = backupRunFailureCode(error);
    updateDestinationState(options.db, destination.id, { lastOutcome: 'failure', lastErrorAt: at(), lastError: code });
    safeAudit('backup.v2-failed', 'failure', { destination: destination.id, reason: code, trigger: options.trigger });
    throw error;
  } finally {
    index.close();
    repository?.close();
    lock.release();
  }
}
