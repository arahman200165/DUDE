import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import { activeLocalBackend } from './local-backend-registry';
import { createWindowStorageBackend } from './window-storage-backend';

export type StorageKind = 'local' | 'session';

/** Extra context for a write. Window storage ignores it; the device kv backend forwards it to the store. */
export interface StorageWriteMeta {
  readonly policy?: PersistencePolicy;
  readonly scope?: DataScope;
}

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string, meta?: StorageWriteMeta): boolean;
  remove(key: string): void;
  keys(prefix: string): string[];
  /**
   * Remote (other device) change already in the Device Store: updates the in-memory value WITHOUT scheduling a write.
   * `null` removes the key. Returns false when the key has an unflushed local write (the agent re-emits after it
   * commits) or when the backend has no remote source. Only the device kv backend implements it.
   */
  applyRemote?(namespace: string, key: string, value: unknown): boolean;
}

/**
 * `'local'` is a thin proxy that resolves the active backend on every call, so the device-store
 * backend installed in `main.ts` (before bootstrap) is picked up even by module-level constants.
 */
export function createStorageBackend(kind: StorageKind): StorageBackend {
  if (kind === 'session') return createWindowStorageBackend('session');
  return {
    get: (key) => activeLocalBackend().get(key),
    set: (key, value, meta) => activeLocalBackend().set(key, value, meta),
    remove: (key) => activeLocalBackend().remove(key),
    keys: (prefix) => activeLocalBackend().keys(prefix),
  };
}
