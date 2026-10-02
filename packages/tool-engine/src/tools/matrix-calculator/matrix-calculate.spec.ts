import { describe, expect, it } from 'vitest';
import { computeMatrixOp, parseMatrix } from "./matrix-calculate.js";

describe('parseMatrix', () => {
  it('parses rows of comma or space separated numbers', () => {
    expect(parseMatrix('1, 2\n3, 4')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(parseMatrix('1 2\n3 4')).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('rejects ragged rows', () => {
    expect(parseMatrix('1, 2\n3, 4, 5')).toBeNull();
  });

  it('rejects empty input or non-numeric values', () => {
    expect(parseMatrix('')).toBeNull();
    expect(parseMatrix('1, two')).toBeNull();
  });
});

describe('computeMatrixOp', () => {
  const a = [
    [1, 2],
    [3, 4],
  ];
  const b = [
    [5, 6],
    [7, 8],
  ];

  it('adds, subtracts, and multiplies two matrices', () => {
    expect(computeMatrixOp(a, b, 'add', 1)).toEqual({
      ok: true,
      kind: 'matrix',
      value: [
        [6, 8],
        [10, 12],
      ],
    });
    expect(computeMatrixOp(a, b, 'mul', 1)).toEqual({
      ok: true,
      kind: 'matrix',
      value: [
        [19, 22],
        [43, 50],
      ],
    });
  });

  it('computes the determinant and inverse of A', () => {
    expect(computeMatrixOp(a, null, 'det-a', 1)).toEqual({ ok: true, kind: 'scalar', value: -2 });

    const inverse = computeMatrixOp(a, null, 'inv-a', 1);
    expect(inverse.ok && inverse.kind === 'matrix' && inverse.value).toEqual([
      [-2, 1],
      [1.5, -0.5],
    ]);
  });

  it('scalar-multiplies A', () => {
    expect(computeMatrixOp(a, null, 'scalar-mul-a', 3)).toEqual({
      ok: true,
      kind: 'matrix',
      value: [
        [3, 6],
        [9, 12],
      ],
    });
  });

  it('rejects inverting a singular matrix', () => {
    const singular = [
      [1, 2],
      [2, 4],
    ];
    expect(computeMatrixOp(singular, null, 'inv-a', 1).ok).toBe(false);
  });

  it('rejects an operation requiring B when B is missing', () => {
    expect(computeMatrixOp(a, null, 'add', 1).ok).toBe(false);
  });

  it('rejects multiplying incompatible dimensions', () => {
    const wrongShape = [[1, 2, 3]];
    expect(computeMatrixOp(a, wrongShape, 'mul', 1).ok).toBe(false);
  });
});
