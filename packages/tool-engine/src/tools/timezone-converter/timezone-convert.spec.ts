import { convertToZones, listTimeZones } from "./timezone-convert.js";

describe('convertToZones', () => {
  it('converts a moment from one zone to another', () => {
    const result = convertToZones({ date: '2026-01-15', time: '12:00', sourceZone: 'UTC' }, ['America/New_York']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results).toEqual([
      { zone: 'America/New_York', formatted: '2026-01-15 07:00:00', utcOffset: '-05:00', isDst: false },
    ]);
  });

  it('flags a zone that observes daylight saving time in summer', () => {
    const result = convertToZones({ date: '2026-07-15', time: '12:00', sourceZone: 'UTC' }, ['America/New_York']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results[0].isDst).toBe(true);
    expect(result.ok && result.results[0].utcOffset).toBe('-04:00');
  });

  it('converts to multiple target zones at once', () => {
    const result = convertToZones({ date: '2026-01-15', time: '00:00', sourceZone: 'UTC' }, ['UTC', 'Asia/Tokyo']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results.map((r) => r.zone)).toEqual(['UTC', 'Asia/Tokyo']);
  });

  it('defaults an empty time to midnight', () => {
    const result = convertToZones({ date: '2026-01-15', time: '', sourceZone: 'UTC' }, ['UTC']);
    expect(result.ok && result.results[0].formatted).toBe('2026-01-15 00:00:00');
  });

  it('reports an error for a missing date', () => {
    expect(convertToZones({ date: '', time: '12:00', sourceZone: 'UTC' }, ['UTC']).ok).toBe(false);
  });

  it('reports an error when no target zones are given', () => {
    expect(convertToZones({ date: '2026-01-15', time: '12:00', sourceZone: 'UTC' }, []).ok).toBe(false);
  });

  it('reports an error for an invalid source timezone', () => {
    const result = convertToZones({ date: '2026-01-15', time: '12:00', sourceZone: 'Not/AZone' }, ['UTC']);
    expect(result.ok).toBe(false);
  });
});

describe('listTimeZones', () => {
  it('returns a sorted, deduplicated list that includes UTC', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/New_York');
    expect([...zones].sort()).toEqual(zones);
    expect(new Set(zones).size).toBe(zones.length);
  });
});
