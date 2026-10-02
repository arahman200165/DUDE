import { computed } from '@angular/core';
import type { EntityCodec } from '@dude/persistence';
import type { PersistenceService } from '../persistence.service';
import type { EntityCollection, EntityWriteResult, LegacyBlob } from './entity-store';

const OK: EntityWriteResult = { ok: true };

/**
 * Web (and desktop without a store bridge): the collection stays one JSON blob under its original
 * `local` key, so existing user data and fixtures keep working. Items are decoded per record by the codec,
 * and other tabs' writes are adopted live through `PersistenceService`.
 */
export function createBrowserEntityCollection<T, C = void>(
  persistence: PersistenceService,
  codec: EntityCodec<T, C>,
  legacy: LegacyBlob<T>,
  context?: C,
): EntityCollection<T> {
  const blob = persistence.signal<unknown>(legacy.namespace, legacy.key, 'local', legacy.fromItems([]), { crossTab: 'live' });

  const items = computed<readonly T[]>(() => {
    const decoded: T[] = [];
    for (const raw of legacy.toItems(blob())) {
      const value = codec.decode(raw, context as C);
      if (value !== null && value !== undefined) decoded.push(value);
    }
    return decoded;
  });

  const write = (next: readonly T[]): EntityWriteResult => {
    blob.set(legacy.fromItems(next));
    return OK;
  };

  return {
    items,
    get: (id) => items().find((value) => codec.idOf(value) === id),
    async upsert(value) {
      const id = codec.idOf(value);
      const current = items();
      const index = current.findIndex((existing) => codec.idOf(existing) === id);
      return write(index === -1 ? [...current, value] : current.map((existing, i) => (i === index ? value : existing)));
    },
    async remove(id) {
      const current = items();
      if (!current.some((value) => codec.idOf(value) === id)) return OK;
      return write(current.filter((value) => codec.idOf(value) !== id));
    },
    async importMany(values) {
      if (values.length === 0) return OK;
      const merged = [...items()];
      for (const value of values) {
        const index = merged.findIndex((existing) => codec.idOf(existing) === codec.idOf(value));
        if (index === -1) merged.push(value);
        else merged[index] = value;
      }
      return write(merged);
    },
  };
}
