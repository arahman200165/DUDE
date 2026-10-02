import { computeSyncedScrollTop } from "./markdown-scroll-sync.js";

describe('computeSyncedScrollTop', () => {
  it('maps the source scroll ratio onto the target scroll range', () => {
    // source is scrolled halfway (100 of 200 scrollable px)
    expect(computeSyncedScrollTop(100, 300, 100, 400, 200)).toBe(100);
  });

  it('returns 0 when the source has no scrollable overflow', () => {
    expect(computeSyncedScrollTop(0, 100, 100, 400, 200)).toBe(0);
  });

  it('returns 0 when the target has no scrollable overflow', () => {
    expect(computeSyncedScrollTop(50, 300, 100, 100, 100)).toBe(0);
  });

  it('clamps the ratio to [0, 1] for out-of-range scrollTop values', () => {
    expect(computeSyncedScrollTop(-10, 300, 100, 400, 200)).toBe(0);
    expect(computeSyncedScrollTop(10_000, 300, 100, 400, 200)).toBe(200);
  });

  it('maps a fully-scrolled source to a fully-scrolled target', () => {
    expect(computeSyncedScrollTop(200, 300, 100, 400, 200)).toBe(200);
  });
});
