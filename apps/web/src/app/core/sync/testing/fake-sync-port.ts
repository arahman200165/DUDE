import { vi } from 'vitest';
import type { AgentAppliedChange, AgentSyncStatus, FirstSyncPreview, QuarantinedOpView, SyncConflictView } from '@dude/contracts';
import { defaultCategoryMap } from '@dude/sync';
import type { SyncPort } from '../sync.port';

export function syncStatus(patch: Partial<AgentSyncStatus> = {}): AgentSyncStatus {
  return {
    phase: 'idle', lastSyncAt: '2026-10-03T10:00:00.000Z', cursor: 5, headRevision: 5, pending: 0, held: 0, quarantined: 0, stranded: 0, conflicts: 0,
    categories: defaultCategoryMap(), lastError: null, ...patch,
  };
}

export function conflict(patch: Partial<SyncConflictView> = {}): SyncConflictView {
  return {
    id: 1, entityType: 'pipeline', entityId: 'p1', kind: 'edit-edit', category: 'pipelines', name: 'Build', localPayload: { name: 'Build', steps: 2 }, localDeleted: false,
    basePayload: { name: 'Build', steps: 1 }, remotePayload: { name: 'Build', steps: 3 }, remoteDeleted: false, remoteRevision: 7, fields: ['steps'],
    detectedAt: '2026-10-03T09:00:00.000Z', canKeepBoth: true, ...patch,
  };
}

export function quarantinedOp(patch: Partial<QuarantinedOpView> = {}): QuarantinedOpView {
  return {
    opId: 'op-1', entityType: 'setting', entityId: 'x:y', category: 'settings', opKind: 'upsert', reason: 'too-large', attempts: 1, lastAttemptAt: null,
    createdAt: '2026-10-03T08:00:00.000Z', updatedAt: '2026-10-03T08:00:00.000Z', ...patch,
  };
}

export function firstSyncPreview(patch: Partial<FirstSyncPreview> = {}): FirstSyncPreview {
  return {
    asOfRevision: 9, digest: 'digest-1', confirmToken: 'tok-1', expiresAt: '2026-10-03T11:00:00.000Z',
    categories: [
      {
        category: 'favorites', label: 'Favorites', sensitivity: 'non-sensitive', defaultEnabled: true, localCount: 3, hubCount: 4, sameIdIdentical: 2, sameIdDifferent: [],
        sameNameDifferentId: [], localOnly: 1, hubOnly: 2, disclosure: 'Favorite tool ids.', recommended: 'merge',
      },
      {
        category: 'pipelines', label: 'Pipelines and scripts', sensitivity: 'non-sensitive', defaultEnabled: true, localCount: 1, hubCount: 1, sameIdIdentical: 0,
        sameIdDifferent: [{ entityType: 'pipeline', entityId: 'p1', name: 'Build' }], sameNameDifferentId: [{ entityType: 'pipeline', name: 'Lint', localId: 'a', hubId: 'b' }],
        localOnly: 0, hubOnly: 0, disclosure: 'Pipeline definitions.', recommended: 'merge',
      },
    ],
    ...patch,
  };
}

export interface FakeSyncPort {
  readonly port: SyncPort & { [K in keyof SyncPort]: ReturnType<typeof vi.fn> & SyncPort[K] };
  emitStatus(status: AgentSyncStatus): void;
  emitApplied(changes: readonly AgentAppliedChange[]): void;
}

/** A SyncPort of `vi.fn`s with sensible defaults; override per test. */
export function createFakeSyncPort(overrides: Partial<SyncPort> = {}, initial: AgentSyncStatus = syncStatus()): FakeSyncPort {
  let statusListener: ((s: AgentSyncStatus) => void) | undefined;
  let appliedListener: ((c: readonly AgentAppliedChange[]) => void) | undefined;
  const base: SyncPort = {
    status: async () => initial,
    setCategories: async () => initial,
    setPaused: async () => initial,
    syncNow: async () => initial,
    listConflicts: async () => [],
    resolveConflict: async () => ({ ok: true, changes: [] }),
    listQuarantined: async () => [],
    retryQuarantined: async () => ({ retried: 0 }),
    discardQuarantinedPreview: async () => ({ confirmToken: 'discard-tok', expiresAt: '2026-10-03T11:00:00.000Z', summary: { action: 'discard' } }),
    discardQuarantined: async () => ({ ok: true }),
    exportQuarantined: async () => [],
    firstSyncPreview: async () => firstSyncPreview(),
    firstSyncApply: async () => initial,
    standalonePreview: async () => ({ strandedOps: 2, records: 5, environmentId: 'env-new', confirmToken: 'sa-tok', digest: 'sa-digest', expiresAt: '2026-10-03T11:00:00.000Z' }),
    standaloneApply: async () => initial,
    onStatusChanged: (cb) => { statusListener = cb; return () => { statusListener = undefined; }; },
    onApplied: (cb) => { appliedListener = cb; return () => { appliedListener = undefined; }; },
  };
  const merged: Record<string, unknown> = { ...base, ...overrides };
  const port = Object.fromEntries(Object.entries(merged).map(([k, fn]) => [k, typeof fn === 'function' ? vi.fn(fn as (...args: unknown[]) => unknown) : fn])) as unknown as FakeSyncPort['port'];
  return { port, emitStatus: (s) => statusListener?.(s), emitApplied: (c) => appliedListener?.(c) };
}
