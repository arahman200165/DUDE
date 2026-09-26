import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import {
  ByteRange,
  ContentRange,
  buildContentRangeHeader,
  buildRangeHeader,
  checkRangeWarnings,
  parseContentRangeHeader,
  parseRangeHeader,
} from './range-header';

const rangeArb: fc.Arbitrary<ByteRange> = fc.record({ key: fc.string(), value: fc.string() });
const rangesArb = fc.array(rangeArb, { maxLength: 6 });

const contentRangeArb: fc.Arbitrary<ContentRange> = fc.record({
  start: fc.string(),
  end: fc.string(),
  total: fc.string(),
});

describe('range-header fuzzing', () => {
  it('parseRangeHeader/parseContentRangeHeader never throw for arbitrary text', () => {
    neverThrows((raw: string) => parseRangeHeader(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array of ByteRange');
      },
    });
    neverThrows((raw: string) => parseContentRangeHeader(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as ContentRange).total !== 'string') throw new Error('expected a ContentRange');
      },
    });
  });

  it('buildRangeHeader/buildContentRangeHeader never throw for arbitrary input', () => {
    neverThrows((ranges: readonly ByteRange[]) => buildRangeHeader(ranges), rangesArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
    neverThrows((range: ContentRange) => buildContentRangeHeader(range), contentRangeArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('checkRangeWarnings never throws and reports at most one warning per range', () => {
    invariant(checkRangeWarnings, rangesArb, (result, ranges) => Array.isArray(result) && result.length <= ranges.length);
  });

  it('buildRangeHeader is empty exactly when there are no non-empty ranges, and starts with "bytes=" otherwise', () => {
    invariant(buildRangeHeader, rangesArb, (result, ranges) => {
      const hasValid = ranges.some((r) => r.key !== '' || r.value !== '');
      return hasValid ? result.startsWith('bytes=') : result === '';
    });
  });
});
