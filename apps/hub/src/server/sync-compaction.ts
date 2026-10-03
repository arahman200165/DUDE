import type { FastifyInstance } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { getRow } from '@dude/sqlite-store';
import { audit } from '../security/audit.js';
import { compactBefore, getRetentionDays, getSyncFloor } from '../db/sync-repository.js';

export const SYNC_COMPACTION_INTERVAL_MS = 6 * 3600_000;
const DAY_MS = 24 * 3600_000;

export interface SyncCompactionOptions {
  /** Timer period (default 6 h). 0 disables the timer; `run` stays available. */
  compactionIntervalMs?: number;
  /** Overrides the stored retention (days; may be fractional in tests). */
  retentionDays?: number;
}

export interface SyncCompactionResult { floor: number; changeFeed: number; tombstones: number; appliedOps: number }

export interface SyncCompaction {
  /** Compact now: floor = highest revision whose change-feed entry is older than the retention window. */
  run(): SyncCompactionResult | null;
}

declare module 'fastify' {
  interface FastifyInstance { syncCompaction: SyncCompaction }
}

export function runSyncCompaction(db: Db, now: () => number, options: SyncCompactionOptions = {}): SyncCompactionResult | null {
  const days = options.retentionDays ?? getRetentionDays(db);
  const cutoff = new Date(now() - days * DAY_MS).toISOString();
  const row = getRow<{ r: number | null }>(db.prepare('SELECT MAX(revision) AS r FROM change_feed WHERE at < ?'), cutoff);
  const floor = row?.r ?? 0;
  if (floor <= getSyncFloor(db)) return null;
  const result = compactBefore(db, floor, cutoff);
  if (result.changeFeed + result.tombstones + result.appliedOps > 0) {
    audit(db, {
      event: 'sync.compacted', outcome: 'success', actorKind: 'system',
      detail: { floor: result.floor, changeFeed: result.changeFeed, tombstones: result.tombstones, appliedOps: result.appliedOps }, now: now(),
    });
  }
  return result;
}

/** Decorates `app.syncCompaction` and runs it once at startup and then on an unref'd timer; stopped on close. */
export function registerSyncCompaction(app: FastifyInstance, db: Db, now: () => number, options: SyncCompactionOptions = {}): void {
  const run = (): SyncCompactionResult | null => runSyncCompaction(db, now, options);
  app.decorate('syncCompaction', { run });
  const safe = (): void => { try { run(); } catch (error) { app.log.error({ errCode: (error as { code?: string }).code }, 'sync compaction failed'); } };
  const interval = options.compactionIntervalMs ?? SYNC_COMPACTION_INTERVAL_MS;
  let timer: NodeJS.Timeout | undefined;
  app.addHook('onReady', async () => {
    safe();
    if (interval > 0) { timer = setInterval(safe, interval); timer.unref(); }
  });
  app.addHook('onClose', async () => { if (timer) clearInterval(timer); });
}
