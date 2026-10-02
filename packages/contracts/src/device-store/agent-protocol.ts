import type { EntityCommit, EntityCommitResult, KvMutation, ResetKind, ResetPreview, StoreHealth, DeviceStoreBoot } from './device-store.model.js';

/** Loosely typed row shapes; later milestones may refine them. */
export interface AgentHistoryRecord { id: string; toolId: string; createdAt: number; sizeBytes: number; payload: unknown }
export interface AgentNetworkRun { id: string; createdAt: number; sizeBytes: number; payload: unknown }
export type JournalEngine = 'fs' | 'sys';
export interface AgentJournalEntry { id: string; planId: string; appliedAt: string; entry: unknown }
export type AgentSecretPurpose = string;
export interface AgentSecretStatus { purpose: AgentSecretPurpose; isSet: boolean; hint: string | null; needsReentry: boolean }
export interface LegacyImportResult { status: 'none' | 'done' | 'partial'; imported: Record<string, number>; warnings: string[] }

/**
 * Closed method table of the Device Agent RPC (main to agent). Main validates every request against
 * `AGENT_METHODS`; anything else is rejected before it reaches the agent.
 */
export interface AgentMethodMap {
  'store.open': { params: { userDataDir: string; appVersion: string; platform: string; machineFingerprint: string | null }; result: StoreHealth };
  'store.health': { params: Record<string, never>; result: StoreHealth };
  'store.hydrate': { params: Record<string, never>; result: DeviceStoreBoot };
  'kv.commit': { params: { mutations: KvMutation[] }; result: { count: number } };
  'entity.commit': { params: EntityCommit; result: EntityCommitResult };
  'entity.importMany': { params: { entityType: string; items: Array<{ entityId: string; payload: unknown }> }; result: EntityCommitResult };
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
  'journal.list': { params: { engine: JournalEngine; limit?: number }; result: AgentJournalEntry[] };
  'journal.get': { params: { engine: JournalEngine; id: string }; result: AgentJournalEntry | null };
  'journal.update': { params: { engine: JournalEngine; id: string; entry: unknown }; result: { ok: boolean } };
  'journal.trim': { params: { engine: JournalEngine; keep: number }; result: { removed: number } };
  'docs.get': { params: { name: string }; result: unknown | null };
  'docs.set': { params: { name: string; value: unknown }; result: { ok: true } };
  'secrets.status': { params: { purpose: AgentSecretPurpose }; result: AgentSecretStatus };
  'secrets.set': { params: { purpose: AgentSecretPurpose; ciphertext: string; hint: string | null }; result: AgentSecretStatus };
  'secrets.remove': { params: { purpose: AgentSecretPurpose }; result: AgentSecretStatus };
  /** Main-only: returns stored ciphertext for decryption in main; never exposed to the renderer. */
  'secrets.getCiphertext': { params: { purpose: AgentSecretPurpose }; result: { ciphertext: string | null } };
  'device.rename': { params: { displayName: string }; result: { ok: true; displayName: string } | { ok: false; error: string } };
  'reset.preview': { params: { kind: ResetKind }; result: ResetPreview };
  'reset.apply': { params: { kind: ResetKind; token: string }; result: { ok: true } | { ok: false; error: string } };
  'legacy.import': { params: { legacyDir: string; sources: unknown }; result: LegacyImportResult };
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
  'journal.append', 'journal.list', 'journal.get', 'journal.update', 'journal.trim',
  'docs.get', 'docs.set', 'secrets.status', 'secrets.set', 'secrets.remove', 'secrets.getCiphertext',
  'device.rename', 'reset.preview', 'reset.apply', 'legacy.import', 'store.shutdown',
] as const satisfies readonly AgentMethod[];

// Compile-time exhaustiveness: fails if a method is added to the map but not to AGENT_METHODS.
type _MissingMethods = Exclude<AgentMethod, typeof AGENT_METHODS[number]>;
const _agentMethodsExhaustive: [_MissingMethods] extends [never] ? true : never = true;

export function isAgentMethod(value: unknown): value is AgentMethod {
  return typeof value === 'string' && (AGENT_METHODS as readonly string[]).includes(value);
}
void _agentMethodsExhaustive;
