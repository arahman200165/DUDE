import { addLocalDays, localDayKey, parseLocalDay } from "./local-day.js";

export const USAGE_STORE_SCHEMA_VERSION = 2;

/** Cap on the recent-open log — enough to derive "recently used" ordering without unbounded growth. */
export const MAX_RECENT_LOG = 200;

/** Rolling window of daily-open buckets kept for the Phase 30H trend/period views. */
export const MAX_DAILY_BUCKETS = 30;

const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export interface UsageCount {
  readonly count: number;
  readonly lastUsedAt: string;
}

export interface UsageLogEntry {
  readonly toolId: string;
  readonly at: string;
}

/**
 * Opens on one local calendar day (`date` is `YYYY-MM-DD`, local). `perTool` holds only tool id →
 * open count, so a period's unique-tools figure is derivable; it never carries content.
 */
export interface DailyUsageBucket {
  readonly date: string;
  readonly opens: number;
  readonly perTool: Readonly<Record<string, number>>;
}

export interface UsageStore {
  readonly schemaVersion: 2;
  readonly counts: Readonly<Record<string, UsageCount>>;
  readonly recentLog: readonly UsageLogEntry[];
  /** Ascending by date, at most `MAX_DAILY_BUCKETS`. Days with no opens have no bucket. */
  readonly dailyBuckets: readonly DailyUsageBucket[];
  /**
   * Local day of the first open recorded under v2 — the start of reliable daily tracking. `null`
   * until then. Never backfilled from `recentLog`, so pre-migration days stay "not tracked".
   */
  readonly trackingStartedOn: string | null;
  /** Owning device for a per-device usage record (Phase 31D); absent on web standalone, where the record id is 'default'. */
  readonly deviceId?: string;
}

export const EMPTY_USAGE_STORE: UsageStore = {
  schemaVersion: 2,
  counts: {},
  recentLog: [],
  dailyBuckets: [],
  trackingStartedOn: null,
};

/**
 * Records one open of `toolId` at `at` (ISO string) — bumps its count/lastUsedAt, appends to the
 * capped recent-open log and to the local-day bucket, then prunes buckets outside the rolling
 * window. Pure so it's trivially testable independent of `PersistenceService`.
 */
export function recordUsage(store: UsageStore, toolId: string, at: string): UsageStore {
  const existing = store.counts[toolId];
  const counts = { ...store.counts, [toolId]: { count: (existing?.count ?? 0) + 1, lastUsedAt: at } };
  const recentLog = [...store.recentLog, { toolId, at }].slice(-MAX_RECENT_LOG);

  const day = localDayKey(new Date(at));
  const trackingStartedOn = store.trackingStartedOn ?? day;
  const dailyBuckets = bumpBucket(store.dailyBuckets, day, toolId);
  return { ...store, counts, recentLog, dailyBuckets, trackingStartedOn };
}

function bumpBucket(buckets: readonly DailyUsageBucket[], day: string, toolId: string): readonly DailyUsageBucket[] {
  const existing = buckets.find((b) => b.date === day);
  const updated: DailyUsageBucket = {
    date: day,
    opens: (existing?.opens ?? 0) + 1,
    perTool: { ...existing?.perTool, [toolId]: (existing?.perTool[toolId] ?? 0) + 1 },
  };
  const next = [...buckets.filter((b) => b.date !== day), updated].sort((a, b) => a.date.localeCompare(b.date));
  // Prune relative to the newest bucket so a clock going backwards never deletes recent history.
  const newest = next[next.length - 1].date;
  const oldestKept = addLocalDays(newest, -(MAX_DAILY_BUCKETS - 1));
  return next.filter((b) => b.date >= oldestKept);
}

type LooseKey = 'schemaVersion' | 'counts' | 'recentLog' | 'dailyBuckets' | 'trackingStartedOn' | 'date' | 'opens' | 'perTool';
/** Untrusted persisted JSON: known keys are `unknown` until validated. */
type Loose = { readonly [K in LooseKey]?: unknown };

function isRecord(value: unknown): value is Loose & Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Per-bucket validation shared with the persistence codec. */
export function sanitizeBuckets(raw: unknown): readonly DailyUsageBucket[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, DailyUsageBucket>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.date !== 'string' || parseLocalDay(item.date) === null) continue;
    if (!Number.isInteger(item.opens) || (item.opens as number) < 0) continue;
    const perTool: Record<string, number> = {};
    if (isRecord(item.perTool)) {
      for (const [id, n] of Object.entries(item.perTool)) {
        if (TOOL_ID_PATTERN.test(id) && Number.isInteger(n) && (n as number) > 0) perTool[id] = n as number;
      }
    }
    byDate.set(item.date, { date: item.date, opens: item.opens as number, perTool });
  }
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-MAX_DAILY_BUCKETS);
}

/**
 * Aggregate view over every device's usage record (Phase 31D): counts add, `lastUsedAt` is the latest, the recent log
 * is merged oldest-first and capped, buckets add per day (capped to the rolling window) and tracking starts at the
 * earliest start. Pure; the result carries no `deviceId`.
 */
export function sumUsageStores(stores: readonly UsageStore[]): UsageStore {
  if (stores.length === 0) return EMPTY_USAGE_STORE;
  if (stores.length === 1) {
    const { deviceId: _ignored, ...only } = stores[0];
    return only;
  }
  const counts: Record<string, UsageCount> = {};
  const log: UsageLogEntry[] = [];
  const byDate = new Map<string, { opens: number; perTool: Record<string, number> }>();
  let trackingStartedOn: string | null = null;
  for (const store of stores) {
    for (const [toolId, c] of Object.entries(store.counts)) {
      const prev = counts[toolId];
      counts[toolId] = { count: (prev?.count ?? 0) + c.count, lastUsedAt: prev && prev.lastUsedAt > c.lastUsedAt ? prev.lastUsedAt : c.lastUsedAt };
    }
    log.push(...store.recentLog);
    for (const b of store.dailyBuckets) {
      const day = byDate.get(b.date) ?? { opens: 0, perTool: {} };
      day.opens += b.opens;
      for (const [id, n] of Object.entries(b.perTool)) day.perTool[id] = (day.perTool[id] ?? 0) + n;
      byDate.set(b.date, day);
    }
    if (store.trackingStartedOn !== null && (trackingStartedOn === null || store.trackingStartedOn < trackingStartedOn)) trackingStartedOn = store.trackingStartedOn;
  }
  log.sort((a, b) => a.at.localeCompare(b.at));
  const dailyBuckets = [...byDate.entries()]
    .map(([date, v]): DailyUsageBucket => ({ date, opens: v.opens, perTool: v.perTool }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAILY_BUCKETS);
  return { schemaVersion: 2, counts, recentLog: log.slice(-MAX_RECENT_LOG), dailyBuckets, trackingStartedOn };
}
