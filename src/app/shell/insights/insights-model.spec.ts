import { describe, expect, it } from 'vitest';
import { ActivityPeriod, selectActivityPeriod } from '../../core/usage/activity-summary';
import { UnifiedActivityEntry } from '../../core/recents/unified-recents.model';
import {
  buildRecentActivityRows,
  buildSummaryTiles,
  buildTopToolRows,
  buildTrendBars,
  describePeriod,
  formatRelativeTime,
  toCategoryBarRows,
} from './insights-model';

const NOW = new Date(2026, 0, 10, 12); // local 2026-01-10

function period(tracked: readonly { date: string; opens: number; perTool: Record<string, number> }[], since: string | null, days = 7): ActivityPeriod {
  return selectActivityPeriod(tracked, since, { days, now: NOW });
}

describe('formatRelativeTime', () => {
  const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

  it('formats minutes, hours and days ago', () => {
    expect(formatRelativeTime(at(5_000), NOW)).toBe('just now');
    expect(formatRelativeTime(at(5 * 60_000), NOW)).toBe('5m ago');
    expect(formatRelativeTime(at(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(formatRelativeTime(at(2 * 86_400_000), NOW)).toBe('2d ago');
  });

  it('falls back to a calendar date beyond 30 days, and empty for garbage', () => {
    expect(formatRelativeTime(at(60 * 86_400_000), NOW)).toMatch(/\d/);
    expect(formatRelativeTime('not a date', NOW)).toBe('');
  });
});

describe('buildTrendBars', () => {
  it('gives every day a visible label and a full-sentence detail, marking today and untracked days', () => {
    const bars = buildTrendBars(period([{ date: '2026-01-09', opens: 1, perTool: { a: 1 } }], '2026-01-09', 3));

    expect(bars).toHaveLength(3);
    expect(bars[0].value).toBeNull();
    expect(bars[0].detail).toMatch(/not tracked/);
    expect(bars[1].value).toBe(1);
    expect(bars[1].detail).toMatch(/: 1 open$/);
    expect(bars[2].value).toBe(0);
    expect(bars[2].detail).toMatch(/\(today\): 0 opens$/);
  });
});

describe('describePeriod', () => {
  it('says nothing is tracked before the first open', () => {
    expect(describePeriod(period([], null))).toBe('No opens tracked yet.');
  });

  it('labels a partial period with its tracking start and the same total the chart uses', () => {
    const p = period([{ date: '2026-01-09', opens: 4, perTool: { a: 4 } }], '2026-01-09');
    const text = describePeriod(p);
    expect(text).toContain('4 opens');
    expect(text).toContain('partial period, tracked since');
  });

  it('drops the partial label once seven full days have been tracked', () => {
    const p = period([{ date: '2026-01-08', opens: 2, perTool: { a: 2 } }], '2026-01-01');
    expect(describePeriod(p)).toBe('2 opens in the last 7 days');
  });
});

describe('buildSummaryTiles', () => {
  const base = {
    period: period([{ date: '2026-01-10', opens: 3, perTool: { a: 2, b: 1 } }], '2026-01-10'),
    topCategory: { category: 'data' as const, opens: 9 },
    topTool: { title: 'JSON Formatter', uses: 5 },
    favoriteCount: 2,
    pinnedPipelineCount: 1,
    recent: undefined,
  };

  it('shows period metrics as partial, lifetime metrics as lifetime, and omits the desktop-only tile off desktop', () => {
    const tiles = buildSummaryTiles(base);
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));

    expect(byKey['opens']).toMatchObject({ value: '3', note: 'partial period' });
    expect(byKey['unique']).toMatchObject({ value: '2', note: 'partial period' });
    expect(byKey['top-category']).toMatchObject({ value: 'Data', note: 'lifetime · 9' });
    expect(byKey['top-tool']).toMatchObject({ value: 'JSON Formatter', note: 'lifetime · 5' });
    expect(byKey['favorites'].value).toBe('2');
    expect(byKey['pinned-pipelines'].value).toBe('1');
    expect(byKey['recent-resume']).toBeUndefined();
  });

  it('includes the projects/workspaces tile on desktop and omits empty top-category/top-tool tiles', () => {
    const tiles = buildSummaryTiles({ ...base, topCategory: undefined, topTool: undefined, recent: { projects: 2, workspaces: 3 } });
    const keys = tiles.map((t) => t.key);
    expect(keys).not.toContain('top-category');
    expect(keys).not.toContain('top-tool');
    expect(tiles.find((t) => t.key === 'recent-resume')?.value).toBe('2 · 3');
  });
});

describe('toCategoryBarRows', () => {
  it('limits rows and derives label and color token from category metadata', () => {
    const rows = toCategoryBarRows(
      [
        { category: 'data', opens: 5 },
        { category: 'text', opens: 3 },
      ],
      1,
    );
    expect(rows).toEqual([{ category: 'data', label: 'Data', opens: 5, colorToken: '--color-cat-data' }]);
  });
});

describe('buildTopToolRows', () => {
  const lookup = (id: string) => (id === 'gone' ? undefined : { title: id.toUpperCase(), route: `/tools/${id}`, category: 'data' as const });

  it('ranks by lifetime uses, breaks ties by recency, drops removed tools, and limits', () => {
    const rows = buildTopToolRows(
      [
        { toolId: 'a', count: 2, lastUsedAt: '2026-01-01T00:00:00.000Z' },
        { toolId: 'b', count: 2, lastUsedAt: '2026-01-05T00:00:00.000Z' },
        { toolId: 'gone', count: 99, lastUsedAt: '2026-01-06T00:00:00.000Z' },
        { toolId: 'c', count: 7, lastUsedAt: '2026-01-02T00:00:00.000Z' },
      ],
      lookup,
      3,
    );
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(rows[0]).toMatchObject({ title: 'C', route: '/tools/c', categoryLabel: 'Data', uses: 7 });
  });
});

describe('buildRecentActivityRows', () => {
  const entries: UnifiedActivityEntry[] = [
    { kind: 'tool', toolId: 'a', title: 'Alpha', at: '2026-01-10T10:00:00.000Z' },
    { kind: 'pipeline', pipelineId: 'p1', title: 'My Pipe', at: '2026-01-10T09:00:00.000Z' },
    { kind: 'history', entryId: 'h1', toolId: 'a', title: 'Alpha', at: '2026-01-10T08:00:00.000Z' },
    { kind: 'native-file', path: 'C:\\secret\\dir\\notes.txt', title: 'notes.txt', at: '2026-01-10T07:00:00.000Z' },
  ];
  const lookups = { categoryLabel: (id: string) => (id === 'a' ? 'Data' : undefined) };

  it('maps every eligible kind to a typed row with its real timestamp', () => {
    const rows = buildRecentActivityRows(entries, lookups, 10);
    expect(rows.map((r) => r.typeLabel)).toEqual(['Tool', 'Pipeline', 'History', 'File']);
    expect(rows[0]).toMatchObject({ item: 'Alpha', context: 'Data', at: '2026-01-10T10:00:00.000Z' });
    expect(new Set(rows.map((r) => r.key)).size).toBe(4);
  });

  it('never surfaces a native file path in the row', () => {
    const rows = buildRecentActivityRows(entries, lookups, 10);
    expect(JSON.stringify(rows.map(({ entry: _entry, ...row }) => row))).not.toContain('secret');
  });

  it('bounds the slice', () => {
    expect(buildRecentActivityRows(entries, lookups, 2)).toHaveLength(2);
  });
});
