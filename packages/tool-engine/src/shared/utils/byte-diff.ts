/**
 * Fixed-width hex-row byte comparison for binary files — deliberately not
 * a Myers/LCS diff over bytes, since alignment-based diffing is the wrong
 * tool for noisy binary content (a single inserted byte would cascade into
 * "changed" for the rest of the file). Extracted from Directory Diff's
 * binary drill-down on its second consumer, the standalone Hex Diff tool.
 */

export interface ByteDiffChunk {
  readonly offset: number;
  readonly leftBytes: Uint8Array | null;
  readonly rightBytes: Uint8Array | null;
  readonly equal: boolean;
}

export function computeByteDiff(left: Uint8Array, right: Uint8Array, chunkSize = 16): readonly ByteDiffChunk[] {
  const chunks: ByteDiffChunk[] = [];
  const maxLength = Math.max(left.length, right.length);

  for (let offset = 0; offset < maxLength; offset += chunkSize) {
    const leftChunk = offset < left.length ? left.slice(offset, offset + chunkSize) : null;
    const rightChunk = offset < right.length ? right.slice(offset, offset + chunkSize) : null;
    const equal =
      leftChunk !== null &&
      rightChunk !== null &&
      leftChunk.length === rightChunk.length &&
      leftChunk.every((byte, i) => byte === rightChunk[i]);

    chunks.push({ offset, leftBytes: leftChunk, rightBytes: rightChunk, equal });
  }

  return chunks;
}

/** Heuristic text/binary detection: a NUL byte in the sampled prefix strongly indicates binary content. */
export function looksLikeText(bytes: Uint8Array, sampleSize = 8000): boolean {
  const sample = bytes.subarray(0, sampleSize);
  return !sample.includes(0);
}
