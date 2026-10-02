import { computeOccurrences } from "./recurrence-calc.js";

describe('computeOccurrences', () => {
  it('lists occurrences for a simple weekly rule', () => {
    // 2026-01-01 is a Thursday.
    const result = computeOccurrences({
      startDate: '2026-01-01',
      startTime: '09:00',
      ruleText: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5',
      timezone: 'UTC',
      maxOccurrences: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.occurrences).toHaveLength(5);
    // First occurrence on/after the Thursday start should be Friday 2026-01-02.
    expect(result.occurrences[0]).toContain('2026-01-02');
    expect(result.humanText).toContain('week');
  });

  it('respects maxOccurrences even when the rule has no COUNT/UNTIL', () => {
    const result = computeOccurrences({
      startDate: '2026-01-01',
      startTime: '00:00',
      ruleText: 'FREQ=DAILY',
      timezone: 'UTC',
      maxOccurrences: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.occurrences).toHaveLength(3);
  });

  it('caps maxOccurrences at 500', () => {
    const result = computeOccurrences({
      startDate: '2026-01-01',
      startTime: '00:00',
      ruleText: 'FREQ=DAILY',
      timezone: 'UTC',
      maxOccurrences: 10000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.occurrences).toHaveLength(500);
  });

  it('rejects an empty rule', () => {
    expect(
      computeOccurrences({ startDate: '2026-01-01', startTime: '00:00', ruleText: '', timezone: 'UTC', maxOccurrences: 10 }),
    ).toEqual({ ok: false, error: 'Enter a recurrence rule (e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10).' });
  });

  it('rejects a rule missing FREQ', () => {
    const result = computeOccurrences({
      startDate: '2026-01-01',
      startTime: '00:00',
      ruleText: 'BYDAY=MO',
      timezone: 'UTC',
      maxOccurrences: 10,
    });
    expect(result).toEqual({ ok: false, error: 'Rule must include a FREQ (e.g. FREQ=WEEKLY).' });
  });

  it('rejects an invalid start date', () => {
    const result = computeOccurrences({
      startDate: 'nope',
      startTime: '00:00',
      ruleText: 'FREQ=DAILY',
      timezone: 'UTC',
      maxOccurrences: 10,
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid start date/time.' });
  });
});
