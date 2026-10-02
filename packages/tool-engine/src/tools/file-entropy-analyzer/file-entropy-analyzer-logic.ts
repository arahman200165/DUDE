import { classifyEntropy, EntropyVerdict, EntropyWindow, shannonEntropy, slidingWindowEntropy } from "../../shared/utils/byte-entropy.js";

export interface EntropyReport {
  readonly byteLength: number;
  readonly overallEntropy: number;
  readonly verdict: EntropyVerdict;
  readonly windows: readonly EntropyWindow[];
}

export const DEFAULT_WINDOW_SIZE = 256;

export function analyzeFileEntropy(bytes: Uint8Array, windowSize = DEFAULT_WINDOW_SIZE): EntropyReport {
  const overallEntropy = shannonEntropy(bytes);
  return {
    byteLength: bytes.length,
    overallEntropy,
    verdict: classifyEntropy(overallEntropy),
    windows: slidingWindowEntropy(bytes, windowSize),
  };
}
