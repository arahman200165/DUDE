import { add, det, inv, multiply, subtract, transpose } from 'mathjs';

export type MatrixOp = 'add' | 'sub' | 'mul' | 'transpose-a' | 'det-a' | 'inv-a' | 'scalar-mul-a';

export type Matrix = readonly (readonly number[])[];

export type MatrixOpResult =
  | { readonly ok: true; readonly kind: 'matrix'; readonly value: Matrix }
  | { readonly ok: true; readonly kind: 'scalar'; readonly value: number }
  | { readonly ok: false; readonly error: string };

export function parseMatrix(input: string): Matrix | null {
  const rows = input
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '');
  if (rows.length === 0) return null;

  const matrix: number[][] = [];
  for (const row of rows) {
    const values = row
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (values.length === 0 || !values.every(Number.isFinite)) return null;
    matrix.push(values);
  }

  const width = matrix[0].length;
  return matrix.every((r) => r.length === width) ? matrix : null;
}

export function computeMatrixOp(a: Matrix, b: Matrix | null, op: MatrixOp, scalar: number): MatrixOpResult {
  try {
    const mutableA = a.map((row) => [...row]);
    const mutableB = b?.map((row) => [...row]);

    switch (op) {
      case 'add':
        if (!mutableB) return { ok: false, error: 'Matrix B is required.' };
        return { ok: true, kind: 'matrix', value: add(mutableA, mutableB) as number[][] };
      case 'sub':
        if (!mutableB) return { ok: false, error: 'Matrix B is required.' };
        return { ok: true, kind: 'matrix', value: subtract(mutableA, mutableB) as number[][] };
      case 'mul':
        if (!mutableB) return { ok: false, error: 'Matrix B is required.' };
        return { ok: true, kind: 'matrix', value: multiply(mutableA, mutableB) as number[][] };
      case 'transpose-a':
        return { ok: true, kind: 'matrix', value: transpose(mutableA) as number[][] };
      case 'det-a':
        return { ok: true, kind: 'scalar', value: det(mutableA) as number };
      case 'inv-a':
        return { ok: true, kind: 'matrix', value: inv(mutableA) as number[][] };
      case 'scalar-mul-a':
        return { ok: true, kind: 'matrix', value: mutableA.map((row) => row.map((v) => v * scalar)) };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not compute this matrix operation.' };
  }
}
