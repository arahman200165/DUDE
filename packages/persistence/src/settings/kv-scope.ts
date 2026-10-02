import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import { findSettingDefinition } from './core-setting-definitions.js';
import { resolveToolKeyScope } from './scope-rules.js';

/** Looks up a tool manifest's `settingScopes[key]` override for a persisted key's namespace. */
export type ManifestScopeLookup = (namespace: string, key: string) => { scope: DataScope } | undefined;

/** Builds a lookup from tool metadata (`id` + optional `settingScopes`), indexed once. */
export function createManifestScopeLookup(
  tools: readonly { id: string; settingScopes?: Readonly<Record<string, { scope: DataScope }>> }[],
): ManifestScopeLookup {
  const index = new Map<string, Readonly<Record<string, { scope: DataScope }>>>();
  for (const tool of tools) if (tool.settingScopes) index.set(tool.id, tool.settingScopes);
  return (namespace, key) => index.get(namespace)?.[key];
}

const noManifestOverrides: ManifestScopeLookup = () => undefined;

/**
 * Scope of a persisted key/value: a core setting definition wins, then the owning tool's manifest
 * `settingScopes[key]`, then the policy rule (`local` is environment, the rest local-only).
 */
export function resolveKvScope(
  namespace: string,
  key: string,
  policy: PersistencePolicy,
  manifestLookup: ManifestScopeLookup = noManifestOverrides,
): DataScope {
  const definition = findSettingDefinition(namespace, key);
  if (definition) return definition.scope;
  return resolveToolKeyScope(policy, manifestLookup(namespace, key));
}
