import type { ConfirmPreview, DeviceInfo, DeviceListResponse, PairingCodeResponse, SessionListResponse, AuditListResponse, RecoveryCodesResponse, SyncCategory } from '../hub/index.js';
import type { EntityCommit, EntityCommitResult, KvMutation, ResetKind, StoreHealth, DeviceStoreBoot } from './device-store.model.js';

/** Row shapes exchanged with the state service; payloads are opaque JSON. */
export interface AgentHistoryRecord { id: string; toolId: string; createdAt: number; sizeBytes: number; payload: unknown }
export interface AgentNetworkRun { id: string; createdAt: number; sizeBytes: number; payload: unknown }
export type JournalEngine = 'fs' | 'sys';
/** An fs/sys mutation journal entry. Only `planId` (the key) and `appliedAt` (ISO, the ordering key) are interpreted. */
export interface AgentJournalEntry { planId: string; appliedAt: string; [field: string]: unknown }
export type AgentSecretPurpose = string;
/** Presence and bookkeeping only: the agent never holds plaintext (main encrypts and decrypts with safeStorage). */
export interface AgentSecretStatus {
  purpose: AgentSecretPurpose; isSet: boolean; needsReentry: boolean; createdAt: string | null; lastUsedAt: string | null;
}
export interface AgentSnapshotHeader { kind: string; id: string; createdAt: number; header: unknown }
/** Reset step one as the agent reports it; main wraps `digest` into an expiring token before the renderer sees it. */
export interface AgentResetPreview {
  kind: ResetKind; counts: Record<string, number>; keepsIdentity: boolean; wipesSecrets: boolean; digest: string;
}
/** Hub enrollment as the renderer may see it: never any key material. */
export interface AgentHubEnrollment {
  state: 'enrolled' | 'revoked'; hubInstanceId: string; environmentId: string; hubUrl: string; protocolVersion: number;
  spkiActive: string; spkiNext: string | null; enrolledAt: string; lastContactAt: string | null; revokedAt: string | null;
}
/** Hub connection state machine (PD-034). `standalone` means no enrollment. */
export type AgentHubState = 'standalone' | 'connecting' | 'online' | 'offline' | 'revoked' | 'incompatible' | 'untrusted-tls';
export interface AgentHubStatus {
  state: AgentHubState; lastError: string | null; lastContactAt: string | null; ownerSignedIn: boolean; enrollment: AgentHubEnrollment | null;
  /** From the last public hello; null until one succeeded. */
  hubVersion: string | null;
  /** Whether the Hub trusts this device for owner recovery (GET /devices/self); null until known or when not connected. */
  recoveryTrusted: boolean | null;
}
/** Typed enrollment failures (the RPC error `code`). */
export type AgentHubEnrollError =
  | 'invalid-pairing-string' | 'already-enrolled' | 'tls-pin-mismatch' | 'hub-unreachable' | 'incompatible' | 'pairing-rejected' | 'dpapi-unavailable' | 'conflict';
/** Typed failures of `hub.bootstrapLocal` (besides the enrollment ones and `hub-*` codes). */
export type AgentHubBootstrapError = 'handoff-missing' | 'handoff-expired' | 'already-bootstrapped';
export interface AgentHubBootstrapResult {
  recoveryCodes: string[]; status: AgentHubStatus;
  /** Set when the Hub was bootstrapped (the recovery codes are real) but a later step failed; this device is then not paired or not signed in. */
  followUpError?: { code: string; message: string };
}
export interface AgentHubProbe {
  found: boolean; bootstrapped: boolean | null; hubInstanceId: string | null; spkiSha256: string | null;
  compatibility: 'compatible' | 'client-too-old' | 'hub-too-old' | null;
  hubVersion: string | null;
}
export interface AgentHubOwnerStatus { signedIn: boolean; displayName: string | null; expiresAt: string | null }
/** Pushed to connected desktops (no `id`) whenever the Hub connection state changes. */
export interface AgentHubStatusEvent { type: 'event'; event: 'hub.status'; status: AgentHubStatus }

/** Device-facing sync phase (mirrors `SyncPhase` in `@dude/sync`; contracts cannot depend on it). */
export type AgentSyncPhase = 'standalone' | 'needs-first-sync' | 'idle' | 'syncing' | 'offline' | 'paused' | 'revoked' | 'hub-outdated' | 'error';
export interface AgentSyncStatus {
  phase: AgentSyncPhase; lastSyncAt: string | null; cursor: number; headRevision: number | null;
  pending: number; held: number; quarantined: number; stranded: number; conflicts: number;
  categories: Record<SyncCategory, boolean>; lastError: string | null;
}
/** A local change the renderer must learn about; for `setting` entities `namespace`/`key`/`value` are also set. */
export interface AgentAppliedChange {
  entityType: string; entityId: string; deleted: boolean; payload: unknown | null; namespace?: string; key?: string; value?: unknown;
}
export type SyncConflictKind = 'edit-edit' | 'edit-delete' | 'delete-edit' | 'first-sync';
/** One unresolved sync conflict with both versions (payloads are the entities' JSON). */
export interface SyncConflictView {
  id: number; entityType: string; entityId: string; kind: SyncConflictKind; category: SyncCategory | null; name: string | null;
  localPayload: unknown | null; localDeleted: boolean; basePayload: unknown | null; remotePayload: unknown | null; remoteDeleted: boolean;
  remoteRevision: number | null; fields: string[]; detectedAt: string; canKeepBoth: boolean;
}
export type SyncConflictChoice = 'hub' | 'mine' | 'both';
/** An outbox op the Hub rejected (or that was too large); it never sends again until retried. */
export interface QuarantinedOpView {
  opId: string; entityType: string; entityId: string; category: SyncCategory | null; opKind: 'upsert' | 'delete'; reason: string | null;
  attempts: number; lastAttemptAt: string | null; createdAt: string; updatedAt: string;
}
export interface QuarantinedOpExport extends QuarantinedOpView { schemaVersion: number; basedOnRevision: number | null; payload: unknown | null }
export type SyncCategoryFlags = Partial<Record<SyncCategory, boolean>>;
/** What to do with one category on the first sync: combine both sides, take the Hub's copy, or leave the category off. */
export type FirstSyncChoice = 'merge' | 'use-hub' | 'keep-local';
export interface FirstSyncEntityRef { entityType: string; entityId: string; name: string | null }
/** Same-type items with the same name but different ids on this device and on the Hub. */
export interface FirstSyncNameCollision { entityType: string; name: string; localId: string; hubId: string }
export interface FirstSyncCategoryPreview {
  category: SyncCategory; label: string; sensitivity: 'non-sensitive' | 'sensitive'; defaultEnabled: boolean;
  localCount: number; hubCount: number; sameIdIdentical: number; sameIdDifferent: FirstSyncEntityRef[];
  sameNameDifferentId: FirstSyncNameCollision[];
  /** Items that exist only on this device (merge uploads them). */
  localOnly: number; hubOnly: number;
  /** What leaves this device if the category is synced. */
  disclosure: string;
  recommended: FirstSyncChoice;
}
/** Step one of the first sync. `confirmToken` is set when a choice could replace local data; it is single use and expires. */
export interface FirstSyncPreview {
  asOfRevision: number; digest: string; categories: FirstSyncCategoryPreview[];
  confirmToken: string | null; expiresAt: string | null;
}
/** Pushed to connected desktops (no `id`) whenever the sync status changes. */
export interface AgentSyncStatusEvent { type: 'event'; event: 'sync.status'; status: AgentSyncStatus }
/** Pushed after remote changes (or a conflict resolution) were written locally. */
export interface AgentSyncAppliedEvent { type: 'event'; event: 'sync.applied'; changes: AgentAppliedChange[] }
export type AgentEvent = AgentHubStatusEvent | AgentSyncStatusEvent | AgentSyncAppliedEvent;
export type AgentEventName = AgentEvent['event'];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Shape check for a push frame; unknown events return null so clients ignore frames they do not know. */
export function parseAgentEvent(frame: unknown): AgentEvent | null {
  if (!isRecord(frame) || frame['type'] !== 'event') return null;
  if ((frame['event'] === 'hub.status' || frame['event'] === 'sync.status') && isRecord(frame['status'])) return frame as unknown as AgentEvent;
  if (frame['event'] === 'sync.applied' && Array.isArray(frame['changes'])) return frame as unknown as AgentEvent;
  return null;
}
export interface LegacyImportResult { status: 'none' | 'done' | 'partial'; imported: Record<string, number>; warnings: string[] }

/**
 * Closed method table of the Device Agent RPC (main to agent). Main validates every request against
 * `AGENT_METHODS`; anything else is rejected before it reaches the agent.
 */
export interface AgentMethodMap {
  /** The store is opened from the startup config; this reports its health. */
  'store.open': { params: Record<string, never>; result: StoreHealth };
  'store.health': { params: Record<string, never>; result: StoreHealth };
  'store.hydrate': { params: Record<string, never>; result: DeviceStoreBoot };
  'kv.commit': { params: { mutations: KvMutation[] }; result: { count: number } };
  'entity.commit': { params: EntityCommit; result: EntityCommitResult };
  'entity.importMany': {
    params: { entityType: string; items: Array<{ entityId: string; payload: unknown }> };
    result: { ok: true; count: number; backpressure: boolean } | { ok: false; error: string };
  };
  'history.add': { params: { entry: AgentHistoryRecord }; result: { ok: true; evicted: number } | { ok: false; error: string } };
  'history.list': { params: { toolId?: string; limit?: number }; result: AgentHistoryRecord[] };
  'history.get': { params: { id: string }; result: AgentHistoryRecord | null };
  'history.remove': { params: { id: string }; result: { ok: true } };
  'history.clear': { params: Record<string, never>; result: { ok: true } };
  'history.clearTool': { params: { toolId: string }; result: { ok: true } };
  'network.add': { params: { run: AgentNetworkRun }; result: { ok: true; evicted: number } | { ok: false; error: string } };
  'network.list': { params: { limit?: number }; result: AgentNetworkRun[] };
  'network.get': { params: { id: string }; result: AgentNetworkRun | null };
  'network.remove': { params: { id: string }; result: { ok: true } };
  'network.clear': { params: Record<string, never>; result: { ok: true } };
  'journal.append': { params: { engine: JournalEngine; entry: AgentJournalEntry }; result: { ok: true } };
  /** Newest first. */
  'journal.list': { params: { engine: JournalEngine; limit?: number }; result: AgentJournalEntry[] };
  'journal.get': { params: { engine: JournalEngine; planId: string }; result: AgentJournalEntry | null };
  'journal.update': { params: { engine: JournalEngine; planId: string; entry: AgentJournalEntry }; result: { ok: boolean } };
  'journal.remove': { params: { engine: JournalEngine; planId: string }; result: { ok: true } };
  /** Drops the oldest entries beyond `keep` and returns them (so main can delete their backups). */
  'journal.trim': { params: { engine: JournalEngine; keep: number }; result: { removed: AgentJournalEntry[] } };
  'snapshots.upsert': { params: { kind: string; id: string; createdAt: number; header: unknown }; result: { ok: true } };
  'snapshots.list': { params: { kind: string }; result: AgentSnapshotHeader[] };
  'snapshots.get': { params: { kind: string; id: string }; result: AgentSnapshotHeader | null };
  'snapshots.remove': { params: { kind: string; id: string }; result: { ok: boolean } };
  'powershell.add': { params: { entry: { id: string; completedAt?: string; startedAt?: string; [field: string]: unknown } }; result: { ok: true } };
  'powershell.list': { params: Record<string, never>; result: unknown[] };
  'powershell.clear': { params: Record<string, never>; result: { ok: true } };
  'docs.get': { params: { name: string }; result: unknown | null };
  'docs.set': { params: { name: string; value: unknown }; result: { ok: true } };
  'docs.remove': { params: { name: string }; result: { ok: boolean } };
  'secrets.status': { params: { purpose: AgentSecretPurpose }; result: AgentSecretStatus };
  'secrets.list': { params: Record<string, never>; result: AgentSecretStatus[] };
  /** Main encrypts with safeStorage and passes the ciphertext; the agent stores it atomically with its reference. */
  'secrets.set': { params: { purpose: AgentSecretPurpose; ciphertext: Uint8Array }; result: AgentSecretStatus };
  'secrets.remove': { params: { purpose: AgentSecretPurpose }; result: AgentSecretStatus };
  /** Main-only: returns stored ciphertext for decryption in main; never exposed to the renderer. */
  'secrets.getCiphertext': { params: { purpose: AgentSecretPurpose }; result: { ciphertext: Uint8Array | null } };
  'device.rename': { params: { displayName: string }; result: { ok: true; displayName: string } | { ok: false; error: string } };
  'reset.preview': { params: { kind: ResetKind }; result: AgentResetPreview };
  /** `digest` is the one from the preview; a mismatch fails with `stale-preview`. */
  'reset.apply': { params: { kind: ResetKind; digest: string }; result: { ok: true } | { ok: false; error: string } };
  /** Public Hub enrollment, or null when standalone. Deliberately carries no key material. */
  'hub.enrollment': { params: Record<string, never>; result: AgentHubEnrollment | null };
  'hub.status': { params: Record<string, never>; result: AgentHubStatus };
  'hub.probeLocal': { params: { port?: number }; result: AgentHubProbe };
  'hub.enroll': { params: { pairingString: string }; result: AgentHubStatus };
  /**
   * First-run local Hub setup: reads and deletes `%LOCALAPPDATA%\DUDE\hub-handoff-<nonce>.json` (written by the elevated
   * `dude-hub setup-token --deliver-to`), bootstraps the Hub, self-enrolls through the normal pairing path and signs the
   * owner in. Errors: `handoff-missing`, `handoff-expired`, `already-bootstrapped`, `tls-pin-mismatch`, enrollment codes, `hub-*`.
   */
  'hub.bootstrapLocal': { params: { nonce: string; environmentName: string; ownerDisplayName: string; password: string }; result: AgentHubBootstrapResult };
  /** Online: tells the Hub then clears. Offline: `hub-unreachable` unless `force`, which clears locally only. */
  'hub.unenroll': { params: { force?: boolean }; result: { ok: true; hubStillListsDevice: boolean } };
  /** The password is only a parameter; the owner bearer lives in agent memory and is never returned. */
  'hub.owner.signIn': { params: { password: string }; result: AgentHubOwnerStatus };
  'hub.owner.signOut': { params: Record<string, never>; result: { ok: true } };
  'hub.owner.status': { params: Record<string, never>; result: AgentHubOwnerStatus };
  'hub.owner.listDevices': { params: Record<string, never>; result: DeviceListResponse };
  'hub.owner.createPairingCode': { params: { host?: string }; result: PairingCodeResponse };
  'hub.owner.renameDevice': { params: { deviceId: string; displayName: string }; result: DeviceInfo };
  'hub.owner.revokeDevicePreview': { params: { deviceId: string }; result: ConfirmPreview };
  'hub.owner.revokeDevice': { params: { deviceId: string; confirmToken: string }; result: { ok: true } };
  'hub.owner.setRecoveryTrust': { params: { deviceId: string; password: string; trusted: boolean }; result: DeviceInfo };
  'hub.owner.listSessions': { params: Record<string, never>; result: SessionListResponse };
  'hub.owner.revokeSession': { params: { sessionId: string }; result: { ok: true } };
  'hub.owner.revokeAllPreview': { params: Record<string, never>; result: ConfirmPreview };
  'hub.owner.revokeAll': { params: { confirmToken: string }; result: { ok: true } };
  'hub.owner.listAudit': { params: { beforeSeq?: number; limit?: number }; result: AuditListResponse };
  'hub.owner.recoveryCodesPreview': { params: Record<string, never>; result: ConfirmPreview };
  'hub.owner.regenerateRecoveryCodes': { params: { confirmToken: string }; result: RecoveryCodesResponse };
  'hub.owner.changePassword': { params: { currentPassword: string; newPassword: string }; result: { ok: true } };
  /**
   * Device-assisted owner recovery (PD-029). The caller (desktop main) must have passed the user-presence gate first;
   * the new password is a parameter only. Errors: `not-trusted`, `owner-recovery-failed`, `hub-*`.
   */
  'hub.recoverOwner': { params: { newPassword: string }; result: { ok: true } };
  'sync.status': { params: Record<string, never>; result: AgentSyncStatus };
  /** Enabling a category re-fetches it from the Hub (a snapshot rebase). */
  'sync.setCategories': { params: { categories: SyncCategoryFlags }; result: AgentSyncStatus };
  'sync.setPaused': { params: { paused: boolean }; result: AgentSyncStatus };
  /** Runs a sync cycle now and resolves with the status once it ended. */
  'sync.now': { params: Record<string, never>; result: AgentSyncStatus };
  'sync.conflicts.list': { params: Record<string, never>; result: SyncConflictView[] };
  'sync.conflicts.resolve': { params: { id: number; choice: SyncConflictChoice }; result: { ok: true; changes: AgentAppliedChange[] } | { ok: false; error: string } };
  'sync.quarantine.list': { params: Record<string, never>; result: QuarantinedOpView[] };
  /** Returns the ops (all, or the given ids) to pending; resolves with how many moved. */
  'sync.quarantine.retry': { params: { opIds?: string[] }; result: { retried: number } };
  /** Step one of discarding a quarantined op (the local record stays); the token is single use and expires. */
  'sync.quarantine.discardPreview': { params: { opId: string }; result: ConfirmPreview };
  'sync.quarantine.discard': { params: { opId: string; confirmToken: string }; result: { ok: true } };
  /** JSON-safe copy of every quarantined op, to save before discarding. */
  'sync.quarantine.export': { params: Record<string, never>; result: QuarantinedOpExport[] };
  /** Fetches the Hub snapshot and compares it with this device (nothing is written). Errors: `not-enrolled`, `first-sync-done`, `hub-*`. */
  'sync.firstSync.preview': { params: Record<string, never>; result: FirstSyncPreview };
  /**
   * Runs the first sync once, resumably. `use-hub` for any category takes a recovery snapshot first and requires the preview's
   * `confirmToken`. Errors: `first-sync-stale` (re-preview), `invalid-token`, `confirmation-required`.
   */
  'sync.firstSync.apply': { params: { choices: Partial<Record<SyncCategory, FirstSyncChoice>>; digest: string; confirmToken?: string }; result: AgentSyncStatus };
  /** Implemented by the legacy import (M621). */
  'legacy.import': { params: { legacyDir: string; sources: unknown }; result: LegacyImportResult };
  /**
   * Clean-exit marker. `launch` reports how the previous run ended (`none` on a first launch) and marks this
   * run unclean; `quit` marks it clean. `check` only reads.
   */
  'store.cleanExit': { params: { action: 'launch' | 'quit' | 'check' }; result: { previous: 'none' | 'clean' | 'unclean' } };
  /** Folds the write-ahead log into the database file without closing anything; the desktop sends it before detaching on quit. */
  'store.checkpoint': { params: Record<string, never>; result: { ok: true } };
  /** Checkpoints, closes the store and exits the agent process. */
  'store.shutdown': { params: Record<string, never>; result: { ok: true } };
  /**
   * Recovery for an unusable store (corrupt/incompatible): moves the database files to `quarantine/<ts>/` from inside the
   * agent, which holds them open (Windows cannot rename open files), then the agent exits so main can start a fresh one.
   * Refused with `forbidden` while the store is open.
   */
  'store.quarantine': { params: Record<string, never>; result: { ok: true; path: string } };
}

export type AgentMethod = keyof AgentMethodMap;

export interface AgentRequest<M extends AgentMethod = AgentMethod> {
  id: number;
  method: M;
  params: AgentMethodMap[M]['params'];
}

export type AgentResponse<M extends AgentMethod = AgentMethod> =
  | { id: number; ok: true; result: AgentMethodMap[M]['result'] }
  | { id: number; ok: false; error: { code: string; message: string } };

/** Runtime allowlist; must list exactly the keys of `AgentMethodMap` (enforced by the type below). */
export const AGENT_METHODS = [
  'store.open', 'store.health', 'store.hydrate', 'kv.commit', 'entity.commit', 'entity.importMany',
  'history.add', 'history.list', 'history.get', 'history.remove', 'history.clear', 'history.clearTool',
  'network.add', 'network.list', 'network.get', 'network.remove', 'network.clear',
  'journal.append', 'journal.list', 'journal.get', 'journal.update', 'journal.remove', 'journal.trim',
  'snapshots.upsert', 'snapshots.list', 'snapshots.get', 'snapshots.remove',
  'powershell.add', 'powershell.list', 'powershell.clear',
  'docs.get', 'docs.set', 'docs.remove',
  'secrets.status', 'secrets.list', 'secrets.set', 'secrets.remove', 'secrets.getCiphertext',
  'device.rename', 'reset.preview', 'reset.apply', 'hub.enrollment',
  'hub.status', 'hub.probeLocal', 'hub.enroll', 'hub.bootstrapLocal', 'hub.unenroll', 'hub.owner.signIn', 'hub.owner.signOut', 'hub.owner.status',
  'hub.owner.listDevices', 'hub.owner.createPairingCode', 'hub.owner.renameDevice', 'hub.owner.revokeDevicePreview', 'hub.owner.revokeDevice',
  'hub.owner.setRecoveryTrust', 'hub.owner.listSessions', 'hub.owner.revokeSession', 'hub.owner.revokeAllPreview', 'hub.owner.revokeAll',
  'hub.owner.listAudit', 'hub.owner.recoveryCodesPreview', 'hub.owner.regenerateRecoveryCodes', 'hub.owner.changePassword', 'hub.recoverOwner',
  'sync.status', 'sync.setCategories', 'sync.setPaused', 'sync.now', 'sync.conflicts.list', 'sync.conflicts.resolve',
  'sync.quarantine.list', 'sync.quarantine.retry', 'sync.quarantine.discardPreview', 'sync.quarantine.discard', 'sync.quarantine.export',
  'sync.firstSync.preview', 'sync.firstSync.apply',
  'legacy.import', 'store.cleanExit', 'store.checkpoint', 'store.shutdown', 'store.quarantine',
] as const satisfies readonly AgentMethod[];

// Compile-time exhaustiveness: fails if a method is added to the map but not to AGENT_METHODS.
type _MissingMethods = Exclude<AgentMethod, typeof AGENT_METHODS[number]>;
const _agentMethodsExhaustive: [_MissingMethods] extends [never] ? true : never = true;

export function isAgentMethod(value: unknown): value is AgentMethod {
  return typeof value === 'string' && (AGENT_METHODS as readonly string[]).includes(value);
}
void _agentMethodsExhaustive;
