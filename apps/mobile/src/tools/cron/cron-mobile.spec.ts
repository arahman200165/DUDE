import { describe, expect, it } from 'vitest';
import { cronView, fieldBreakdown } from './cron-mobile';

describe('fieldBreakdown', () => {
  it('names five fields', () => {
    expect(fieldBreakdown('*/5 0 * * 1')).toEqual([
      { key: 'field-minute', label: 'Minute', value: '*/5' },
      { key: 'field-hour', label: 'Hour', value: '0' },
      { key: 'field-day-of-month', label: 'Day of month', value: '*' },
      { key: 'field-month', label: 'Month', value: '*' },
      { key: 'field-day-of-week', label: 'Day of week', value: '1' },
    ]);
  });
  it('names a leading seconds field in a six-field expression', () => {
    expect(fieldBreakdown('30 * * * * *')[0]).toEqual({ key: 'field-second', label: 'Second', value: '30' });
  });
  it('expands macros and ignores other field counts', () => {
    expect(fieldBreakdown('@daily').map(row => row.value)).toEqual(['0', '0', '*', '*', '*']);
    expect(fieldBreakdown('* *')).toEqual([]);
  });
});

describe('cronView', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  it('lists next runs in UTC', () => {
    const outcome = cronView('*/5 * * * *', { count: 3, tz: 'utc', direction: 'next', now });
    expect(outcome.ok && outcome.view.runs.map(run => run.value)).toEqual(['2026-01-01T00:05:00.000Z', '2026-01-01T00:10:00.000Z', '2026-01-01T00:15:00.000Z']);
    expect(outcome.ok && outcome.view.description).toContain('Every 5 minutes');
  });
  it('lists previous runs most recent first', () => {
    const outcome = cronView('*/5 * * * *', { count: 2, tz: 'utc', direction: 'previous', now });
    expect(outcome.ok && outcome.view.runs.map(run => run.value)).toEqual(['2025-12-31T23:55:00.000Z', '2025-12-31T23:50:00.000Z']);
  });
  it('returns the parser error for an out-of-range field', () => {
    expect(cronView('61 * * * *', { count: 3, tz: 'utc', direction: 'next', now })).toEqual({ ok: false, error: 'Constraint error, got value 61 expected range 0-59' });
  });
});
