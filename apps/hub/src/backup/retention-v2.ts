import { createHash } from 'node:crypto';
import { openBackupV2 } from '@dude/hub-backup';
import type { BackupDeps, BackupRepository } from '@dude/hub-backup';
import { BACKUP_V2_RETENTION_DEFAULT } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { MANIFEST_PREFIX, PACK_PREFIX, backupIdOfManifest, packIdOfObject } from './destinations/destination.js';
import type { BackupDestination } from './destinations/destination.js';
import { readJournal } from './run-backup-v2.js';
import { TempIndex } from './temp-index.js';

/**
 * Backup v2 retention (32-SS1, Milestone 847, PD-150): grandfather-father-son per destination, 7 daily, 4 weekly and 6 monthly by
 * default, computed from the manifest timestamps (the UTC `YYYYMMDDTHHMMSSZ` prefix of each backup id). Pruning is the two-step
 * destructive action of the admin pipe (`backup prune`): `planPrune` is read-only and lists the manifests to delete and the packs
 * to sweep; the apply re-plans under the destination lock and must reproduce the previewed digest exactly.
 *
 * Mark and sweep: packs are never rewritten and a backup's blob extents may point into EARLIER backups' packs, so a pack is swept
 * only when no RETAINED manifest references it through any file or blob extent. A retained manifest that cannot be read stops the
 * plan (`manifest-unreadable`) rather than risking a referenced pack. Manifests are deleted before packs, so an interrupted apply
 * leaves unreferenced packs (swept by the next prune), never a manifest whose packs are gone.
 */
export const BACKUP_PRUNE_ACTION = 'backup.prune';
/** Deleting backup objects at a destination. */
export const BACKUP_PRUNE_CONSEQUENCE_CLASS = ['filesystem-write'] as const;

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { ...BACKUP_V2_RETENTION_DEFAULT };

/** The UTC instant encoded in a backup id, or NaN. */
export function backupIdTime(backupId: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/.exec(backupId);
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi, s] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

/** ISO-8601 week key (`YYYY-Www`, UTC). */
function isoWeek(ms: number): string {
  const source = new Date(ms);
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7)); // the Thursday of this ISO week decides its year
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Which backups a GFS policy keeps (restic semantics): walking newest to oldest, each rule keeps the newest backup of each distinct
 * day, ISO week or month until it has kept its count of periods. The newest backup is always kept. Ids that do not carry a valid
 * timestamp are kept (never deleted by a rule that cannot date them). Pure: no clock, no I/O.
 */
export function selectRetained(backupIds: readonly string[], policy: RetentionPolicy = DEFAULT_RETENTION): Set<string> {
  const keep = new Set<string>();
  const dated = backupIds.filter((id) => Number.isFinite(backupIdTime(id)));
  for (const id of backupIds) if (!Number.isFinite(backupIdTime(id))) keep.add(id);
  const newestFirst = [...dated].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (newestFirst.length > 0) keep.add(newestFirst[0]!);
  const rules: Array<{ count: number; key: (ms: number) => string }> = [
    { count: policy.daily, key: (ms) => new Date(ms).toISOString().slice(0, 10) },
    { count: policy.weekly, key: isoWeek },
    { count: policy.monthly, key: (ms) => new Date(ms).toISOString().slice(0, 7) },
  ];
  for (const rule of rules) {
    let last: string | null = null;
    let kept = 0;
    for (const id of newestFirst) {
      if (kept >= rule.count) break;
      const key = rule.key(backupIdTime(id));
      if (key === last) continue;
      last = key;
      kept += 1;
      keep.add(id);
    }
  }
  return keep;
}

export interface PrunePlan {
  destinationId: string;
  repoId: string;
  policy: RetentionPolicy;
  /** Backup ids kept, oldest first. */
  keep: string[];
  /** Manifest object names to delete, oldest first. */
  deleteManifests: string[];
  /** Pack object names no retained manifest references. */
  sweepPacks: string[];
  /** Bytes the deletions free. */
  bytes: number;
  /** SHA-256 over the destination, the repository and the exact lists; the confirmation token is bound to it. */
  digest: string;
}

export class PruneError extends Error {
  constructor(readonly code: 'manifest-unreadable' | 'busy' | 'confirmation-required' | 'plan-changed', message: string) {
    super(message);
    this.name = 'PruneError';
  }
}

export function pruneDigest(plan: Pick<PrunePlan, 'destinationId' | 'repoId' | 'keep' | 'deleteManifests' | 'sweepPacks'>): string {
  return createHash('sha256')
    .update(JSON.stringify({ v: 1, destinationId: plan.destinationId, repoId: plan.repoId, keep: plan.keep, deleteManifests: plan.deleteManifests, sweepPacks: plan.sweepPacks }))
    .digest('hex');
}

export interface PlanPruneOptions {
  db: Db;
  destination: BackupDestination;
  repository: BackupRepository;
  deps: Pick<BackupDeps, 'deriveKey'>;
  workDir: string;
  policy?: RetentionPolicy;
}

/** Read-only: decides what a prune would delete. Writes nothing (except a temp index file in `workDir`, removed before it returns). */
export async function planPrune(options: PlanPruneOptions): Promise<PrunePlan> {
  const policy = options.policy ?? DEFAULT_RETENTION;
  const destination = options.destination;
  const manifests = await destination.list(MANIFEST_PREFIX);
  // A manifest an unfinished run left behind was never verified or recorded: it is never retained and is deleted.
  const journal = readJournal(options.db, destination.id);
  const unfinished = new Set((journal?.objects ?? []).filter((o) => o.startsWith(MANIFEST_PREFIX)));
  const candidates = manifests.filter((m) => !unfinished.has(m.name)).map((m) => backupIdOfManifest(m.name)).filter((id): id is string => id !== null);
  const retained = selectRetained(candidates, policy);
  const sizeOf = new Map(manifests.map((m) => [m.name, m.size]));

  const index = new TempIndex(options.workDir);
  try {
    for (const backupId of [...retained].sort()) {
      try {
        const reader = await openBackupV2(destination.source(), backupId, { repository: options.repository }, options.deps);
        try {
          for await (const entry of reader.listEntries()) for (const [packId] of entry.extents) index.mark(packId);
        } finally {
          reader.close();
        }
      } catch {
        throw new PruneError('manifest-unreadable', 'A backup this prune would keep cannot be read, so no pack can be proven unreferenced. Nothing was deleted; verify the destination.');
      }
    }
    const deleteManifests = manifests.map((m) => m.name).filter((name) => {
      const id = backupIdOfManifest(name);
      return id !== null && !retained.has(id);
    });
    const sweep: Array<{ name: string; size: number }> = [];
    for (const pack of await destination.list(PACK_PREFIX)) {
      const id = packIdOfObject(pack.name);
      if (id !== null && !index.isMarked(id)) sweep.push(pack);
    }
    const plan = {
      destinationId: destination.id,
      repoId: options.repository.repoId,
      policy,
      keep: [...retained].sort(),
      deleteManifests,
      sweepPacks: sweep.map((p) => p.name),
      bytes: deleteManifests.reduce((sum, name) => sum + (sizeOf.get(name) ?? 0), 0) + sweep.reduce((sum, p) => sum + p.size, 0),
    };
    return { ...plan, digest: pruneDigest(plan) };
  } finally {
    index.close();
  }
}

/** Deletes what the plan lists: manifests first, then packs. Returns what was removed. */
export async function applyPrunePlan(destination: BackupDestination, plan: PrunePlan): Promise<{ manifests: number; packs: number; bytes: number }> {
  for (const name of plan.deleteManifests) await destination.deleteObject(name);
  for (const name of plan.sweepPacks) await destination.deleteObject(name);
  return { manifests: plan.deleteManifests.length, packs: plan.sweepPacks.length, bytes: plan.bytes };
}
