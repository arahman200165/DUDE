import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { computeStatistics } from './statistics-calculate';

describe('statistics calculator properties', () => {
  it('reports consistent count, sum, bounds, and range', () => {
    invariant(
      (values) => computeStatistics(values),
      fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 100 }),
      (result, values) => result.ok && result.value.count === values.length && result.value.sum === values.reduce((sum, value) => sum + value, 0) && result.value.min === Math.min(...values) && result.value.max === Math.max(...values) && result.value.range === result.value.max - result.value.min,
    );
  });
});
