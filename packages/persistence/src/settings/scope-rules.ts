import type { DataScope, DataSensitivity } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';

export type ToolSettingScopeOverride = { scope: DataScope; sensitivity?: DataSensitivity };

/**
 * Scope of a tool's persisted key. A manifest override wins; otherwise `local` is a preference
 * (environment), `session`/`user-choice`/`none` are inputs (local-only) and `secure-local` is device.
 */
export function resolveToolKeyScope(policy: PersistencePolicy, override?: { scope: DataScope }): DataScope {
  if (override) return override.scope;
  switch (policy) {
    case 'local': return 'environment';
    case 'secure-local': return 'device';
    default: return 'local-only';
  }
}
