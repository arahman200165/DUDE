import type { SyncPhase, SyncStatus } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';
import { outboxCountsByStatus } from '../store/repos/outbox.repo.js';
import { countConflicts } from '../store/repos/sync-conflicts.repo.js';
import { getSyncState } from '../store/repos/sync-state.repo.js';

export interface SyncRuntimeState {
  phase: SyncPhase;
  /** A live error takes precedence over the one persisted in sync_state. */
  lastError: string | null;
  headRevision: number | null;
}

/** The device-facing sync state: persisted sync_state + outbox counts + conflict count + the runtime's phase. */
export function computeSyncStatus(db: Db, runtime: SyncRuntimeState): SyncStatus {
  const state = getSyncState(db);
  const counts = outboxCountsByStatus(db, state.categories, state.firstSyncState === 'done');
  return {
    phase: runtime.phase,
    lastSyncAt: state.lastSyncAt,
    cursor: state.cursor,
    headRevision: runtime.headRevision,
    pending: counts.pending,
    held: counts.held,
    quarantined: counts.quarantined,
    stranded: counts.stranded,
    conflicts: countConflicts(db),
    categories: state.categories,
    lastError: runtime.lastError ?? state.lastError,
  };
}
