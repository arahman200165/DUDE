import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { compressBytes, computeStats, decompressBytes, type CompressionFormat } from "@dude/tool-engine/tools/compression-lab/compression-lab-transform";

const formatArb = fc.constantFrom<CompressionFormat>('gzip', 'deflate', 'deflate-raw');

describe('compressBytes / decompressBytes round-trip property', () => {
  it('decompressBytes(compressBytes(bytes, format)) recovers the original bytes, across formats', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 256 }), formatArb, async (bytes, format) => {
        const compressed = await compressBytes(bytes, format);
        const decompressed = await decompressBytes(compressed, format);
        expect(Array.from(decompressed)).toEqual(Array.from(bytes));
      }),
      { numRuns: 50 },
    );
  });
});

describe('computeStats property', () => {
  it('reports the exact input/output sizes and a null ratio only for empty input', () => {
    invariant(
      ([inputBytes, outputBytes]: [number, number]) => computeStats(inputBytes, outputBytes),
      fc.tuple(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 })),
      (stats, [inputBytes, outputBytes]) =>
        stats.inputBytes === inputBytes &&
        stats.outputBytes === outputBytes &&
        (inputBytes === 0 ? stats.ratio === null : Math.abs(stats.ratio! - outputBytes / inputBytes) < 1e-9),
    );
  });
});
