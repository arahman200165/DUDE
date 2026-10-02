import { EntropyReport } from "./file-entropy-analyzer-logic.js";

export interface FileEntropyAnalyzerWorkerPayload {
  readonly buffer: ArrayBuffer;
  readonly windowSize: number;
}

export type FileEntropyAnalyzerWorkerResult = EntropyReport;
