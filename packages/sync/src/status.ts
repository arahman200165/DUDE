import type { SyncCategory } from './categories.js';

export type SyncPhase =
  | 'standalone' | 'needs-first-sync' | 'idle' | 'syncing' | 'offline' | 'paused' | 'revoked' | 'hub-outdated' | 'needs-reconcile' | 'error';

/** Device-facing sync state (also carried over IPC). `held` is derived, never stored. */
export interface SyncStatus {
  phase: SyncPhase;
  lastSyncAt: string | null;
  cursor: number;
  headRevision: number | null;
  pending: number;
  held: number;
  quarantined: number;
  stranded: number;
  conflicts: number;
  categories: Record<SyncCategory, boolean>;
  lastError: string | null;
}
