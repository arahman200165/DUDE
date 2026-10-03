import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import { SETTING_DEFINITIONS } from './core-setting-definitions.js';

export interface SyncableToolInfo {
  readonly id: string;
  readonly persistence?: { readonly preferences?: PersistencePolicy };
  readonly settingScopes?: Readonly<Record<string, { scope: DataScope }>>;
}

/**
 * Whether a kv key syncs through the Hub (Phase 31D). Shared by the Hub validator and the device journaling rule so
 * they always agree. True iff (a) a core setting definition is `environment` scope in `kv` storage, or (b) the
 * namespace is a tool id whose manifest preferences policy is `local` and whose `settingScopes[key]` (if any) is
 * `environment`. Everything else does not sync.
 */
export function isSyncableSettingKey(namespace: string, key: string, tools: readonly SyncableToolInfo[]): boolean {
  const definition = SETTING_DEFINITIONS.find((d) => d.namespace === namespace && d.name === key);
  if (definition) return definition.scope === 'environment' && definition.storage === 'kv';
  const tool = tools.find((t) => t.id === namespace);
  if (!tool || tool.persistence?.preferences !== 'local') return false;
  const override = tool.settingScopes?.[key];
  return override === undefined || override.scope === 'environment';
}
