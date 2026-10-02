export const FAVORITES_STORE_SCHEMA_VERSION = 1;

export interface FavoritesStore {
  readonly schemaVersion: 1;
  readonly toolIds: readonly string[];
  readonly pipelineIds: readonly string[];
}

export const EMPTY_FAVORITES_STORE: FavoritesStore = { schemaVersion: 1, toolIds: [], pipelineIds: [] };

function toggleId(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];
}

export function toggleToolId(store: FavoritesStore, toolId: string): FavoritesStore {
  return { ...store, toolIds: toggleId(store.toolIds, toolId) };
}

export function togglePipelineId(store: FavoritesStore, pipelineId: string): FavoritesStore {
  return { ...store, pipelineIds: toggleId(store.pipelineIds, pipelineId) };
}

/** Defensive parse: unrecognized/corrupt persisted data resets to an empty store rather than throwing. */
export function migrateFavoritesStore(raw: unknown): FavoritesStore {
  if (!raw || typeof raw !== 'object') return EMPTY_FAVORITES_STORE;
  const candidate = raw as Partial<FavoritesStore>;
  if (
    candidate.schemaVersion === FAVORITES_STORE_SCHEMA_VERSION &&
    Array.isArray(candidate.toolIds) &&
    Array.isArray(candidate.pipelineIds)
  ) {
    return { schemaVersion: 1, toolIds: candidate.toolIds, pipelineIds: candidate.pipelineIds };
  }
  return EMPTY_FAVORITES_STORE;
}
