import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import type { EnrollmentState, DevicePlatform } from '../device/device-record.model.js';

export interface KvEntry { namespace: string; key: string; value: unknown }
export interface KvKey { namespace: string; key: string }
export interface KvWriteMeta { policy: PersistencePolicy; scope: DataScope }

/** Per-tool key/value pairs. */
export interface KeyValueRepository {
  get(namespace: string, key: string): Promise<unknown | undefined>;
  set(namespace: string, key: string, value: unknown, meta: KvWriteMeta): Promise<void>;
  remove(namespace: string, key: string): Promise<void>;
  /** Keys whose namespace starts with `nsPrefix` (all keys when omitted). */
  keys(nsPrefix?: string): Promise<KvKey[]>;
  /** Every entry, for hydration. */
  snapshot(): Promise<KvEntry[]>;
}

/** `localRevision` is the new local revision of the entity; `outboxOpId` is set when a journaled change wrote an outbox op. */
export interface CommitResult { localRevision: number; outboxOpId?: string }

/** Entities addressed by id. Every mutation commits (row and outbox op) before resolving. */
export interface EntityCollectionRepository<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(value: T): Promise<CommitResult>;
  remove(id: string): Promise<CommitResult>;
  /** Replace-or-insert many values in one commit (bundle import). */
  importMany(values: T[]): Promise<CommitResult>;
}

export interface HistoryRecord { id: string; toolId: string; createdAt: number; sizeBytes: number; payload: unknown }
export interface HistoryRetention { maxPerTool: number; maxTotal: number; maxAgeMs: number; maxEntryBytes: number }
/** Adding an entry over `maxEntryBytes` is rejected with `{ ok: false }`; over-cap oldest entries are dropped. */
export type HistoryAddResult = { ok: true; evicted: number } | { ok: false; error: 'too-large' };

export interface HistoryRepository {
  add(entry: HistoryRecord): Promise<HistoryAddResult>;
  /** Newest first. */
  listByTool(toolId: string): Promise<HistoryRecord[]>;
  /** Newest first across tools. */
  listRecent(limit: number): Promise<HistoryRecord[]>;
  get(id: string): Promise<HistoryRecord | undefined>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  clearTool(toolId: string): Promise<void>;
}

export interface NetworkRunRecord { id: string; createdAt: number; sizeBytes: number; payload: unknown }
export interface NetworkRunRetention { maxRuns: number; maxAgeMs: number; maxTotalBytes: number }
export type NetworkRunAddResult = { ok: true; evicted: number } | { ok: false; error: 'too-large' };

export interface NetworkRunRepository {
  add(run: NetworkRunRecord): Promise<NetworkRunAddResult>;
  /** Newest first. */
  list(): Promise<NetworkRunRecord[]>;
  get(id: string): Promise<NetworkRunRecord | undefined>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface OutboxSummary { pending: number; maxRows: number; backpressure: boolean }

/** Read-only view of the local outbox for UI status. */
export interface OutboxStatusReader {
  count(): Promise<number>;
  status(): Promise<OutboxSummary>;
}

export interface DeviceIdentity {
  deviceId: string;
  environmentId: string;
  displayName: string;
  platform: DevicePlatform;
  appVersion: string;
  enrollmentState: EnrollmentState;
  clonedFrom?: string;
}

/** The identity of this installation. */
export interface DeviceIdentityPort {
  current(): Promise<DeviceIdentity>;
}
