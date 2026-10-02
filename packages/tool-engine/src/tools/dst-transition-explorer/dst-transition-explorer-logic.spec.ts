import { exploreDstTransitions } from "./dst-transition-explorer-logic.js";

describe('exploreDstTransitions', () => {
  it('lists both US DST transitions for a given year', () => {
    const result = exploreDstTransitions('America/New_York', 2026);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ date: '2026-03-08', direction: 'spring-forward', fromOffset: '-05:00', toOffset: '-04:00', gapMinutes: 60 });
    expect(result.rows[1]).toMatchObject({ date: '2026-11-01', direction: 'fall-back', fromOffset: '-04:00', toOffset: '-05:00', gapMinutes: 60 });
  });

  it('returns an empty row list for a zone with no DST', () => {
    const result = exploreDstTransitions('UTC', 2026);
    expect(result).toEqual({ ok: true, rows: [] });
  });

  it('rejects an unknown zone', () => {
    expect(exploreDstTransitions('Not/AZone', 2026)).toEqual({ ok: false, error: 'Unknown timezone: "Not/AZone"' });
  });

  it('rejects an empty zone', () => {
    expect(exploreDstTransitions('', 2026)).toEqual({ ok: false, error: 'Choose a timezone.' });
  });

  it('rejects a non-integer year', () => {
    expect(exploreDstTransitions('UTC', 2026.5)).toEqual({ ok: false, error: 'Enter a valid year.' });
  });
});
