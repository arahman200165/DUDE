import { byteHistogram } from "../../shared/utils/byte-entropy.js";

export interface ByteFrequencyReport {
  readonly byteLength: number;
  readonly histogram: readonly number[];
  readonly maxCount: number;
  readonly mostFrequentByte: number | null;
  readonly distinctByteValues: number;
}

export function analyzeByteFrequency(bytes: Uint8Array): ByteFrequencyReport {
  const histogram = byteHistogram(bytes);

  let maxCount = 0;
  let mostFrequentByte: number | null = null;
  let distinctByteValues = 0;

  for (let value = 0; value < 256; value++) {
    const count = histogram[value];
    if (count > 0) distinctByteValues++;
    if (count > maxCount) {
      maxCount = count;
      mostFrequentByte = value;
    }
  }

  return { byteLength: bytes.length, histogram: Array.from(histogram), maxCount, mostFrequentByte, distinctByteValues };
}
