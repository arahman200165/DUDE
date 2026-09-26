import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE_STORE, MAX_RECENT_LOG, migrateUsageStore, recordUsage, UsageStore } from './usage.model';

describe('recordUsage', () => {
  it('starts a new tool at count 1', () => {
    const store = recordUsage(EMPTY_USAGE_STORE, 'base64', '2026-01-01T00:00:00.000Z');
    expect(store.counts['base64']).toEqual({ count: 1, lastUsedAt: '2026-01-01T00:00:00.000Z' });
    expect(store.recentLog).toEqual([{ toolId: 'base64', at: '2026-01-01T00:00:00.000Z' }]);
  });

  it('increments an existing tool count and updates lastUsedAt', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'base64', '2026-01-01T00:00:00.000Z');
    store = recordUsage(store, 'base64', '2026-01-02T00:00:00.000Z');
    expect(store.counts['base64']).toEqual({ count: 2, lastUsedAt: '2026-01-02T00:00:00.000Z' });
  });

  it('tracks multiple tools independently', () => {
    let store = recordUsage(EMPTY_USAGE_STORE, 'base64', '2026-01-01T00:00:00.000Z');
    store = recordUsage(store, 'json', '2026-01-01T00:00:01.000Z');
    expect(store.counts['base64'].count).toBe(1);
    expect(store.counts['json'].count).toBe(1);
    expect(store.recentLog.map((e) => e.toolId)).toEqual(['base64', 'json']);
  });

  it('caps the recent log at MAX_RECENT_LOG, dropping the oldest first', () => {
    let store = EMPTY_USAGE_STORE;
    for (let i = 0; i < MAX_RECENT_LOG + 10; i++) {
      store = recordUsage(store, `tool-${i}`, `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`);
    }
    expect(store.recentLog).toHaveLength(MAX_RECENT_LOG);
    expect(store.recentLog[0].toolId).toBe('tool-10');
    expect(store.recentLog.at(-1)!.toolId).toBe(`tool-${MAX_RECENT_LOG + 9}`);
  });
});

describe('migrateUsageStore', () => {
  it('returns the empty store for null/non-object input', () => {
    expect(migrateUsageStore(null)).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore(undefined)).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore('garbage')).toEqual(EMPTY_USAGE_STORE);
  });

  it('returns the empty store for a mismatched schema version', () => {
    expect(migrateUsageStore({ schemaVersion: 2, counts: {}, recentLog: [] })).toEqual(EMPTY_USAGE_STORE);
  });

  it('returns the empty store when counts or recentLog are missing/malformed', () => {
    expect(migrateUsageStore({ schemaVersion: 1, recentLog: [] })).toEqual(EMPTY_USAGE_STORE);
    expect(migrateUsageStore({ schemaVersion: 1, counts: {}, recentLog: 'nope' })).toEqual(EMPTY_USAGE_STORE);
  });

  it('passes through a well-formed store unchanged', () => {
    const valid: UsageStore = {
      schemaVersion: 1,
      counts: { base64: { count: 3, lastUsedAt: '2026-01-01T00:00:00.000Z' } },
      recentLog: [{ toolId: 'base64', at: '2026-01-01T00:00:00.000Z' }],
    };
    expect(migrateUsageStore(valid)).toEqual(valid);
  });
});
