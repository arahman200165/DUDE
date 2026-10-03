import { describe, expect, it } from 'vitest';
import {
  EMPTY_USAGE_STORE,
  MAX_DAILY_BUCKETS,
  MAX_RECENT_LOG,
  recordUsage,
  sumUsageStores,
  UsageStore,
} from "./usage.model.js";

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


describe('sumUsageStores', () => {
  it('is empty for no stores and drops deviceId for one', () => {
    expect(sumUsageStores([])).toEqual(EMPTY_USAGE_STORE);
    const one = recordUsage({ ...EMPTY_USAGE_STORE, deviceId: 'd1' }, 'a', at(2026, 1, 1));
    expect(sumUsageStores([one]).deviceId).toBeUndefined();
    expect(sumUsageStores([one]).counts['a'].count).toBe(1);
  });

  it('adds counts and buckets, keeps the latest lastUsedAt and the earliest tracking start', () => {
    const a = recordUsage(recordUsage({ ...EMPTY_USAGE_STORE, deviceId: 'd1' }, 'x', at(2026, 1, 1)), 'y', at(2026, 1, 3));
    const b = recordUsage(recordUsage({ ...EMPTY_USAGE_STORE, deviceId: 'd2' }, 'x', at(2026, 1, 2)), 'x', at(2026, 1, 3));
    const sum = sumUsageStores([a, b]);
    expect(sum.counts['x'].count).toBe(3);
    expect(sum.counts['x'].lastUsedAt).toBe(at(2026, 1, 3));
    expect(sum.counts['y'].count).toBe(1);
    expect(sum.recentLog.map((e) => e.at)).toEqual([...sum.recentLog.map((e) => e.at)].sort());
    expect(sum.recentLog).toHaveLength(4);
    const day3 = sum.dailyBuckets.find((d) => d.opens === 2);
    expect(day3?.perTool).toEqual({ y: 1, x: 1 });
    expect(sum.trackingStartedOn).toBe(a.trackingStartedOn);
    expect(sum.deviceId).toBeUndefined();
  });
});
