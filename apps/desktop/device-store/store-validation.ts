import { isKnownEntityType } from '@dude/persistence';
import type { AgentHistoryRecord, AgentNetworkRun, EntityCommit, KvMutation, KvScope } from '@dude/contracts';

/** Bounds and shapes for everything the renderer may send to the device store. Main never trusts the renderer. */
export const MAX_VALUE_BYTES = 2 * 1024 * 1024;
export const MAX_BATCH = 1000;
const NAMESPACE = /^[A-Za-z0-9_.-]{1,64}$/;
const KEY = /^[A-Za-z0-9_.:-]{1,128}$/;
const SCOPES = new Set(['environment', 'workspace', 'device', 'local-only']);
const POLICIES = new Set(['none', 'session', 'local', 'user-choice']);

export type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function jsonSize(value: unknown): number | null {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : json.length;
  } catch {
    return null;
  }
}

function payloadError(value: unknown): string | null {
  const size = jsonSize(value);
  if (size === null) return 'Value is not JSON serializable.';
  return size > MAX_VALUE_BYTES ? 'Value is too large.' : null;
}

export function validateKvMutation(raw: unknown): Validated<KvMutation> {
  if (!isObject(raw)) return fail('Mutation must be an object.');
  const { namespace, key, value, remove, policy, scope } = raw;
  if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) return fail('Invalid namespace.');
  if (typeof key !== 'string' || !KEY.test(key)) return fail('Invalid key.');
  if (typeof policy !== 'string' || !POLICIES.has(policy)) return fail('Invalid policy.');
  if (remove !== undefined && typeof remove !== 'boolean') return fail('Invalid remove flag.');
  if (scope !== undefined && (typeof scope !== 'string' || !SCOPES.has(scope))) return fail('Invalid scope.');
  const error = payloadError(value);
  if (error) return fail(error);
  const mutation: KvMutation = { namespace, key, policy: policy as KvMutation['policy'] };
  if (scope !== undefined) mutation.scope = scope as KvScope;
  if (remove === true) mutation.remove = true;
  else if (value !== undefined) mutation.value = value;
  return { ok: true, value: mutation };
}

export function validateKvBatch(raw: unknown): Validated<KvMutation[]> {
  if (!Array.isArray(raw)) return fail('Mutations must be an array.');
  if (raw.length > MAX_BATCH) return fail('Too many mutations.');
  const out: KvMutation[] = [];
  for (const item of raw) {
    const result = validateKvMutation(item);
    if (!result.ok) return result;
    out.push(result.value);
  }
  return { ok: true, value: out };
}

export function validateEntityCommit(raw: unknown): Validated<EntityCommit> {
  if (!isObject(raw)) return fail('Commit must be an object.');
  const { entityType, entityId, op, payload } = raw;
  if (typeof entityType !== 'string' || !isKnownEntityType(entityType)) return fail('Unknown entity type.');
  if (typeof entityId !== 'string' || entityId.length < 1 || entityId.length > 200) return fail('Invalid entity id.');
  if (op !== 'upsert' && op !== 'delete') return fail('Invalid operation.');
  const error = payloadError(payload);
  if (error) return fail(error);
  const commit: EntityCommit = { entityType, entityId, op };
  if (op === 'upsert' && payload !== undefined) commit.payload = payload;
  return { ok: true, value: commit };
}

export function validateEntityBatch(raw: unknown): Validated<EntityCommit[]> {
  if (!Array.isArray(raw)) return fail('Commits must be an array.');
  if (raw.length > MAX_BATCH) return fail('Too many commits.');
  const out: EntityCommit[] = [];
  for (const item of raw) {
    const result = validateEntityCommit(item);
    if (!result.ok) return result;
    out.push(result.value);
  }
  return { ok: true, value: out };
}

/** Local History records are capped at 256 KiB by the store; main refuses anything past this looser bound first. */
export const MAX_HISTORY_RECORD_BYTES = 300 * 1024;
/** Network runs are capped at 50 MB by the store; main allows a little headroom for the envelope. */
export const MAX_NETWORK_RUN_BYTES = 51 * 1000 * 1000;
export const MAX_RECORD_ID_LENGTH = 200;
const MAX_LIST_LIMIT = 5000;

export function validateRecordId(raw: unknown, label = 'id'): Validated<string> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RECORD_ID_LENGTH) return fail(`Invalid ${label}.`);
  return { ok: true, value: raw };
}

function validateLimit(raw: unknown): Validated<number | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_LIST_LIMIT) return fail('Invalid limit.');
  return { ok: true, value: raw };
}

function validateRecordBody(raw: unknown, maxBytes: number): Validated<{ id: string; createdAt: number; sizeBytes: number; payload: unknown; source: Record<string, unknown> }> {
  if (!isObject(raw)) return fail('Record must be an object.');
  const id = validateRecordId(raw['id']);
  if (!id.ok) return id;
  const { createdAt, sizeBytes, payload } = raw;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt < 0) return fail('Invalid createdAt.');
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) return fail('Invalid sizeBytes.');
  const size = jsonSize(payload);
  if (size === null) return fail('Payload is not JSON serializable.');
  if (size > maxBytes) return fail('Payload is too large.');
  return { ok: true, value: { id: id.value, createdAt, sizeBytes, payload, source: raw } };
}

export function validateHistoryRecord(raw: unknown): Validated<AgentHistoryRecord> {
  const body = validateRecordBody(raw, MAX_HISTORY_RECORD_BYTES);
  if (!body.ok) return body;
  const toolId = validateRecordId(body.value.source['toolId'], 'toolId');
  if (!toolId.ok) return toolId;
  const { id, createdAt, sizeBytes, payload } = body.value;
  return { ok: true, value: { id, toolId: toolId.value, createdAt, sizeBytes, payload } };
}

export function validateNetworkRun(raw: unknown): Validated<AgentNetworkRun> {
  const body = validateRecordBody(raw, MAX_NETWORK_RUN_BYTES);
  if (!body.ok) return body;
  const { id, createdAt, sizeBytes, payload } = body.value;
  return { ok: true, value: { id, createdAt, sizeBytes, payload } };
}

export function validateHistoryQuery(raw: unknown): Validated<{ toolId?: string; limit?: number }> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (!isObject(raw)) return fail('Query must be an object.');
  const out: { toolId?: string; limit?: number } = {};
  if (raw['toolId'] !== undefined) {
    const toolId = validateRecordId(raw['toolId'], 'toolId');
    if (!toolId.ok) return toolId;
    out.toolId = toolId.value;
  }
  const limit = validateLimit(raw['limit']);
  if (!limit.ok) return limit;
  if (limit.value !== undefined) out.limit = limit.value;
  return { ok: true, value: out };
}

export function validateNetworkQuery(raw: unknown): Validated<{ limit?: number }> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (!isObject(raw)) return fail('Query must be an object.');
  const limit = validateLimit(raw['limit']);
  if (!limit.ok) return limit;
  return { ok: true, value: limit.value === undefined ? {} : { limit: limit.value } };
}
