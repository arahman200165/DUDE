import { describe, expect, it } from 'vitest';
import {
  EMPTY_USAGE_STORE,
  MAX_DAILY_BUCKETS,
  MAX_RECENT_LOG,
  migrateUsageStore,
  recordUsage,
  UsageStore,
} from './usage.model';

// Local-time constructors keep these specs independent of the machine's timezone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe('recordUsage', () => {
  it('starts a new tool at count 1', () => {
    const when = at(2026, 1, 1);
    const store = recordUsage(EMPTY_USAGE_STORE, 'base64', when);
    expect(store.counts['base64']).toEqual({ count: 1, lastUsedAt: when });
    expect(store.recentLog).toEqual([{ toolId: 'base64', at: when }]);
  });

  it('increments an existing tool count and updates lastUsedAt', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'base64', at(2026, 1, 1));
    store = recordUsage(store, 'base64', at(2026, 1, 2));
    expect(store.counts['base64']).toEqual({ count: 2, lastUsedAt: at(2026, 1, 2) });
  });

  it('tracks multiple tools independently', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'base64', at(2026, 1, 1));
    store = recordUsage(store, 'json', at(2026, 1, 1, 13));
    expect(store.counts['base64'].count).toBe(1);
    expect(store.counts['json'].count).toBe(1);
    expect(store.recentLog.map((e) => e.toolId)).toEqual(['base64', 'json']);
  });

  it('caps the recent log at MAX_RECENT_LOG, dropping the oldest first', () => {
    let store = EMPTY_USAGE_STORE;
    for (let i = 0; i < MAX_RECENT_LOG + 10; i++) store = recordUsage(store, `tool-${i}`, at(2026, 1, 1));
    expect(store.recentLog).toHaveLength(MAX_RECENT_LOG);
    expect(store.recentLog[0].toolId).toBe('tool-10');
    expect(store.recentLog.at(-1)!.toolId).toBe(`tool-${MAX_RECENT_LOG + 9}`);
  });
});

describe('recordUsage daily buckets', () => {
  it('sets trackingStartedOn to the local day of the first open and never moves it', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'base64', at(2026, 1, 5, 23));
    expect(store.trackingStartedOn).toBe('2026-01-05');
    store = recordUsage(store, 'base64', at(2026, 1, 9));
    expect(store.trackingStartedOn).toBe('2026-01-05');
  });

  it('buckets by local calendar day with per-tool counts', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'base64', at(2026, 1, 5, 0));
    store = recordUsage(store, 'base64', at(2026, 1, 5, 23));
    store = recordUsage(store, 'json', at(2026, 1, 5, 10));
    store = recordUsage(store, 'json', at(2026, 1, 6, 0));

    expect(store.dailyBuckets).toEqual([
      { date: '2026-01-05', opens: 3, perTool: { base64: 2, json: 1 } },
      { date: '2026-01-06', opens: 1, perTool: { json: 1 } },
    ]);
  });

  it('keeps buckets ascending even when recorded out of order', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'a', at(2026, 1, 9));
    store = recordUsage(store, 'a', at(2026, 1, 7));
    expect(store.dailyBuckets.map((b) => b.date)).toEqual(['2026-01-07', '2026-01-09']);
  });

  it('prunes buckets outside the rolling 30-day window', () => {
    let store = EMPTY_USAGE_STORE;
    for (let day = 1; day <= 40; day++) store = recordUsage(store, 'a', at(2026, 1, 1 + (day - 1)));
    expect(store.dailyBuckets).toHaveLength(MAX_DAILY_BUCKETS);
    expect(store.dailyBuckets[0].date).toBe('2026-01-11');
    expect(store.dailyBuckets.at(-1)!.date).toBe('2026-02-09');
    // Lifetime counts are unaffected by bucket pruning.
    expect(store.counts['a'].count).toBe(40);
  });
});

describe('migrateUsageStore', () => {
  it('returns the empty store for null/non-object input', () => {
    expect(migrateUsageStore(null)).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore(undefined)).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore('garbage')).toEqual(EMPTY_USAGE_STORE);
  });

  it('returns the empty store when counts or recentLog are missing/malformed', () => {
    expect(migrateUsageStore({ schemaVersion: 1, recentLog: [] })).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore({ schemaVersion: 1, counts: {}, recentLog: 'nope' })).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore({ schemaVersion: 'x', counts: {}, recentLog: [] })).toEqual(EMPTY_USAGE_STORE);
  });

  it('upgrades v1 keeping counts and recent log, with no buckets and no tracking start', () => {
    const v1 = {
      schemaVersion: 1,
      counts: { base64: { count: 3, lastUsedAt: '2026-01-01T00:00:00.000Z' } },
      recentLog: [{ toolId: 'base64', at: '2026-01-01T00:00:00.000Z' }],
    };
    expect(migrateUsageStore(v1)).toEqual({ ...v1, schemaVersion: 2, dailyBuckets: [], trackingStartedOn: null });
  });

  it('keeps lifetime data from a newer schema instead of wiping it', () => {
    const future = { schemaVersion: 9, counts: { base64: { count: 4, lastUsedAt: 'x' } }, recentLog: [], extra: 1 };
    const migrated = migrateUsageStore(future);
    expect(migrated.counts['base64'].count).toBe(4);
    expect(migrated.dailyBuckets).toEqual([]);
    expect(migrated.trackingStartedOn).toBeNull();
  });

  it('passes through a well-formed v2 store unchanged', () => {
    const valid: UsageStore = {
      schemaVersion: 2,
      counts: { base64: { count: 3, lastUsedAt: '2026-01-01T00:00:00.000Z' } },
      recentLog: [{ toolId: 'base64', at: '2026-01-01T00:00:00.000Z' }],
      dailyBuckets: [{ date: '2026-01-01', opens: 3, perTool: { base64: 3 } }],
      trackingStartedOn: '2026-01-01',
    };
    expect(migrateUsageStore(valid)).toEqual(valid);
  });

  it('drops malformed buckets and bad tool ids from a v2 store', () => {
    const migrated = migrateUsageStore({
      schemaVersion: 2,
      counts: {},
      recentLog: [],
      dailyBuckets: [
        { date: '2026-01-01', opens: 2, perTool: { base64: 1, 'Bad Id!': 1, json: -3 } },
        { date: '2026-13-45', opens: 1, perTool: {} },
        { date: '2026-01-02', opens: -1, perTool: {} },
        { date: '2026-01-03', opens: 1.5, perTool: {} },
        'junk',
      ],
      trackingStartedOn: 'nope',
    });
    expect(migrated.dailyBuckets).toEqual([{ date: '2026-01-01', opens: 2, perTool: { base64: 1 } }]);
    expect(migrated.trackingStartedOn).toBe('2026-01-01');
  });
});
