import { createHash } from 'node:crypto';
import { uuidv7 } from '@dude/persistence';
import type { ResetKind } from '@dude/contracts';
import type { Db } from '@dude/sqlite-store';
import { getMeta, setMeta, transaction } from '@dude/sqlite-store';
import { getEnrollment } from './repos/hub-enrollment.repo.js';
import { unsentOpCounts } from './repos/outbox.repo.js';
import { getSyncState, resetHubBookkeeping, updateSyncState } from './repos/sync-state.repo.js';

/** Tables wiped by both reset kinds. Identity (meta) and migrations are never touched here. */
export const DATA_TABLES = [
  'kv', 'kv_sync', 'records', 'outbox', 'sync_conflicts', 'history_entries', 'network_runs', 'mutation_journal',
  'snapshot_headers', 'powershell_history', 'device_docs',
] as const;
/** Additionally wiped by 'reset-device' (values go with their refs). */
export const SECRET_TABLES = ['secret_refs', 'secret_values'] as const;
/**
 * Also wiped by 'reset-device' only: the Hub enrollment is identity, not user data, so 'clear-data' keeps it,
 * but a reset gives the device a new ID and the old Hub registration (and its wrapped key) no longer applies.
 */
export const ENROLLMENT_TABLES = ['hub_enrollment'] as const;

export interface ResetPreviewData {
  kind: ResetKind;
  counts: Record<string, number>;
  keepsIdentity: boolean;
  wipesSecrets: boolean;
  /** A Hub enrollment exists: clear-data keeps it (and re-pulls from the Hub); reset-device unenrolls. */
  enrolled: boolean;
  /** Ops that were never delivered; the UI offers "Sync first" when `pendingOps > 0`. Pending includes held ops. */
  unsent: { pending: number; quarantined: number; stranded: number };
  pendingOps: number;
  /** Binds a confirmation to exactly what the preview showed; main wraps it in an expiring token. */
  digest: string;
}

export interface ResetDeps {
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

export interface ResetOptions {
  /** clear-data only: the caller also clears the Hub's records first. Part of the digest, so a preview without it cannot apply with it. */
  deleteFromHub?: boolean;
  /** apply only: the caller already checked the digest (reset-device unenrolls before the wipe, which changes the counts). */
  verified?: boolean;
}

export type ResetApplyResult = { ok: true } | { ok: false; error: 'stale-preview' };

const tablesFor = (kind: ResetKind): readonly string[] => (kind === 'reset-device' ? [...DATA_TABLES, ...SECRET_TABLES, ...ENROLLMENT_TABLES] : DATA_TABLES);

function countRows(db: Db, kind: ResetKind): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of tablesFor(kind)) {
    counts[table] = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as unknown as { n: number }).n;
  }
  return counts;
}

function digestOf(kind: ResetKind, counts: Record<string, number>, deviceId: string, deleteFromHub: boolean): string {
  return createHash('sha256').update(JSON.stringify(deleteFromHub ? [kind, counts, deviceId, 'delete-from-hub'] : [kind, counts, deviceId])).digest('hex');
}

function checkKind(kind: ResetKind, options: ResetOptions): void {
  if (kind !== 'clear-data' && kind !== 'reset-device') throw new Error('Unknown reset kind.');
  if (options.deleteFromHub === true && kind !== 'clear-data') throw new Error('Only clear-data can also delete from the Hub.');
}

export function previewReset(db: Db, kind: ResetKind, options: ResetOptions = {}): ResetPreviewData {
  checkKind(kind, options);
  const counts = countRows(db, kind);
  const unsent = unsentOpCounts(db);
  return {
    kind,
    counts,
    keepsIdentity: kind === 'clear-data',
    wipesSecrets: kind === 'reset-device',
    enrolled: getEnrollment(db) !== null,
    unsent: { pending: unsent.pending, quarantined: unsent.quarantined, stranded: unsent.stranded },
    pendingOps: unsent.total,
    digest: digestOf(kind, counts, getMeta(db, 'device_id') ?? '', options.deleteFromHub === true),
  };
}

/** True while the data still matches what `previewReset` showed (used before any Hub call that cannot be undone). */
export function resetDigestMatches(db: Db, kind: ResetKind, expectedDigest: string, options: ResetOptions = {}): boolean {
  checkKind(kind, options);
  return digestOf(kind, countRows(db, kind), getMeta(db, 'device_id') ?? '', options.deleteFromHub === true) === expectedDigest;
}

/** Recomputes the digest inside the transaction; a mismatch means the data changed since the preview. */
export function applyReset(db: Db, kind: ResetKind, expectedDigest: string, deps: ResetDeps, options: ResetOptions = {}): ResetApplyResult {
  checkKind(kind, options);
  return transaction(db, () => {
    if (options.verified !== true && !resetDigestMatches(db, kind, expectedDigest, options)) return { ok: false as const, error: 'stale-preview' as const };
    // Clear-data on an enrolled device keeps the enrollment, so it must re-pull what the Hub holds (and keep the sync choices).
    const keepSync = kind === 'clear-data' && getEnrollment(db) !== null ? getSyncState(db) : null;
    // Deliberately no journaling: the wipe is local, deleting on the Hub is the separate, owner-confirmed `deleteFromHub`.
    for (const table of tablesFor(kind)) db.exec(`DELETE FROM ${table}`);
    // Revisions, the cursor and first-sync progress describe data that is now gone.
    resetHubBookkeeping(db);
    if (keepSync) {
      updateSyncState(db, { categories: keepSync.categories, firstSyncState: keepSync.firstSyncState, firstSyncAt: keepSync.firstSyncAt, paused: keepSync.paused });
      if (keepSync.firstSyncState === 'done') setMeta(db, 'sync_rebase_pending', '1');
    }
    if (kind === 'reset-device') {
      db.prepare("DELETE FROM meta WHERE key = 'standalone_environment_id'").run();
      const newId = (): string => uuidv7(deps.randomBytes, () => deps.now().getTime());
      setMeta(db, 'device_id', newId());
      setMeta(db, 'environment_id', newId());
      db.prepare("DELETE FROM meta WHERE key = 'cloned_from'").run();
    }
    return { ok: true as const };
  });
}
