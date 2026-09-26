import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { computeMatrixOp } from './matrix-calculate';

describe('matrix calculator properties', () => {
  it('adds a matrix to zero without changing it', () => {
    const matrix = fc.array(fc.array(fc.integer({ min: -50, max: 50 }), { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 4 })
      .filter((rows) => rows.every((row) => row.length === rows[0].length));
    invariant(
      (a) => computeMatrixOp(a, a.map((row) => row.map(() => 0)), 'add', 1),
      matrix,
      (result, a) => result.ok && result.kind === 'matrix' && JSON.stringify(result.value) === JSON.stringify(a),
    );
  });
});
