import { describe, expect, it } from 'vitest';
import {
  CURATED_ZONES, filterZones, isKnownZone, joinZones, listZones, momentText, offsetGridRows, pairwiseRows, parseMoment, parseZones, zoneClock, zoneKey, zonesAtMoment,
} from './timezone-offset-comparator-mobile';

describe('listZones', () => {
  it('uses the runtime list when available and always includes UTC', () => {
    expect(listZones({ supportedValuesOf: () => ['Europe/Paris', 'Asia/Tokyo'] })).toEqual(['Asia/Tokyo', 'Europe/Paris', 'UTC']);
  });
  it('falls back to the curated list when Intl.supportedValuesOf is missing or throws', () => {
    expect(listZones({})).toBe(CURATED_ZONES);
    expect(listZones({ supportedValuesOf: () => { throw new RangeError('nope'); } })).toBe(CURATED_ZONES);
  });
  it('curated zones are all known to Intl', () => {
    expect(CURATED_ZONES.filter(zone => !isKnownZone(zone))).toEqual([]);
  });
});

describe('zone helpers', () => {
  it('filters ignoring case and separators', () => {
    expect(filterZones(CURATED_ZONES, 'new york')).toEqual(['America/New_York']);
    expect(filterZones(CURATED_ZONES, 'TOKYO')).toEqual(['Asia/Tokyo']);
    expect(filterZones(CURATED_ZONES, '', 3)).toHaveLength(3);
  });
  it('round-trips the comma-separated selection and builds test-friendly keys', () => {
    expect(parseZones(' America/New_York, Europe/London ,')).toEqual(['America/New_York', 'Europe/London']);
    expect(joinZones(['A', 'B'])).toBe('A, B');
    expect(zoneKey('America/Argentina/Buenos_Aires')).toBe('America-Argentina-Buenos_Aires');
  });
  it('rejects unknown zones', () => {
    expect(isKnownZone('Not/AZone')).toBe(false);
    expect(zoneClock('Not/AZone', 0)).toBeNull();
  });
});

describe('parseMoment', () => {
  it('reads zone-less ISO text as UTC', () => {
    expect(parseMoment('2023-11-14T12:00')).toEqual({ ok: true, ms: Date.UTC(2023, 10, 14, 12) });
    expect(parseMoment('2023-11-14 12:00:30')).toEqual({ ok: true, ms: Date.UTC(2023, 10, 14, 12, 0, 30) });
    expect(parseMoment('2023-11-14')).toEqual({ ok: true, ms: Date.UTC(2023, 10, 14) });
  });
  it('honours an explicit offset', () => {
    expect(parseMoment('2023-11-14T12:00:00+02:00')).toEqual({ ok: true, ms: Date.UTC(2023, 10, 14, 10) });
  });
  it('rejects empty and garbage input', () => {
    expect(parseMoment('').ok).toBe(false);
    expect(parseMoment('garbage').ok).toBe(false);
  });
  it('momentText is the inverse for UTC minutes', () => {
    expect(momentText(Date.UTC(2023, 10, 14, 12, 5, 59))).toBe('2023-11-14T12:05');
  });
});

describe('zonesAtMoment', () => {
  const at = Date.UTC(2023, 10, 14, 12);
  it('shows wall-clock time and offset per zone', () => {
    const result = zonesAtMoment(['America/New_York', 'Europe/London', 'Asia/Kolkata', 'UTC'], at);
    expect(result).toEqual({
      ok: true,
      rows: [
        { key: 'America-New_York', label: 'America/New_York', value: '2023-11-14 07:00:00 -05:00' },
        { key: 'Europe-London', label: 'Europe/London', value: '2023-11-14 12:00:00 +00:00' },
        { key: 'Asia-Kolkata', label: 'Asia/Kolkata', value: '2023-11-14 17:30:00 +05:30' },
        { key: 'UTC', label: 'UTC', value: '2023-11-14 12:00:00 +00:00' },
      ],
    });
  });
  it('follows DST (July in New York is -04:00) and midnight does not render as 24', () => {
    const july = zonesAtMoment(['America/New_York'], Date.UTC(2023, 6, 1, 4));
    expect(july.ok && july.rows[0]?.value).toBe('2023-07-01 00:00:00 -04:00');
  });
  it('errors for no zones or an unknown zone', () => {
    expect(zonesAtMoment([], at)).toEqual({ ok: false, error: 'Add at least one timezone.' });
    expect(zonesAtMoment(['Not/AZone'], at)).toEqual({ ok: false, error: 'Unknown timezone: "Not/AZone"' });
  });
});

describe('engine-backed rows', () => {
  it('offsetGridRows lists twelve months (logic spec: January -05:00, April -04:00)', () => {
    const result = offsetGridRows(['America/New_York'], 2026);
    expect(result.ok && result.rows[0]?.value).toBe('Jan -05:00, Feb -05:00, Mar -05:00, Apr -04:00, May -04:00, Jun -04:00, Jul -04:00, Aug -04:00, Sep -04:00, Oct -04:00, Nov -04:00, Dec -05:00');
    expect(offsetGridRows([], 2026)).toEqual({ ok: false, error: 'Add at least one timezone.' });
  });
  it('pairwiseRows reports offsets and gap (logic spec: New York behind UTC by 5h in January)', () => {
    const result = pairwiseRows('America/New_York', 'UTC', Date.UTC(2026, 0, 15));
    expect(result.ok && result.rows.map(row => [row.key, row.value]).slice(0, 3)).toEqual([['offset-a', '-05:00'], ['offset-b', '+00:00'], ['gap', 'A is 5h behind B']]);
    expect(result.ok && result.rows.some(row => row.key === 'next-change')).toBe(true);
  });
  it('pairwiseRows rejects an unknown zone', () => {
    expect(pairwiseRows('Not/AZone', 'UTC', 0)).toEqual({ ok: false, error: 'Unknown timezone: "Not/AZone"' });
  });
});
