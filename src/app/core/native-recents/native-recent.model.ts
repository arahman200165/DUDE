/**
 * Native File Recent List (DUDE_PRD.md §21 Phase 25 Item 5) -- only files opened via the existing
 * `--open-with-dude`/Explorer-association flow, never a tool's own file input. Only structural
 * metadata is ever recorded, never content -- see `AGENTS.md` in this directory.
 */
export interface NativeRecentEntry {
  readonly path: string;
  readonly name: string;
  readonly extension: string;
  readonly openedAt: string;
}

export const NATIVE_RECENTS_STORE_SCHEMA_VERSION = 1;
export const MAX_NATIVE_RECENTS = 50;

export interface NativeRecentsStore {
  readonly schemaVersion: 1;
  readonly entries: readonly NativeRecentEntry[];
}

export const EMPTY_NATIVE_RECENTS_STORE: NativeRecentsStore = { schemaVersion: 1, entries: [] };

/** Defensive parse: unrecognized/corrupt persisted data resets to an empty store rather than throwing. */
export function migrateNativeRecentsStore(raw: unknown): NativeRecentsStore {
  if (!raw || typeof raw !== 'object') return EMPTY_NATIVE_RECENTS_STORE;
  const candidate = raw as Partial<NativeRecentsStore>;
  if (candidate.schemaVersion === NATIVE_RECENTS_STORE_SCHEMA_VERSION && Array.isArray(candidate.entries)) {
    return { schemaVersion: 1, entries: candidate.entries };
  }
  return EMPTY_NATIVE_RECENTS_STORE;
}

/** Dedupes by path (re-opening a file moves it back to the front rather than duplicating it), caps at `MAX_NATIVE_RECENTS`. */
export function recordNativeRecent(store: NativeRecentsStore, entry: NativeRecentEntry): NativeRecentsStore {
  const deduped = store.entries.filter((existing) => existing.path !== entry.path);
  return { ...store, entries: [entry, ...deduped].slice(0, MAX_NATIVE_RECENTS) };
}

export function removeNativeRecent(store: NativeRecentsStore, path: string): NativeRecentsStore {
  return { ...store, entries: store.entries.filter((entry) => entry.path !== path) };
}
