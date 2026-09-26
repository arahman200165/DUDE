export const USAGE_STORE_SCHEMA_VERSION = 1;

/** Cap on the recent-open log — enough to derive "recently used" ordering without unbounded growth. */
export const MAX_RECENT_LOG = 200;

export interface UsageCount {
  readonly count: number;
  readonly lastUsedAt: string;
}

export interface UsageLogEntry {
  readonly toolId: string;
  readonly at: string;
}

export interface UsageStore {
  readonly schemaVersion: 1;
  readonly counts: Readonly<Record<string, UsageCount>>;
  readonly recentLog: readonly UsageLogEntry[];
}

export const EMPTY_USAGE_STORE: UsageStore = { schemaVersion: 1, counts: {}, recentLog: [] };

/**
 * Records one open of `toolId` at `at` (ISO string) — bumps its count/lastUsedAt and appends to the
 * capped recent-open log. Pure so it's trivially testable independent of `PersistenceService`.
 */
export function recordUsage(store: UsageStore, toolId: string, at: string): UsageStore {
  const existing = store.counts[toolId];
  const counts = { ...store.counts, [toolId]: { count: (existing?.count ?? 0) + 1, lastUsedAt: at } };
  const recentLog = [...store.recentLog, { toolId, at }].slice(-MAX_RECENT_LOG);
  return { ...store, counts, recentLog };
}

/** Defensive parse: unrecognized/corrupt persisted data resets to an empty store rather than throwing. */
export function migrateUsageStore(raw: unknown): UsageStore {
  if (!raw || typeof raw !== 'object') return EMPTY_USAGE_STORE;
  const candidate = raw as Partial<UsageStore>;
  if (
    candidate.schemaVersion === USAGE_STORE_SCHEMA_VERSION &&
    typeof candidate.counts === 'object' &&
    candidate.counts !== null &&
    Array.isArray(candidate.recentLog)
  ) {
    return { schemaVersion: 1, counts: candidate.counts, recentLog: candidate.recentLog };
  }
  return EMPTY_USAGE_STORE;
}
