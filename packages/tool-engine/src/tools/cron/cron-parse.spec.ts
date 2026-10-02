import { parseCronExpression } from "./cron-parse.js";

const NOW = new Date('2026-09-20T00:00:00Z');

describe('parseCronExpression', () => {
  it('returns an error for blank input', () => {
    const result = parseCronExpression('', { count: 5, tz: 'utc', now: NOW });
    expect(result.ok).toBe(false);
  });

  it('returns an error for an invalid expression', () => {
    const result = parseCronExpression('not a cron', { count: 5, tz: 'utc', now: NOW });
    expect(result.ok).toBe(false);
  });

  it('produces a description and the requested number of strictly-increasing next runs', () => {
    const result = parseCronExpression('0 9 * * 1', { count: 3, tz: 'utc', now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.description.length).toBeGreaterThan(0);
    expect(result.nextRuns).toHaveLength(3);
    for (let i = 1; i < result.nextRuns.length; i++) {
      expect(result.nextRuns[i].date.getTime()).toBeGreaterThan(result.nextRuns[i - 1].date.getTime());
    }
  });

  it('produces a sensible description for an @-macro expression', () => {
    const result = parseCronExpression('@daily', { count: 1, tz: 'utc', now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('produces different display strings for utc vs local timezone mode', () => {
    const utcResult = parseCronExpression('0 9 * * 1', { count: 1, tz: 'utc', now: NOW });
    const localResult = parseCronExpression('0 9 * * 1', { count: 1, tz: 'local', now: NOW });
    expect(utcResult.ok && localResult.ok).toBe(true);
    if (!utcResult.ok || !localResult.ok) return;

    expect(utcResult.nextRuns[0].display).toBe(utcResult.nextRuns[0].date.toISOString());
    expect(localResult.nextRuns[0].display).toBe(localResult.nextRuns[0].date.toLocaleString());
  });

  it('is deterministic given an injected `now`', () => {
    const first = parseCronExpression('* * * * *', { count: 2, tz: 'utc', now: NOW });
    const second = parseCronExpression('* * * * *', { count: 2, tz: 'utc', now: NOW });
    expect(first).toEqual(second);
  });

  it('produces the requested number of strictly-decreasing previous runs, all before `now`', () => {
    const result = parseCronExpression('0 9 * * 1', { count: 3, tz: 'utc', now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.previousRuns).toHaveLength(3);
    for (const run of result.previousRuns) {
      expect(run.date.getTime()).toBeLessThan(NOW.getTime());
    }
    for (let i = 1; i < result.previousRuns.length; i++) {
      expect(result.previousRuns[i].date.getTime()).toBeLessThan(result.previousRuns[i - 1].date.getTime());
    }
  });

  it('produces a verbose, richer description', () => {
    const result = parseCronExpression('0 */6 * * 1-5', { count: 1, tz: 'utc', now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.description.toLowerCase()).toContain('monday through friday');
  });
});
