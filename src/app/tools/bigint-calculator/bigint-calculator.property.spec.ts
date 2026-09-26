import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { computeBigCalc } from './bigint-calculator';

describe('BigInt calculator properties', () => {
  it('preserves additive and multiplicative identities and inverse subtraction', () => {
    const values = fc.bigInt({ min: -1_000_000n, max: 1_000_000n });
    invariant(
      ({ a, b }) => [computeBigCalc(a, b, 'add'), computeBigCalc(a + b, b, 'sub'), computeBigCalc(a, 1n, 'mul')],
      fc.record({ a: values, b: values }),
      (results, { a, b }) => results[0].ok && results[0].value === a + b && results[1].ok && results[1].value === a && results[2].ok && results[2].value === a,
    );
  });
});
