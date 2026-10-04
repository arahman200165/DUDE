import type { SyncOpResult, SyncRecord } from '@dude/contracts/hub';
import type { OutboxOp } from '@dude/sync/outbox/outbox-op.model';
import type { SyncableToolInfo } from '@dude/persistence/settings/syncable-key';

export type MobileCategory = 'favorites' | 'settings';
export type CategoryFlags = Readonly<Record<MobileCategory, boolean>>;
export type SnapshotChoice = 'merge' | 'hub' | 'local';
export interface StoreOptions { readonly deviceId: string; readonly id: () => string; readonly now: () => number; readonly tools?: readonly SyncableToolInfo[] }
export interface StorageContext {
  readonly id: string; readonly kind: 'standalone' | 'environment' | 'archive'; readonly environmentId: string;
  readonly deviceId: string; readonly writable: boolean; readonly localRevision: number;
  readonly cursor: number; readonly head: number; readonly epoch: number; readonly categories: CategoryFlags; readonly consent: boolean;
}
export interface StoredRecord { readonly entityType: string; readonly entityId: string; readonly payload: unknown; readonly deleted: boolean; readonly localRevision: number; readonly hubRevision: number | null }
export interface ClaimedOperation extends OutboxOp { readonly claimed: boolean; readonly rejected: string | null }
export interface StagedSnapshot { readonly id: string; readonly contextId: string; readonly categories: readonly MobileCategory[]; readonly cursor: number; readonly head: number; readonly epoch: number; readonly localRevision: number; readonly complete: boolean; readonly records: readonly SyncRecord[] }
export interface RecoveryExport {
  readonly format: 'dude-mobile-recovery'; readonly version: 1; readonly deviceId: string;
  readonly context: StorageContext; readonly records: readonly StoredRecord[]; readonly pending: readonly ClaimedOperation[];
  readonly settings: readonly { namespace: string; key: string; value: unknown }[];
  readonly authority: { environmentId: string; hubInstanceId: string; authorityEpoch: number } | null;
}
export type PushResults = readonly SyncOpResult[];
