import { BinaryStringsOptions, BinaryStringsReport } from "./binary-strings-extractor-logic.js";

export interface BinaryStringsExtractorWorkerPayload {
  readonly buffer: ArrayBuffer;
  readonly options: BinaryStringsOptions;
}

export type BinaryStringsExtractorWorkerResult = BinaryStringsReport;
