import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeMatrixOp, Matrix, parseMatrix } from "./matrix-calculate.js";

/**
 * Pipeline-step adapter for the Matrix Calculator. Add/Subtract/Multiply each need two
 * independent matrices, so this adapter always applies the one single-matrix op, Transpose, to
 * matrix A. Accepts either `text` (newline-separated rows, `parseMatrix`'s own format) or `table`
 * (each row coerced to numbers). Runs `computeMatrixOp` directly rather than through
 * `matrix-calculator.worker.ts`, per the pipeline-step migration's worker policy.
 */
function matrixFromTable(table: { readonly columns: readonly string[]; readonly rows: readonly (readonly unknown[])[] }): Matrix | null {
  if (table.rows.length === 0) return null;
  const matrix: number[][] = [];
  for (const row of table.rows) {
    const values = row.map((cell) => Number(cell));
    if (values.length === 0 || !values.every(Number.isFinite)) return null;
    matrix.push(values);
  }
  const width = matrix[0].length;
  return matrix.every((r) => r.length === width) ? matrix : null;
}

export const pipelineStep: PipelineStep = {
  accepts: ['text', 'table'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text' && input.type !== 'table') {
      return { ok: false, error: { message: 'Matrix Calculator expects text or table input.', kind: 'invalid-input' } };
    }

    const matrix = input.type === 'text' ? parseMatrix(input.value) : matrixFromTable(input.value);
    if (!matrix) {
      return { ok: false, error: { message: 'Could not parse a matrix of numbers from the input.', kind: 'invalid-input' } };
    }

    const result = computeMatrixOp(matrix, null, 'transpose-a', 1);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    const rows = result.kind === 'matrix' ? result.value : [[result.value]];
    return {
      ok: true,
      output: { type: 'table', value: { columns: rows[0]?.map((_, i) => String(i)) ?? [], rows } },
    };
  },
};
