import { Matrix, MatrixOp, MatrixOpResult } from "./matrix-calculate.js";

export interface MatrixWorkerPayload {
  readonly a: Matrix;
  readonly b: Matrix | null;
  readonly op: MatrixOp;
  readonly scalar: number;
}

export type MatrixWorkerResult = MatrixOpResult;
