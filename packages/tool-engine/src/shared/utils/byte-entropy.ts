/**
 * True Shannon byte-distribution entropy, in bits per byte (0-8). Distinct
 * from `secret-detector-logic.ts`'s `estimateEntropyBits`, which is a
 * charset-size-based estimate for password/secret strength -- this operates
 * on the actual byte-value histogram of arbitrary binary data.
 */
export function byteHistogram(bytes: Uint8Array): Uint32Array {
  const counts = new Uint32Array(256);
  for (const byte of bytes) counts[byte]++;
  return counts;
}

export function shannonEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;

  let entropy = 0;
  for (const count of byteHistogram(bytes)) {
    if (count === 0) continue;
    const p = count / bytes.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export interface EntropyWindow {
  readonly offset: number;
  readonly length: number;
  readonly entropy: number;
}

/** Splits `bytes` into fixed-size (last one possibly shorter) chunks and reports each chunk's entropy -- useful for spotting a packed/encrypted region inside an otherwise-structured file. */
export function slidingWindowEntropy(bytes: Uint8Array, windowSize = 256): readonly EntropyWindow[] {
  if (windowSize <= 0) throw new Error('windowSize must be positive.');

  const windows: EntropyWindow[] = [];
  for (let offset = 0; offset < bytes.length; offset += windowSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + windowSize, bytes.length));
    windows.push({ offset, length: chunk.length, entropy: shannonEntropy(chunk) });
  }
  return windows;
}

export type EntropyVerdict = 'low' | 'medium' | 'high';

/** Rough classification: structured/text data clusters low, typical program/document bytes sit in the middle, and compressed/encrypted/random data pushes close to the 8-bit ceiling. */
export function classifyEntropy(bitsPerByte: number): EntropyVerdict {
  if (bitsPerByte >= 7.5) return 'high';
  if (bitsPerByte >= 4) return 'medium';
  return 'low';
}
