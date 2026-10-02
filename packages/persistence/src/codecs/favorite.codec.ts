import type { FavoritesStore } from '@dude/domain/core/favorites/favorites.model';
import type { EntityCodec } from './entity-codec.js';
import { isNonEmptyString, isRecord, optionalString } from './codec-helpers.js';

export type FavoriteKind = 'tool' | 'pipeline';

/** One pinned item = one journaled record. `id` is `<kind>:<targetId>`. */
export interface FavoriteItem {
  readonly id: string;
  readonly kind: FavoriteKind;
  readonly targetId: string;
  /** Position across the whole list (tools first, then pipelines, as the legacy store orders them). */
  readonly order: number;
  readonly pinnedAt?: string;
}

export const favoriteItemId = (kind: FavoriteKind, targetId: string): string => `${kind}:${targetId}`;

export const favoriteCodec: EntityCodec<FavoriteItem> = {
  entityType: 'favorite',
  schemaVersion: 1,
  scope: 'environment',
  sensitivity: 'non-sensitive',
  journaled: true,
  idOf: (item) => item.id,
  decode(raw) {
    if (!isRecord(raw)) return null;
    const kind = raw['kind'];
    const targetId = raw['targetId'];
    const order = raw['order'];
    if (kind !== 'tool' && kind !== 'pipeline') return null;
    if (!isNonEmptyString(targetId)) return null;
    if (typeof order !== 'number' || !Number.isFinite(order)) return null;
    if (raw['id'] !== favoriteItemId(kind, targetId)) return null;
    return { id: favoriteItemId(kind, targetId), kind, targetId, order, ...optionalString('pinnedAt', raw['pinnedAt']) };
  },
  encode: (item) => ({ ...item }),
};

/** Legacy store -> items (tool ids first, then pipeline ids; duplicates and non-strings dropped). */
export function favoritesToItems(store: Pick<FavoritesStore, 'toolIds' | 'pipelineIds'>): FavoriteItem[] {
  const items: FavoriteItem[] = [];
  const seen = new Set<string>();
  const add = (kind: FavoriteKind, ids: readonly unknown[]): void => {
    for (const targetId of ids) {
      if (!isNonEmptyString(targetId)) continue;
      const id = favoriteItemId(kind, targetId);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, kind, targetId, order: items.length });
    }
  };
  add('tool', store.toolIds);
  add('pipeline', store.pipelineIds);
  return items;
}

/** Items -> the service-facing store shape, ordered by `order` (stable for ties). */
export function itemsToFavorites(items: readonly FavoriteItem[]): FavoritesStore {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  return {
    schemaVersion: 1,
    toolIds: ordered.filter((i) => i.kind === 'tool').map((i) => i.targetId),
    pipelineIds: ordered.filter((i) => i.kind === 'pipeline').map((i) => i.targetId),
  };
}
