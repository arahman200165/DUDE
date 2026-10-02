import { Matrix, MatrixOp, MatrixOpResult, computeMatrixOp, parseMatrix } from "./matrix-calculate.js";
export function MatrixCalculatorTool_formatMatrix(matrix: Matrix): string {
    return matrix.map((row) => row.map((v) => roundDisplay(v)).join('\t')).join('\n');
}
export function roundDisplay(value: number): number {
    return Math.round(value * 1e8) / 1e8;
}
