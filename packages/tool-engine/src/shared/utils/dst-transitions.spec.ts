import { findDstTransitions, formatOffsetMinutes, nextDstTransition } from "./dst-transitions.js";

describe('findDstTransitions', () => {
  it('finds both US DST transitions for America/New_York in 2026', () => {
    const transitions = findDstTransitions('America/New_York', 2026);
    expect(transitions).toHaveLength(2);

    const [springForward, fallBack] = transitions;
    expect(springForward.direction).toBe('spring-forward');
    expect(springForward.fromOffsetMinutes).toBe(-300);
    expect(springForward.toOffsetMinutes).toBe(-240);
    expect(springForward.gapMinutes).toBe(60);

    expect(fallBack.direction).toBe('fall-back');
    expect(fallBack.fromOffsetMinutes).toBe(-240);
    expect(fallBack.toOffsetMinutes).toBe(-300);
    expect(fallBack.gapMinutes).toBe(60);

    // Spring-forward: 2nd Sunday in March. Fall-back: 1st Sunday in November.
    expect(new Date(springForward.instantMs).toISOString().slice(0, 10)).toBe('2026-03-08');
    expect(new Date(fallBack.instantMs).toISOString().slice(0, 10)).toBe('2026-11-01');
  });

  it('returns no transitions for a zone without DST', () => {
    expect(findDstTransitions('UTC', 2026)).toEqual([]);
    expect(findDstTransitions('Asia/Tokyo', 2026)).toEqual([]);
  });

  it('returns an empty list for an unknown zone', () => {
    expect(findDstTransitions('Not/AZone', 2026)).toEqual([]);
  });
});

describe('nextDstTransition', () => {
  it('finds the next transition after a given instant, crossing into the following year if needed', () => {
    const afterFallBack = Date.UTC(2026, 11, 1); // December 2026, after both 2026 transitions
    const next = nextDstTransition('America/New_York', afterFallBack);
    expect(next?.direction).toBe('spring-forward');
    expect(new Date(next!.instantMs).getUTCFullYear()).toBe(2027);
  });

  it('returns undefined for a zone with no DST', () => {
    expect(nextDstTransition('UTC', Date.now())).toBeUndefined();
  });
});

describe('formatOffsetMinutes', () => {
  it('formats a positive offset', () => {
    expect(formatOffsetMinutes(330)).toBe('+05:30');
  });

  it('formats a negative offset', () => {
    expect(formatOffsetMinutes(-240)).toBe('-04:00');
  });

  it('formats a zero offset with a plus sign', () => {
    expect(formatOffsetMinutes(0)).toBe('+00:00');
  });
});
