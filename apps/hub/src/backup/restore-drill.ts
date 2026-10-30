import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statfsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BackupError, openBackupV2, openRepository, readRepositoryObject } from '@dude/hub-backup';
import type { BackupDeps, BackupRepository, ObjectSource } from '@dude/hub-backup';
import type { Db } from '@dude/sqlite-store';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import type { HubBackupDestinationConfig, HubConfig } from '../config/hub-config.js';
import { readDestinationState, updateDestinationState } from '../hub/backup-destination-state.js';
import { nextDrillDueAt } from '../hub/backup-health.js';
import type { JobHandle, JobRunReport } from '../jobs/job-status.js';
import { audit as writeAuditRow } from '../security/audit.js';
import { destinationLockKey, tryLockDestination } from './destination-lock.js';
import { DestinationError, MANIFEST_PREFIX, backupIdOfManifest } from './destinations/destination.js';
import type { BackupDestination } from './destinations/destination.js';
import { openBackupDestination } from './destinations/index.js';
import type { MasterKeyStore } from './master-key.js';
import { RestoreError, applyRestore, previewRestore } from './restore.js';
import { backupRunFailureCode, readJournal } from './run-backup-v2.js';

/**
 * The restore drill (32-SS1, Milestone 850, PD-150): proves that a destination's newest VERIFIED backup actually restores. For one
 * destination it
 *
 * 1. takes the destination lock as `drill` (a running backup, prune, re-wrap or remove means the drill is skipped, never queued
 *    behind it; while the drill holds it, a backup of that destination answers `busy` and the scheduler retries it later);
 * 2. picks the newest manifest that is not named in the destination's unrecorded-run journal (a committed but unverified manifest
 *    never counts, exactly as for the standby);
 * 3. verifies that backup in full (`verify({ scope: 'full' })`: every referenced pack end to end);
 * 4. restores it with the OFFLINE restore engine (`previewRestore` then `applyRestore`, the 31G rules: new identity, epoch + 1,
 *    devices to re-pair, transient state cleared, `hub.json` reduced) into a fresh scratch Hub root under
 *    `backups/.tmp/restore-drill/` with the held master key: never the live data directory, never `replace` (the scratch target is
 *    always empty), and the "old Hub is gone" acknowledgement is given only because the scratch root is never started as a Hub;
 * 5. runs `PRAGMA integrity_check` on BOTH restored databases and checks the restored blob set against the manifest (every blob the
 *    manifest lists is present and was streamed through its SHA-256 by the restore; catalogue rows the backup could not carry are
 *    counted as `missingBlobs`);
 * 6. records the verdict per destination (`backup_dest_state:<id>`: `lastDrillAt`, `lastDrillOutcome`, `lastDrillBackupId`,
 *    `lastDrillError`, and `lastVerifiedAt` on a pass) and audits `backup.drill-passed` or `backup.drill-failed` (ids, counts and a
 *    short code only);
 * 7. ALWAYS removes the scratch directory; a drill killed with the process leaves one, which the next drill (and the queue at Hub
 *    start) sweeps.
 *
 * The drill never writes to a destination (it sees it through a read-only view whose writers throw), never touches the live
 * databases or blob store, and needs no confirmation: it is not destructive. Memory is bounded by the restore engine's streaming;
 * disk is bounded by refusing (`insufficient-space`) when the scratch volume cannot hold the restored Hub with headroom.
 */
export const RESTORE_DRILL_DIR = 'restore-drill';
/** Free space kept on the scratch volume beyond what the restored Hub needs. */
export const RESTORE_DRILL_HEADROOM_BYTES = 256 * 1024 * 1024;
/** What the restored Hub needs on disk, as a multiple of the backup's plaintext bytes (pre-migration copies, WAL, file-system slack). */
export const RESTORE_DRILL_SPACE_FACTOR = 1.25;

export type RestoreDrillAuditEvent = 'backup.drill-passed' | 'backup.drill-failed';
export type RestoreDrillAuditFn = (event: RestoreDrillAuditEvent, outcome: 'success' | 'failure', detail: Record<string, unknown>) => void;

export interface RestoreDrillResult {
  destinationId: string;
  /** `skipped`: nothing was recorded (`reason` `busy` or `no-backup`). */
  outcome: 'passed' | 'failed' | 'skipped';
  /** The short code of a failure or the reason for a skip. */
  reason?: string;
  backupId?: string;
  blobs?: number;
  /** Catalogued blobs the backup could not carry (missing or corrupt on the Hub when it ran); restored as `missing`. */
  missingBlobs?: number;
  bytes?: number;
  packs?: number;
}

/** A drill refusal with a stable, credential-free code. */
export class RestoreDrillError extends Error {
  constructor(readonly code: 'insufficient-space' | 'integrity-failed' | 'blob-set-mismatch' | 'read-only' | 'aborted', message: string) {
    super(message);
    this.name = 'RestoreDrillError';
  }
}

export interface RestoreDrillHooks {
  /** After the restore and before the checks (failure and crash injection in specs). */
  afterRestore?(scratchRoot: string): void | Promise<void>;
}

export interface RunRestoreDrillOptions {
  db: Db;
  paths: HubPaths;
  destination: BackupDestination;
  /** The Hub's master key (from the secret store); the caller zeroes its copy. */
  masterKey: Uint8Array;
  deps: BackupDeps;
  trigger: 'schedule' | 'manual';
  now?: () => number;
  /** Aborts between pieces of the restore; a `shutdown` or `lease-lost` reason records nothing, any other (a timeout) is a failure. */
  signal?: AbortSignal;
  audit?: RestoreDrillAuditFn;
  /** Free bytes on the volume holding `dir`, or null when unknown (default `statfs`). */
  freeSpace?: (dir: string) => number | null;
  hooks?: RestoreDrillHooks;
}

/** Scratch directories in use by a drill of this process (a sweep leaves them alone). */
const activeScratch = new Set<string>();

export const restoreDrillScratchRoot = (paths: Pick<HubPaths, 'backupsDir'>): string => path.join(paths.backupsDir, '.tmp', RESTORE_DRILL_DIR);

const removeTree = (dir: string): void => { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); };

/** Removes the scratch directories a killed drill left behind (never one a running drill of this process uses). Returns how many. */
export function sweepRestoreDrillScratch(paths: Pick<HubPaths, 'backupsDir'>): number {
  const root = restoreDrillScratchRoot(paths);
  let removed = 0;
  let names: string[];
  try { names = readdirSync(root); } catch { return 0; }
  for (const name of names) {
    const dir = path.join(root, name);
    if (activeScratch.has(path.resolve(dir))) continue;
    try { removeTree(dir); removed += 1; } catch { /* retried by the next sweep */ }
  }
  return removed;
}

function defaultFreeSpace(dir: string): number | null {
  try {
    const stats = statfsSync(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

const abortReason = (signal: AbortSignal | undefined): string | null => {
  if (signal === undefined || !signal.aborted) return null;
  const reason = (signal.reason as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason : 'aborted';
};

async function* abortable(source: AsyncIterable<Uint8Array>, signal: AbortSignal | undefined): AsyncGenerator<Uint8Array> {
  for await (const piece of source) {
    if (signal?.aborted) throw new RestoreDrillError('aborted', 'The restore drill was stopped.');
    yield piece;
  }
}

/** The destination as the drill sees it: reads only (checked against the abort signal); every writer throws. */
function readOnlyView(destination: BackupDestination, signal: AbortSignal | undefined): BackupDestination {
  const refuse = (): never => { throw new RestoreDrillError('read-only', 'The restore drill never writes to a backup destination.'); };
  const source: ObjectSource = { read: (name, start) => abortable(destination.source().read(name, start), signal) };
  return {
    id: destination.id,
    kind: destination.kind,
    label: destination.label,
    sink: refuse,
    source: () => source,
    list: (prefix) => destination.list(prefix),
    stat: (name) => destination.stat(name),
    deleteObject: async () => refuse(),
    replaceRepo: async () => refuse(),
    probe: () => destination.probe(),
  };
}

/** The newest manifest the destination holds that no unrecorded run owns (so it was verified on write), or null. */
export async function newestVerifiedBackupId(db: Db, destination: BackupDestination): Promise<string | null> {
  const journal = readJournal(db, destination.id);
  const unverified = new Set(journal?.objects ?? []);
  if (journal?.backupId) unverified.add(`${MANIFEST_PREFIX}${journal.backupId}`);
  const ids = (await destination.list(MANIFEST_PREFIX)).filter((m) => !unverified.has(m.name)).map((m) => backupIdOfManifest(m.name)).filter((id): id is string => id !== null);
  return ids.at(-1) ?? null;
}

function integrityOk(file: string): boolean {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
    return rows.length === 1 && Object.values(rows[0]!)[0] === 'ok';
  } finally {
    db.close();
  }
}

/** Blob files in a content-addressed store (`<aa>/<bb>/<sha256>`), counted without holding the names. */
function countBlobFiles(blobsDir: string): number {
  if (!existsSync(blobsDir)) return 0;
  let count = 0;
  for (const a of readdirSync(blobsDir, { withFileTypes: true })) {
    if (!a.isDirectory()) continue;
    for (const b of readdirSync(path.join(blobsDir, a.name), { withFileTypes: true })) {
      if (!b.isDirectory()) continue;
      for (const file of readdirSync(path.join(blobsDir, a.name, b.name), { withFileTypes: true })) if (file.isFile() && /^[0-9a-f]{64}$/.test(file.name)) count += 1;
    }
  }
  return count;
}

function missingCatalogued(saveSphereDb: string): number {
  if (!existsSync(saveSphereDb)) return 0;
  const db = new DatabaseSync(saveSphereDb, { readOnly: true });
  try {
    if (db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'blobs'").get() === undefined) return 0;
    return Number((db.prepare("SELECT COUNT(*) AS n FROM blobs WHERE state = 'missing'").get() as { n: number | bigint }).n);
  } finally {
    db.close();
  }
}

/** A short, stable, credential-free code for a failed drill (never a message, which can name a folder). */
export function restoreDrillFailureCode(error: unknown): string {
  if (error instanceof RestoreDrillError) return error.code;
  if (error instanceof RestoreError) return error.code;
  if (error instanceof DestinationError) return error.code;
  if (error instanceof BackupError) return error.code === 'wrong-passphrase-or-corrupt' ? 'repository-key-mismatch' : error.code;
  return backupRunFailureCode(error);
}

/**
 * One restore drill of one destination, recorded and audited (see the module comment). Never throws for a drill that failed: the
 * failure is the result. Throws only when the signal reported a shutdown or a lost lease (nothing is recorded then).
 */
export async function runRestoreDrill(options: RunRestoreDrillOptions): Promise<RestoreDrillResult> {
  const now = options.now ?? Date.now;
  const destinationId = options.destination.id;
  const writeAudit: RestoreDrillAuditFn = options.audit
    ?? ((event, outcome, detail) => writeAuditRow(options.db, { event, outcome, actorKind: options.trigger === 'schedule' ? 'system' : 'cli', detail, now: now() }));
  const safeAudit: RestoreDrillAuditFn = (event, outcome, detail) => { try { writeAudit(event, outcome, detail); } catch { /* an audit failure must not break a drill */ } };
  const lock = tryLockDestination(destinationLockKey(options.paths.root, destinationId), 'drill');
  if ('heldBy' in lock) return { destinationId, outcome: 'skipped', reason: 'busy' };

  const view = readOnlyView(options.destination, options.signal);
  const scratchParent = restoreDrillScratchRoot(options.paths);
  let scratch: string | null = null;
  let backupId: string | null = null;
  let repository: BackupRepository | undefined;
  try {
    sweepRestoreDrillScratch(options.paths);
    backupId = await newestVerifiedBackupId(options.db, view);
    if (backupId === null) return { destinationId, outcome: 'skipped', reason: 'no-backup' };

    // A full verify of the chosen backup first: every referenced pack end to end (the restore below reads every entry too).
    repository = await openRepository(await readRepositoryObject(view.source()), { masterKey: options.masterKey }, options.deps);
    const reader = await openBackupV2(view.source(), backupId, { repository }, options.deps);
    let packs: number;
    try {
      packs = (await reader.verify({ scope: 'full' })).packs;
    } finally {
      reader.close();
    }

    mkdirSync(scratchParent, { recursive: true });
    scratch = path.resolve(scratchParent, `drill-${randomBytes(8).toString('hex')}`);
    activeScratch.add(scratch);
    mkdirSync(scratch, { recursive: false });
    const preview = await previewRestore({ destination: view, backupId, masterKey: options.masterKey, dataRoot: scratch, deps: options.deps, now });
    const bytes = preview.summary.bytes ?? 0;
    const free = (options.freeSpace ?? defaultFreeSpace)(scratch);
    if (free !== null && free < Math.ceil(bytes * RESTORE_DRILL_SPACE_FACTOR) + RESTORE_DRILL_HEADROOM_BYTES) {
      throw new RestoreDrillError('insufficient-space', 'The scratch volume cannot hold the restored Hub.');
    }
    // `oldHubGoneConfirmed`: the scratch root is never started as a Hub, so the "two Hubs" hazard the phrase guards against cannot arise.
    await applyRestore({ destination: view, backupId, masterKey: options.masterKey, dataRoot: scratch, confirmToken: preview.confirmToken, oldHubGoneConfirmed: true, deps: options.deps, now });
    await options.hooks?.afterRestore?.(scratch);

    const restored = hubPaths(scratch);
    if (!integrityOk(restored.dbFile)) throw new RestoreDrillError('integrity-failed', 'The restored Hub database failed its integrity check.');
    if (existsSync(restored.saveSphereDbPath) && !integrityOk(restored.saveSphereDbPath)) throw new RestoreDrillError('integrity-failed', 'The restored SaveSphere database failed its integrity check.');
    const blobs = preview.summary.blobs ?? 0;
    if (countBlobFiles(restored.blobsDir) !== blobs) throw new RestoreDrillError('blob-set-mismatch', 'The restored blob set does not match the backup manifest.');
    const missingBlobs = missingCatalogued(restored.saveSphereDbPath);

    const at = new Date(now()).toISOString();
    updateDestinationState(options.db, destinationId, { lastDrillAt: at, lastDrillOutcome: 'success', lastDrillSuccessAt: at, lastDrillBackupId: backupId, lastVerifiedAt: at });
    safeAudit('backup.drill-passed', 'success', { destination: destinationId, backupId, blobs, missingBlobs, bytes, packs, trigger: options.trigger });
    return { destinationId, outcome: 'passed', backupId, blobs, missingBlobs, bytes, packs };
  } catch (error) {
    const aborted = abortReason(options.signal);
    if (aborted === 'shutdown' || aborted === 'lease-lost') throw error;
    const code = aborted !== null ? 'timeout' : restoreDrillFailureCode(error);
    try {
      updateDestinationState(options.db, destinationId, { lastDrillAt: new Date(now()).toISOString(), lastDrillOutcome: 'failure', lastDrillError: code, ...(backupId !== null ? { lastDrillBackupId: backupId } : {}) });
    } catch { /* best effort */ }
    safeAudit('backup.drill-failed', 'failure', { destination: destinationId, ...(backupId !== null ? { backupId } : {}), reason: code, trigger: options.trigger });
    return { destinationId, outcome: 'failed', reason: code, ...(backupId !== null ? { backupId } : {}) };
  } finally {
    repository?.close();
    if (scratch !== null) {
      try { removeTree(scratch); } catch { /* the next drill sweeps it */ }
      activeScratch.delete(scratch);
    }
    lock.release();
  }
}

export interface RestoreDrillServiceOptions {
  db: Db;
  paths: HubPaths;
  /** Reads the CURRENT config (destinations) on every run. */
  readConfig: () => HubConfig;
  masterKeys: MasterKeyStore;
  deps: BackupDeps;
  now?: () => number;
  /** Default: `openBackupDestination` with the secret store under `paths`. */
  openDestination?: (definition: HubBackupDestinationConfig) => BackupDestination;
  audit?: RestoreDrillAuditFn;
  freeSpace?: (dir: string) => number | null;
  hooks?: RestoreDrillHooks;
  /** Called after any drill recorded a verdict (the backup-health notifications re-evaluate). Observation only. */
  onRecorded?: () => void;
}

export interface RestoreDrillReport {
  results: RestoreDrillResult[];
}

export interface RestoreDrillService {
  /** The queue job: drills every destination whose drill is due (`nextDrillDueAt`), one after the other. */
  runDue(signal?: AbortSignal): Promise<RestoreDrillReport>;
  /** Drills the named destinations (default: all) now, due or not (the elevated `backup drill`). Unknown ids are the caller's check. */
  run(destinationIds?: readonly string[], options?: { signal?: AbortSignal; trigger?: 'schedule' | 'manual' }): Promise<RestoreDrillReport>;
}

/** The drill over the configured destinations, with the master key from the secret store (never a passphrase). */
export function createRestoreDrillService(options: RestoreDrillServiceOptions): RestoreDrillService {
  const now = options.now ?? Date.now;
  const open = options.openDestination ?? ((definition: HubBackupDestinationConfig) => openBackupDestination(definition, options.paths));
  const writeAudit = (trigger: 'schedule' | 'manual'): RestoreDrillAuditFn => options.audit
    ?? ((event, outcome, detail) => writeAuditRow(options.db, { event, outcome, actorKind: trigger === 'schedule' ? 'system' : 'cli', detail, now: now() }));
  const recordFailure = (id: string, code: string, trigger: 'schedule' | 'manual'): RestoreDrillResult => {
    try { updateDestinationState(options.db, id, { lastDrillAt: new Date(now()).toISOString(), lastDrillOutcome: 'failure', lastDrillError: code }); } catch { /* best effort */ }
    try { writeAudit(trigger)('backup.drill-failed', 'failure', { destination: id, reason: code, trigger }); } catch { /* best effort */ }
    return { destinationId: id, outcome: 'failed', reason: code };
  };

  async function drill(definitions: readonly HubBackupDestinationConfig[], trigger: 'schedule' | 'manual', signal: AbortSignal | undefined): Promise<RestoreDrillReport> {
    const results: RestoreDrillResult[] = [];
    if (definitions.length === 0) return { results };
    let masterKey: Uint8Array | null;
    try {
      masterKey = options.masterKeys.load();
    } catch {
      masterKey = null;
      for (const d of definitions) results.push(recordFailure(d.id, 'master-key-unreadable', trigger));
    }
    if (masterKey === null) {
      if (results.length === 0) for (const d of definitions) results.push(recordFailure(d.id, 'master-key-missing', trigger));
      options.onRecorded?.();
      return { results };
    }
    try {
      for (const definition of definitions) {
        if (signal?.aborted) break;
        let destination: BackupDestination;
        try {
          destination = open(definition);
        } catch (error) {
          results.push(recordFailure(definition.id, restoreDrillFailureCode(error), trigger));
          continue;
        }
        results.push(await runRestoreDrill({
          db: options.db, paths: options.paths, destination, masterKey, deps: options.deps, trigger, now, audit: writeAudit(trigger),
          ...(signal !== undefined ? { signal } : {}), ...(options.freeSpace ? { freeSpace: options.freeSpace } : {}), ...(options.hooks ? { hooks: options.hooks } : {}),
        }));
      }
    } finally {
      masterKey.fill(0);
      if (results.some((r) => r.outcome !== 'skipped')) { try { options.onRecorded?.(); } catch { /* observation only */ } }
    }
    return { results };
  }

  const destinations = (): HubBackupDestinationConfig[] => options.readConfig().backup?.destinations ?? [];
  return {
    runDue(signal) {
      const at = now();
      const due = destinations().filter((d) => {
        const dueAt = nextDrillDueAt(readDestinationState(options.db, d.id), at);
        return dueAt !== null && dueAt <= at;
      });
      return drill(due, 'schedule', signal);
    },
    run(destinationIds, runOptions = {}) {
      const all = destinations();
      const chosen = destinationIds === undefined ? all : all.filter((d) => destinationIds.includes(d.id));
      return drill(chosen, runOptions.trigger ?? 'manual', runOptions.signal);
    },
  };
}

/** How often the job checks whether a drill is due (cheap: per-destination state reads). */
export const RESTORE_DRILL_CHECK_MS = 3600_000;

export interface RestoreDrillSchedulerOptions {
  service: RestoreDrillService;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  checkMs?: number;
  /** Reports each timer check to the job status registry (PD-112); optional and observation-only. */
  job?: JobHandle;
}

export interface RestoreDrillScheduler {
  start(): void;
  stop(): void;
  /** One check: drills every destination whose monthly drill is due. Never throws; a stop mid-drill records nothing. */
  runNow(): Promise<RestoreDrillReport>;
}

/**
 * The `restore-drill` Hub job: an hourly in-process check (like `backup-schedule`, and for the same reason it is not a queue job: it
 * must run on a Hub that never provisioned SaveSphere) that drills each destination whose monthly drill is due. A drill in flight is
 * aborted at `stop()` (a shutdown), which records nothing; the scratch directory is removed either way.
 */
export function createRestoreDrillScheduler(options: RestoreDrillSchedulerOptions): RestoreDrillScheduler {
  const checkMs = options.checkMs ?? RESTORE_DRILL_CHECK_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number): unknown => {
    const handle = setInterval(fn, ms);
    handle.unref();
    return handle;
  });
  const clearTimer = options.clearTimer ?? ((handle: unknown): void => clearInterval(handle as NodeJS.Timeout));
  let handle: unknown;
  let running = false;
  let controller: AbortController | undefined;

  async function runNow(): Promise<RestoreDrillReport> {
    if (running) return { results: [] };
    running = true;
    controller = new AbortController();
    try {
      return await options.service.runDue(controller.signal);
    } catch {
      return { results: [] };
    } finally {
      controller = undefined;
      running = false;
    }
  }
  const classify = (report: RestoreDrillReport): JobRunReport => {
    const { summary, attention } = summarizeRestoreDrill(report);
    const ran = report.results.some((r) => r.outcome !== 'skipped');
    return { outcome: attention ? 'failed' : ran ? 'success' : 'skipped', summary };
  };
  return {
    start() {
      if (handle !== undefined) return;
      handle = setTimer(() => { void (options.job ? options.job.track(runNow, classify) : runNow()); }, checkMs);
    },
    stop() {
      if (handle !== undefined) { clearTimer(handle); handle = undefined; }
      controller?.abort({ reason: 'shutdown' });
    },
    runNow,
  };
}

/** One sentence for the job-status view, and whether the owner should look (a failed drill). */
export function summarizeRestoreDrill(report: RestoreDrillReport): { summary: string; attention: boolean } {
  const passed = report.results.filter((r) => r.outcome === 'passed').length;
  const failed = report.results.filter((r) => r.outcome === 'failed').length;
  const busy = report.results.filter((r) => r.outcome === 'skipped' && r.reason === 'busy').length;
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (report.results.length === 0) return { summary: 'No backup destination is due for a restore drill.', attention: false };
  const parts: string[] = [];
  if (passed > 0) parts.push(`passed for ${plural(passed, 'destination')}`);
  if (failed > 0) parts.push(`FAILED for ${plural(failed, 'destination')}`);
  if (busy > 0) parts.push(`skipped for ${plural(busy, 'busy destination')}`);
  const summary = parts.length === 0 ? 'No verified backup to drill yet.' : `Restore drill ${parts.join(', ')}.`;
  return { summary: failed > 0 ? `${summary} See the backup status.` : summary, attention: failed > 0 };
}
