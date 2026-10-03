import type { EntityCodec } from './entity-codec.js';
import { isNonEmptyString, isRecord } from './codec-helpers.js';

export const SETTING_ENTITY_TYPE = 'setting';

/** A synced kv setting. `id` is `<namespace>:<key>`; `value` is any JSON value. */
export interface SettingEntity {
  readonly namespace: string;
  readonly key: string;
  readonly value: unknown;
}

export const settingEntityId = (namespace: string, key: string): string => `${namespace}:${key}`;

/**
 * Codec for synced kv settings. Deliberately NOT in `ENTITY_CODECS` (the device commit path and the desktop store
 * validation address kv through the kv repository, not generic entity commits); the Hub adds it to its codec lookup.
 */
export const settingCodec: EntityCodec<SettingEntity> = {
  entityType: SETTING_ENTITY_TYPE,
  schemaVersion: 1,
  scope: 'environment',
  sensitivity: 'non-sensitive',
  journaled: true,
  idOf: (s) => settingEntityId(s.namespace, s.key),
  decode(raw) {
    if (!isRecord(raw)) return null;
    const { namespace, key } = raw;
    if (!isNonEmptyString(namespace) || !isNonEmptyString(key)) return null;
    if (!Object.hasOwn(raw, 'value') || raw['value'] === undefined) return null;
    return { namespace, key, value: raw['value'] };
  },
  encode: (s) => ({ namespace: s.namespace, key: s.key, value: s.value }),
};
