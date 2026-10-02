import { describe, expect, it } from 'vitest';
import { inspectPercentEncoding } from "./percent-encoding-inspect.js";

describe('inspectPercentEncoding', () => {
  it('groups multi-byte percent-encoded UTF-8 into one decoded character', () => {
    const result = inspectPercentEncoding('caf%C3%A9');
    expect(result.decoded).toBe('café');
    expect(result.error).toBeUndefined();

    const encodedSegment = result.segments.at(-1);
    expect(encodedSegment).toEqual({ raw: '%C3%A9', kind: 'encoded', decoded: 'é', bytes: [0xc3, 0xa9] });
  });

  it('marks unreserved literal characters as "literal"', () => {
    const result = inspectPercentEncoding('abc-_.~');
    expect(result.segments.every((s) => s.kind === 'literal')).toBe(true);
  });

  it('flags a literal character that encodeURIComponent would have escaped', () => {
    const result = inspectPercentEncoding('a b+c');
    const flagged = result.segments.filter((s) => s.kind === 'reserved-unencoded').map((s) => s.raw);
    expect(flagged).toEqual([' ', '+']);
  });

  it('reports an error on an invalid percent sequence without losing prior segments', () => {
    const result = inspectPercentEncoding('ab%zz');
    expect(result.error).toContain('Invalid percent-encoding');
    expect(result.segments.map((s) => s.raw)).toEqual(['a', 'b']);
  });

  it('reports an error on a percent sequence that is not valid UTF-8', () => {
    const result = inspectPercentEncoding('%FF%FE');
    expect(result.error).toContain('not valid percent-encoded UTF-8');
  });
});
