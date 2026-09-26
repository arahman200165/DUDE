import fc from 'fast-check';
import { describe, it } from 'vitest';
import { roundTrip } from '../../../testing/property-harness';
import { convertRegexFlavor } from './regex-flavor-convert';

const literal = fc.constantFrom('a', 'b', '1', '_');

describe('convertRegexFlavor properties', () => {
  it('round-trips simple literals through Python syntax', () => {
    roundTrip<string>(
      (pattern) => {
        const result = convertRegexFlavor(pattern, '', 'js', 'python');
        if (!result.ok) throw new Error(result.error);
        return result.output;
      },
      (pattern) => {
        const result = convertRegexFlavor(pattern as string, '', 'python', 'js');
        if (!result.ok) throw new Error(result.error);
        return result.output;
      },
      literal,
    );
  });
});

