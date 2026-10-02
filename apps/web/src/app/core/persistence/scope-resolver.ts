import { findSettingDefinition, resolveToolKeyScope } from '@dude/persistence';
import type { DataScope } from '@dude/domain';
import { TOOL_METADATA } from '@dude/tool-registry';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';

export type ManifestScopeLookup = (namespace: string, key: string) => { scope: DataScope } | undefined;

let manifestIndex: Map<string, NonNullable<(typeof TOOL_METADATA)[number]['settingScopes']>> | null = null;

/** Built lazily from the generated registry so core never names a tool. */
const registryLookup: ManifestScopeLookup = (namespace, key) => {
  if (!manifestIndex) {
    manifestIndex = new Map();
    for (const tool of TOOL_METADATA) if (tool.settingScopes) manifestIndex.set(tool.id, tool.settingScopes);
  }
  return manifestIndex.get(namespace)?.[key];
};

/**
 * Scope of a persisted key/value: a core setting definition wins, then the owning tool's manifest
 * `settingScopes[key]`, then the policy rule (`local` is environment, the rest local-only).
 */
export function resolveKvScope(namespace: string, key: string, policy: PersistencePolicy, manifestLookup: ManifestScopeLookup = registryLookup): DataScope {
  const definition = findSettingDefinition(namespace, key);
  if (definition) return definition.scope;
  return resolveToolKeyScope(policy, manifestLookup(namespace, key));
}
