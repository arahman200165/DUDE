import { createHash } from 'node:crypto';
import type { Db } from '@dude/sqlite-store';
import { getMeta, setMeta, transaction } from '@dude/sqlite-store';
import { getEnrollment, clearEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { unsentOpCounts } from '../store/repos/outbox.repo.js';
import { resetHubBookkeeping } from '../store/repos/sync-state.repo.js';
import { takeRecoverySnapshot } from './first-sync.js';

export class StandaloneError extends Error {
  constructor(readonly code: 'not-revoked' | 'stale-preview' | 'no-backup-dir', message: string) { super(message); }
}

export interface StandalonePreviewData {
  /** Undelivered ops (pending, quarantined, stranded) that conversion drops; the records they describe stay. */
  strandedOps: number;
  records: number;
  environmentId: string;
  digest: string;
}

export interface StandaloneContext {
  now: () => Date;
  /** Where the recovery snapshot (`standalone-<ts>.db`) goes. Required for the confirmed flow; unenroll skips it when unknown. */
  backupDir?: string;
}

const countRecords = (db: Db): number => Number((db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n);

function digestOf(db: Db, environmentId: string, strandedOps: number, records: number): string {
  const current = getEnrollment(db);
  return createHash('sha256').update(JSON.stringify([current?.environmentId ?? null, current?.hubInstanceId ?? null, environmentId, strandedOps, records, getMeta(db, 'device_id') ?? ''])).digest('hex');
}

/** What "Continue standalone" would do for a revoked device. Writes nothing. */
export function standalonePreview(db: Db, newEnvironmentId: string): StandalonePreviewData {
  if (getEnrollment(db)?.state !== 'revoked') throw new StandaloneError('not-revoked', 'Only a revoked device can continue standalone.');
  const strandedOps = unsentOpCounts(db).total;
  const records = countRecords(db);
  return { strandedOps, records, environmentId: newEnvironmentId, digest: digestOf(db, newEnvironmentId, strandedOps, records) };
}

export interface StandaloneResult { recoverySnapshot: string | null; droppedOps: number; environmentId: string }

/**
 * Turns this device back into a standalone one, keeping every record: a fresh environment id replaces the Hub's, undelivered ops
 * and the Hub bookkeeping (revisions, merge bases, cursor, first-sync progress, conflicts) are dropped and the enrollment row is
 * removed. A later enrollment re-journals this local data in its first sync. Does not check the enrollment state or a
 * confirmation: callers do (the confirmed flow below, or unenroll, which is itself the confirmation).
 */
export function convertToStandalone(db: Db, newEnvironmentId: string, ctx: StandaloneContext): StandaloneResult {
  const droppedOps = unsentOpCounts(db).total;
  const recoverySnapshot = ctx.backupDir ? takeRecoverySnapshot(db, ctx.backupDir, ctx.now(), 'standalone') : null;
  transaction(db, () => {
    db.exec('DELETE FROM outbox; DELETE FROM sync_conflicts');
    db.prepare('UPDATE records SET environment_id = ?').run(newEnvironmentId);
    resetHubBookkeeping(db);
    clearEnrollment(db);
    db.prepare("DELETE FROM meta WHERE key = 'standalone_environment_id'").run();
    setMeta(db, 'environment_id', newEnvironmentId);
  });
  return { recoverySnapshot, droppedOps, environmentId: newEnvironmentId };
}

/** The confirmed flow: the digest must still match what the preview showed. */
export function standaloneApply(db: Db, input: { digest: string; environmentId: string }, ctx: StandaloneContext): StandaloneResult {
  const current = standalonePreview(db, input.environmentId);
  if (current.digest !== input.digest) throw new StandaloneError('stale-preview', 'This device changed since the preview. Preview again.');
  if (!ctx.backupDir) throw new StandaloneError('no-backup-dir', 'No place to keep a recovery snapshot.');
  return convertToStandalone(db, input.environmentId, ctx);
}
