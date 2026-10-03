import type { WireOp } from './records.js';

export const SETTING_ENTITY = 'setting';

/** A kv setting's entity id (`<namespace>:<key>`), identical to the desktop store's. */
export const settingEntityKey = (namespace: string, key: string): string => `${namespace}:${key}`;

export function splitSettingId(entityId: string): { namespace: string; key: string } | undefined {
  const i = entityId.indexOf(':');
  return i <= 0 || i === entityId.length - 1 ? undefined : { namespace: entityId.slice(0, i), key: entityId.slice(i + 1) };
}

/** The payload a `setting` record carries; a bound singleton (workspace layout, scratchpad) carries the bare value. */
export const settingPayload = (namespace: string, key: string, value: unknown): { namespace: string; key: string; value: unknown } => ({ namespace, key, value });

/** The kv value inside a `setting` payload, or undefined when the payload is malformed. */
export function settingValueOf(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && Object.hasOwn(payload, 'value') ? (payload as { value: unknown }).value : undefined;
}

export interface OpInput {
  readonly opId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly schemaVersion: number;
  readonly basedOnRevision: number | null;
  /** Null builds a delete. */
  readonly payload: unknown;
}

/** The wire op the Device Agent would journal for the same change: upsert with the codec-encoded payload, or delete with none. */
export function buildOp(input: OpInput): WireOp {
  const deleted = input.payload === null;
  return {
    opId: input.opId,
    entityType: input.entityType,
    entityId: input.entityId,
    opKind: deleted ? 'delete' : 'upsert',
    schemaVersion: input.schemaVersion,
    basedOnRevision: input.basedOnRevision,
    payload: deleted ? null : input.payload,
  };
}

/** A change as `RemoteChangesService.apply` consumes it (the desktop `AgentAppliedChange` shape). */
export interface AppliedChangeShape {
  entityType: string;
  entityId: string;
  deleted: boolean;
  payload: unknown;
  namespace?: string;
  key?: string;
  value?: unknown;
}

/** Maps a Hub record to the applied-change shape; a `setting` also gets `namespace`/`key`/`value`. */
export function toAppliedChange(record: { entityType: string; entityId: string; deleted: boolean; payload: unknown }): AppliedChangeShape {
  const deleted = record.deleted || record.payload === null;
  const change: AppliedChangeShape = { entityType: record.entityType, entityId: record.entityId, deleted, payload: deleted ? null : record.payload };
  if (record.entityType === SETTING_ENTITY) {
    const ref = splitSettingId(record.entityId);
    if (ref) {
      change.namespace = ref.namespace;
      change.key = ref.key;
      if (!deleted) change.value = settingValueOf(record.payload);
    }
  }
  return change;
}
