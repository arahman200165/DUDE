import { buildTicks, positionMarkers } from "./timeline-layout.js";

describe('positionMarkers', () => {
  it('positions markers proportionally within the range', () => {
    const markers = positionMarkers([{ epochMs: 0 }, { epochMs: 500 }, { epochMs: 1000 }], 0, 1000);
    expect(markers.map((m) => m.percent)).toEqual([0, 50, 100]);
  });

  it('clamps markers outside the range to the nearest edge', () => {
    const markers = positionMarkers([{ epochMs: -500 }, { epochMs: 1500 }], 0, 1000);
    expect(markers.map((m) => m.percent)).toEqual([0, 100]);
  });

  it('preserves label and emphasis fields', () => {
    const markers = positionMarkers([{ epochMs: 500, label: 'Now', emphasis: 'now' }], 0, 1000);
    expect(markers[0]).toMatchObject({ label: 'Now', emphasis: 'now', percent: 50 });
  });

  it('does not divide by zero for a zero-width range', () => {
    const markers = positionMarkers([{ epochMs: 100 }], 100, 100);
    expect(markers[0].percent).toBe(0);
  });
});

describe('buildTicks', () => {
  it('builds the requested number of evenly spaced ticks', () => {
    const ticks = buildTicks(0, 1000, 5);
    expect(ticks.map((t) => t.percent)).toEqual([0, 25, 50, 75, 100]);
  });

  it('defaults to 5 ticks', () => {
    expect(buildTicks(0, 1_000_000)).toHaveLength(5);
  });

  it('produces a non-empty label for every tick', () => {
    const ticks = buildTicks(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2));
    expect(ticks.every((t) => t.label.length > 0)).toBe(true);
  });
});
