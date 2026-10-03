import { ENTITY_CODECS } from '../codecs/index.js';
import { SETTING_ENTITY_TYPE, settingCodec } from '../codecs/setting.codec.js';
import { findSettingDefinition } from '../settings/core-setting-definitions.js';
import { findKvEntityBinding } from '../settings/kv-entity-bindings.js';
import { isSyncableSettingKey } from '../settings/syncable-key.js';
import type { SyncableToolInfo } from '../settings/syncable-key.js';

const TOOL_ID = /^[a-z0-9][a-z0-9-]*$/;

/** The sync entity a kv key journals as (Phase 31E: browsers build the same ops as the Device Agent). */
export interface KvSyncEntity {
  readonly entityType: string;
  readonly entityId: string;
  readonly schemaVersion: number;
  /** A `setting` record wraps `{namespace, key, value}`; a bound singleton carries the bare value. */
  readonly wrapped: boolean;
}

function setting(namespace: string, key: string): KvSyncEntity {
  return { entityType: SETTING_ENTITY_TYPE, entityId: `${namespace}:${key}`, schemaVersion: settingCodec.schemaVersion, wrapped: true };
}

function bound(entityType: string, entityId: string): KvSyncEntity {
  return { entityType, entityId, schemaVersion: ENTITY_CODECS[entityType]?.schemaVersion ?? 1, wrapped: false };
}

/**
 * The sync entity a stored kv write journals as, or undefined when it stays origin-local. The same rule as the desktop
 * store's `kvSyncEntity` in the Device Agent: a bound singleton, a `journal: true` core key, or a `local`-policy key the
 * renderer resolved to `environment` scope in a tool-id-shaped namespace.
 */
export function kvSyncEntityOf(namespace: string, key: string, policy: string | undefined, scope: string | undefined): KvSyncEntity | undefined {
  const binding = findKvEntityBinding(namespace, key);
  if (binding) return bound(binding.entityType, binding.entityId);
  const syncs =
    findSettingDefinition(namespace, key)?.journal === true ||
    (policy === 'local' && scope === 'environment' && TOOL_ID.test(namespace) &&
      isSyncableSettingKey(namespace, key, [{ id: namespace, persistence: { preferences: 'local' }, settingScopes: { [key]: { scope: 'environment' } } }]));
  return syncs ? setting(namespace, key) : undefined;
}

/** The same decision from the key alone, for keys already in browser storage (no write meta): needs the tool manifests. */
export function kvSyncEntityOfStored(namespace: string, key: string, tools: readonly SyncableToolInfo[]): KvSyncEntity | undefined {
  const binding = findKvEntityBinding(namespace, key);
  if (binding) return bound(binding.entityType, binding.entityId);
  return findSettingDefinition(namespace, key)?.journal === true || isSyncableSettingKey(namespace, key, tools) ? setting(namespace, key) : undefined;
}
