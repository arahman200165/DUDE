import { describe, expect, it } from 'vitest';
import { lifetimeToolCounts, rankCategoryUsage, selectActivityPeriod } from "./activity-summary.js";
import { DailyUsageBucket } from "@dude/domain/core/usage/usage.model";

const NOW = new Date(2026, 0, 10, 12); // local Sat 2026-01-10

const bucket = (date: string, perTool: Record<string, number>): DailyUsageBucket => ({
  date,
  opens: Object.values(perTool).reduce((a, b) => a + b, 0),
  perTool,
});

describe('selectActivityPeriod', () => {
  it('has no tracked days, zero total and a null start before tracking begins', () => {
    const period = selectActivityPeriod([], null, { days: 7, now: NOW });

    expect(period.days).toHaveLength(7);
    expect(period.days.every((d) => d.opens === null)).toBe(true);
    expect(period.totalOpens).toBe(0);
    expect(period.complete).toBe(false);
    expect(period.since).toBeNull();
  });

  it('ends today, oldest first, one entry per local day', () => {
    const period = selectActivityPeriod([], null, { days: 3, now: NOW });
    expect(period.days.map((d) => d.date)).toEqual(['2026-01-08', '2026-01-09', '2026-01-10']);
  });

  it('marks days before the tracking start as not tracked (null) and later empty days as zero', () => {
    const period = selectActivityPeriod([bucket('2026-01-08', { a: 2 })], '2026-01-08', { days: 5, now: NOW });

    expect(period.days.map((d) => d.opens)).toEqual([null, null, 2, 0, 0]);
    expect(period.totalOpens).toBe(2);
    expect(period.complete).toBe(false);
    expect(period.since).toBe('2026-01-08');
  });

  it('is complete only once the tracking start is at least `days` days before today', () => {
    expect(selectActivityPeriod([], '2026-01-04', { days: 7, now: NOW }).complete).toBe(false); // 6 days ago
    expect(selectActivityPeriod([], '2026-01-03', { days: 7, now: NOW }).complete).toBe(true); // 7 days ago
  });

  it('computes total, unique tools and per-tool counts over the same tracked days', () => {
    const buckets = [
      bucket('2026-01-04', { a: 1, b: 2 }),
      bucket('2026-01-09', { a: 3 }),
      bucket('2026-01-10', { c: 1 }),
    ];
    const period = selectActivityPeriod(buckets, '2026-01-03', { days: 7, now: NOW });

    expect(period.totalOpens).toBe(7);
    expect(period.uniqueTools).toBe(3);
    expect(period.toolCounts).toEqual({ a: 4, b: 2, c: 1 });
    expect(period.complete).toBe(true);
  });

  it('excludes buckets outside the window from totals', () => {
    const period = selectActivityPeriod([bucket('2025-12-01', { a: 9 })], '2025-12-01', { days: 7, now: NOW });
    expect(period.totalOpens).toBe(0);
    expect(period.uniqueTools).toBe(0);
  });

  it('ignores unknown tool ids for unique tools but still counts their opens', () => {
    const period = selectActivityPeriod([bucket('2026-01-10', { a: 1, gone: 2 })], '2026-01-10', {
      days: 1,
      now: NOW,
      isKnownTool: (id) => id === 'a',
    });
    expect(period.uniqueTools).toBe(1);
    expect(period.toolCounts).toEqual({ a: 1 });
    expect(period.totalOpens).toBe(3);
  });
});

describe('rankCategoryUsage', () => {
  const categoryOf = (id: string) => ({ a: 'data', b: 'data', c: 'text' })[id] as 'data' | 'text' | undefined;

  it('sums per category from registry lookups and ranks descending', () => {
    expect(rankCategoryUsage({ a: 2, b: 3, c: 4 }, categoryOf)).toEqual([
      { category: 'data', opens: 5 },
      { category: 'text', opens: 4 },
    ]);
  });

  it('skips tools with no category and breaks ties by category id', () => {
    expect(rankCategoryUsage({ a: 2, c: 2, unknown: 9 }, categoryOf).map((r) => r.category)).toEqual(['data', 'text']);
  });
});

describe('lifetimeToolCounts', () => {
  it('flattens counts to id → opens', () => {
    expect(lifetimeToolCounts({ a: { count: 2, lastUsedAt: 'x' } })).toEqual({ a: 2 });
  });
});
