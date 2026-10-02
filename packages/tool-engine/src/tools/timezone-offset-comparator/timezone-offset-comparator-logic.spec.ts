import { buildOffsetGrid, comparePairwise } from "./timezone-offset-comparator-logic.js";

describe('buildOffsetGrid', () => {
  it('shows a changing offset across months for a DST-observing zone', () => {
    const result = buildOffsetGrid({ zones: ['America/New_York', 'UTC'], year: 2026 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [nyRow, utcRow] = result.rows;
    expect(nyRow.zone).toBe('America/New_York');
    expect(nyRow.monthlyOffsets[0]).toBe('-05:00'); // January
    expect(nyRow.monthlyOffsets[3]).toBe('-04:00'); // April, after spring-forward

    expect(utcRow.monthlyOffsets.every((offset) => offset === '+00:00')).toBe(true);
  });

  it('rejects an empty zone list', () => {
    expect(buildOffsetGrid({ zones: [], year: 2026 })).toEqual({ ok: false, error: 'Add at least one timezone.' });
  });

  it('rejects an unknown zone', () => {
    expect(buildOffsetGrid({ zones: ['Not/AZone'], year: 2026 })).toEqual({ ok: false, error: 'Unknown timezone: "Not/AZone"' });
  });

  it('rejects a non-integer year', () => {
    expect(buildOffsetGrid({ zones: ['UTC'], year: 2026.5 })).toEqual({ ok: false, error: 'Enter a valid year.' });
  });
});

describe('comparePairwise', () => {
  it('computes the current gap and the next change (America/New_York vs UTC in January)', () => {
    const atMs = Date.UTC(2026, 0, 15);
    const result = comparePairwise({ zoneA: 'America/New_York', zoneB: 'UTC', atMs });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.offsetA).toBe('-05:00');
    expect(result.result.offsetB).toBe('+00:00');
    expect(result.result.gapMinutes).toBe(-300);
    expect(result.result.nextChange).toMatchObject({ zone: 'America/New_York', newGapMinutes: -240 });
    expect(result.result.nextChange!.whenIso.slice(0, 10)).toBe('2026-03-08');
  });

  it('reports zero gap for two zones with the same offset', () => {
    const result = comparePairwise({ zoneA: 'UTC', zoneB: 'Etc/UTC', atMs: Date.now() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.gapMinutes).toBe(0);
    expect(result.result.gapLabel).toBe('Same time in both zones');
  });

  it('omits nextChange when neither zone observes DST', () => {
    const result = comparePairwise({ zoneA: 'UTC', zoneB: 'Asia/Tokyo', atMs: Date.now() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.nextChange).toBeUndefined();
  });

  it('rejects an unknown zone', () => {
    expect(comparePairwise({ zoneA: 'Not/AZone', zoneB: 'UTC', atMs: Date.now() })).toEqual({
      ok: false,
      error: 'Unknown timezone: "Not/AZone"',
    });
  });
});
