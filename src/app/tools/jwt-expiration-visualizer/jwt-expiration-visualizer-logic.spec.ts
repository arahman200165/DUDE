import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildTimeline } from './jwt-expiration-visualizer-logic';

const NOW = new Date('2026-01-01T00:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);

describe('buildTimeline', () => {
  it('rejects a non-object payload', () => {
    const result = buildTimeline(null, NOW);
    expect(result.ok).toBe(false);
  });

  it('reports no-expiry when there are no temporal claims', () => {
    const result = buildTimeline({}, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.status).toBe('no-expiry');
  });

  it('reports active with a computed percentElapsed', () => {
    const result = buildTimeline({ iat: nowSec - 1800, exp: nowSec + 1800 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.status).toBe('active');
    expect(result.timeline.percentElapsed).toBeCloseTo(50, 0);
    expect(result.timeline.totalLifetimeMs).toBe(3600 * 1000);
  });

  it('reports expired when exp is in the past', () => {
    const result = buildTimeline({ iat: nowSec - 7200, exp: nowSec - 60 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.status).toBe('expired');
    expect(result.timeline.remainingMs).toBeLessThan(0);
  });

  it('reports not-yet-valid when nbf is in the future', () => {
    const result = buildTimeline({ nbf: nowSec + 600, exp: nowSec + 1200 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.status).toBe('not-yet-valid');
  });

  it('prefers nbf over iat as the lifetime start when both are present', () => {
    const result = buildTimeline({ iat: nowSec - 3600, nbf: nowSec - 1800, exp: nowSec + 1800 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.totalLifetimeMs).toBe(3600 * 1000);
  });

  it('clamps percentElapsed to [0, 100]', () => {
    const result = buildTimeline({ iat: nowSec - 100000, exp: nowSec - 50000 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.percentElapsed).toBe(100);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary JSON-shaped payload', () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        expect(() => buildTimeline(payload)).not.toThrow();
      }),
    );
  });

  it('never throws for a plausible-shaped payload with arbitrary numeric claims', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), fc.double(), (iat, nbf, exp) => {
        expect(() => buildTimeline({ iat, nbf, exp })).not.toThrow();
      }),
    );
  });
});
