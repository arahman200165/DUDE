import { describe, expect, it } from 'vitest';
import { durationRows } from './duration-formatter-mobile';

describe('durationRows', () => {
  it('lists every representation for human shorthand', () => {
    const result = durationRows('1d 2h 30m');
    expect(result).toEqual({
      ok: true,
      output: [
        { key: 'ms', label: 'Milliseconds', value: '95400000' },
        { key: 'human', label: 'Human-readable', value: '1 day, 2 hours, 30 minutes' },
        { key: 'iso8601', label: 'ISO 8601', value: 'P1DT2H30M' },
        { key: 'breakdown', label: 'Component breakdown', value: '1d 2h 30m 0s 0ms' },
      ],
    });
  });

  it('parses ISO 8601 durations', () => {
    const result = durationRows('PT1H30M');
    expect(result.ok && Array.isArray(result.output) && result.output[0]?.value).toBe('5400000');
  });

  it('reports unparseable input as an error', () => {
    expect(durationRows('not a duration')).toEqual({ ok: false, error: 'Could not parse "not a duration" as a duration.' });
  });
});
