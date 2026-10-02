import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';

/** Renderer/main shapes for the device store. Structural on purpose: contracts does not depend on `@dude/persistence`. */

export type StoreStatus = 'ready' | 'degraded' | 'incompatible' | 'corrupt' | 'unavailable';

export interface DeviceStoreDevice {
  deviceId: string;
  environmentId: string;
  displayName: string;
  platform: string;
  appVersion: string;
  enrollmentState: string;
  clonedFrom?: string;
}

/** Everything the renderer needs before bootstrap. `device` is null when the store is not usable. */
export interface DeviceStoreBoot {
  status: StoreStatus;
  device: DeviceStoreDevice | null;
  kv: Array<{ namespace: string; key: string; value: unknown }>;
  records: Array<{ entityType: string; entityId: string; payload: unknown }>;
}

export interface StoreHealth {
  status: StoreStatus;
  schemaVersion: number;
  minReaderVersion: number;
  sizeBytes: number;
  outbox: { pending: number; maxRows: number; backpressure: boolean };
  /** ISO-8601. */
  lastBackup?: string;
  legacyImport: 'none' | 'done' | 'partial';
  message?: string;
}

export interface KvMutation {
  namespace: string;
  key: string;
  value?: unknown;
  remove?: boolean;
  policy: PersistencePolicy;
}

export interface EntityCommit {
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  payload?: unknown;
}

export type EntityCommitResult =
  | { ok: true; localRevision: number; outboxOpId?: string }
  | { ok: false; error: string };

export type ResetKind = 'clear-data' | 'reset-device';

/** Step one of the two-step reset (Destructive-Action Contract); `token` must be echoed to apply. */
export interface ResetPreview {
  kind: ResetKind;
  token: string;
  counts: Record<string, number>;
  /** ISO-8601. */
  expiresAt: string;
  keepsIdentity: boolean;
  wipesSecrets: boolean;
}
