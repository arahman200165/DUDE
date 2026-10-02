import type { EntityCodec } from '@dude/persistence';
import { buildStorageKey } from '@dude/tool-engine/core/persistence/persistence-keys';
import type { StorageBackend } from '../storage-backend';
import type { LegacyBlob } from './entity-store';

export const ENTITY_IMPORT_NAMESPACE = '__entity-import__';

const markerKey = (entityType: string): string => buildStorageKey(ENTITY_IMPORT_NAMESPACE, entityType);
const blobKey = (legacy: LegacyBlob<unknown>): string => buildStorageKey(legacy.namespace, legacy.key);

export const isEntityImportDone = (backend: StorageBackend, entityType: string): boolean => backend.get(markerKey(entityType)) !== null;

/** Decodes the old blob (from the hydrated kv) into items; empty when absent, unparseable or already imported. */
export function readLegacyItems<T, C = void>(backend: StorageBackend, codec: EntityCodec<T, C>, legacy: LegacyBlob<T>, context?: C): T[] {
  if (isEntityImportDone(backend, codec.entityType)) return [];
  const raw = backend.get(blobKey(legacy as LegacyBlob<unknown>));
  if (raw === null) return [];
  let blob: unknown;
  try {
    blob = JSON.parse(raw);
  } catch {
    return [];
  }
  const items: T[] = [];
  for (const entry of legacy.toItems(blob)) {
    const value = codec.decode(entry, context as C);
    if (value !== null && value !== undefined) items.push(value);
  }
  return items;
}

/** After a committed import (or when the store already holds records): drop the old blob and mark the type done. */
export function finishLegacyImport(backend: StorageBackend, entityType: string, legacy: LegacyBlob<unknown>): void {
  backend.set(markerKey(entityType), 'true', { policy: 'local' });
  backend.remove(blobKey(legacy));
}
