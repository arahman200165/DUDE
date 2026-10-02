import { isKnownEntityType } from '@dude/persistence';
import type { EntityCommit, KvMutation, KvScope } from '@dude/contracts';

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
