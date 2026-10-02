import { buildRangeMarkers, parseMultiTimestamps } from "./epoch-timeline-visualizer-logic.js";

describe('parseMultiTimestamps', () => {
  it('parses epoch-seconds, epoch-milliseconds, and ISO timestamps with optional labels', () => {
    const result = parseMultiTimestamps('1700000000 | Seconds\n1700000000000 | Millis\n2023-11-14T22:13:20Z | ISO', false, Date.now());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.markers).toEqual([
      { epochMs: 1_700_000_000_000, label: 'Seconds' },
      { epochMs: 1_700_000_000_000, label: 'Millis' },
      { epochMs: 1_700_000_000_000, label: 'ISO' },
    ]);
  });

  it('defaults a label to the ISO string when none is given', () => {
    const result = parseMultiTimestamps('1700000000', false, Date.now());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markers[0].label).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('appends a "now" marker when requested', () => {
    const nowMs = Date.now();
    const result = parseMultiTimestamps('1700000000', true, nowMs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markers.at(-1)).toEqual({ epochMs: nowMs, label: 'Now', emphasis: 'now' });
  });

  it('pads the range around the min/max markers', () => {
    const result = parseMultiTimestamps('0\n1000000', false, Date.now());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rangeStartMs).toBeLessThan(0);
    expect(result.rangeEndMs).toBeGreaterThan(1_000_000);
  });

  it('rejects empty input', () => {
    expect(parseMultiTimestamps('', false, Date.now())).toEqual({ ok: false, error: 'Enter at least one timestamp.' });
  });

  it('rejects an unparsable line', () => {
    const result = parseMultiTimestamps('not-a-timestamp', false, Date.now());
    expect(result).toEqual({ ok: false, error: 'Could not parse "not-a-timestamp" as a timestamp.' });
  });
});

describe('buildRangeMarkers', () => {
  it('builds start and end markers with padding around them', () => {
    const result = buildRangeMarkers({ startMs: 1000, endMs: 2000, includeNow: false, nowMs: 1500 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markers).toEqual([
      { epochMs: 1000, label: 'Start', emphasis: 'accent' },
      { epochMs: 2000, label: 'End', emphasis: 'accent' },
    ]);
    expect(result.rangeStartMs).toBeLessThan(1000);
    expect(result.rangeEndMs).toBeGreaterThan(2000);
  });

  it('includes a "now" marker only when now falls within the range', () => {
    const withinRange = buildRangeMarkers({ startMs: 1000, endMs: 2000, includeNow: true, nowMs: 1500 });
    expect(withinRange.ok && withinRange.markers).toHaveLength(3);

    const outsideRange = buildRangeMarkers({ startMs: 1000, endMs: 2000, includeNow: true, nowMs: 9000 });
    expect(outsideRange.ok && outsideRange.markers).toHaveLength(2);
  });

  it('rejects an end at or before start', () => {
    expect(buildRangeMarkers({ startMs: 2000, endMs: 1000, includeNow: false, nowMs: 0 })).toEqual({
      ok: false,
      error: 'End must be after start.',
    });
  });

  it('rejects non-finite input', () => {
    expect(buildRangeMarkers({ startMs: NaN, endMs: 1000, includeNow: false, nowMs: 0 })).toEqual({
      ok: false,
      error: 'Enter valid start and end date/times.',
    });
  });
});
