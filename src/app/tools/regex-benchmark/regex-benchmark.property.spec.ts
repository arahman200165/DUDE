import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { timeSample } from './regex-benchmark-run';

const safePattern = fc.array(fc.constantFrom('a', 'b', '0', '1'), { maxLength: 12 }).map((chars) => chars.join(''));

describe('timeSample properties', () => {
  it('returns finite non-negative timing for safe generated patterns', () => {
    invariant(timeSample, fc.tuple(safePattern, fc.string({ maxLength: 64 })).map(([pattern, sample]) => ({ pattern, flags: '', sample })), (result) => result.ok && Number.isFinite(result.ms) && result.ms >= 0);
  });

  it('never throws for bounded text and safe patterns with arbitrary flags', () => {
    neverThrows(([pattern, flags, sample]) => timeSample({ pattern, flags, sample }), fc.tuple(safePattern, fc.string(), fc.string({ maxLength: 16 })));
  });
});
