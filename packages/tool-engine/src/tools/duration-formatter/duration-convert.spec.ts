import { parseDuration } from "./duration-convert.js";

describe('parseDuration', () => {
  it('parses human shorthand into all representations', () => {
    const result = parseDuration('1d 2h 30m');
    expect(result.ok).toBe(true);
    expect(result.ok && result.result.ms).toBe(95_400_000);
    expect(result.ok && result.result.breakdown).toEqual({
      days: 1,
      hours: 2,
      minutes: 30,
      seconds: 0,
      milliseconds: 0,
    });
    expect(result.ok && result.result.iso8601).toBe('P1DT2H30M');
  });

  it('parses a bare number of seconds shorthand', () => {
    const result = parseDuration('90s');
    expect(result.ok).toBe(true);
    expect(result.ok && result.result.ms).toBe(90_000);
    expect(result.ok && result.result.breakdown).toEqual({
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 30,
      milliseconds: 0,
    });
  });

  it('parses an ISO 8601 duration string', () => {
    const result = parseDuration('PT1H30M');
    expect(result.ok).toBe(true);
    expect(result.ok && result.result.ms).toBe(90 * 60 * 1000);
  });

  it('parses an ISO 8601 duration with days and fractional seconds', () => {
    const result = parseDuration('P2DT3H4M5.5S');
    expect(result.ok).toBe(true);
    const expectedMs = 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_500;
    expect(result.ok && result.result.ms).toBe(expectedMs);
  });

  it('round-trips an ISO 8601 duration through formatIso8601', () => {
    const result = parseDuration('PT2H15M');
    expect(result.ok && result.result.iso8601).toBe('PT2H15M');
  });

  it('reports an error for empty input', () => {
    expect(parseDuration('').ok).toBe(false);
    expect(parseDuration('   ').ok).toBe(false);
  });

  it('reports an error for unparseable input', () => {
    expect(parseDuration('not a duration').ok).toBe(false);
  });

  it('reports an error for a malformed ISO 8601 string', () => {
    expect(parseDuration('P').ok).toBe(false);
  });
});
