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
  /** Implemented by the legacy import (M621). */
  'legacy.import': { params: { legacyDir: string; sources: unknown }; result: LegacyImportResult };
  /**
   * Clean-exit marker. `launch` reports how the previous run ended (`none` on a first launch) and marks this
   * run unclean; `quit` marks it clean. `check` only reads.
   */
  'store.cleanExit': { params: { action: 'launch' | 'quit' | 'check' }; result: { previous: 'none' | 'clean' | 'unclean' } };
  'store.shutdown': { params: Record<string, never>; result: { ok: true } };
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
  'device.rename', 'reset.preview', 'reset.apply', 'legacy.import', 'store.cleanExit', 'store.shutdown',
] as const satisfies readonly AgentMethod[];

// Compile-time exhaustiveness: fails if a method is added to the map but not to AGENT_METHODS.
type _MissingMethods = Exclude<AgentMethod, typeof AGENT_METHODS[number]>;
const _agentMethodsExhaustive: [_MissingMethods] extends [never] ? true : never = true;

export function isAgentMethod(value: unknown): value is AgentMethod {
  return typeof value === 'string' && (AGENT_METHODS as readonly string[]).includes(value);
}
void _agentMethodsExhaustive;
