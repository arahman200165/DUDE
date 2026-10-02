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
  /** Public enrollment details; present when `enrollmentState` is 'enrolled' or 'revoked'. */
  enrollment?: { environmentId: string; hubInstanceId: string; hubUrl: string; enrolledAt: string };
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
  /** Resolved by the renderer (settings definition, manifest override, policy rule); omitted means derive from policy. */
  scope?: KvScope;
}

export type KvScope = 'environment' | 'workspace' | 'device' | 'local-only';

export interface EntityCommit {
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  payload?: unknown;
}

export type EntityCommitResult =
  | { ok: true; localRevision: number; outboxOpId?: string; backpressure?: boolean }
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

export type ResetApplyError = 'invalid-token' | 'expired' | 'stale-preview' | 'forbidden' | 'unavailable' | 'failed';
export type ResetApplyResult = { readonly ok: true } | { readonly ok: false; readonly error: ResetApplyError };

/** Step one of moving an unreadable store aside (recovery); nothing moves until `quarantineApply`. */
export interface QuarantinePreview {
  token: string;
  /** What will move into the quarantine folder (names and sizes only). */
  files: Array<{ name: string; sizeBytes: number }>;
  /** ISO-8601. */
  expiresAt: string;
}

export type QuarantinePreviewResult = ({ readonly ok: true } & QuarantinePreview) | { readonly ok: false; readonly error: ResetApplyError | 'not-needed' };
export type ResetPreviewResult = ({ readonly ok: true } & ResetPreview) | { readonly ok: false; readonly error: ResetApplyError };
