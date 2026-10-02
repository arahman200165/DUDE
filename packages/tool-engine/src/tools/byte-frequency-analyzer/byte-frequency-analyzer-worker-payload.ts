import { ByteFrequencyReport } from "./byte-frequency-analyzer-logic.js";

export interface ByteFrequencyAnalyzerWorkerPayload {
  readonly buffer: ArrayBuffer;
}

export type ByteFrequencyAnalyzerWorkerResult = ByteFrequencyReport;
