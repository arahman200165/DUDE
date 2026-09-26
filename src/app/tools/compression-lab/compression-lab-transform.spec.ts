import { deflateRawSync, deflateSync, gunzipSync, gzipSync, inflateRawSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compressBytes, computeStats, decompressBytes } from './compression-lab-transform';

const SAMPLE = new TextEncoder().encode('hello world '.repeat(50));

describe('compressBytes / decompressBytes', () => {
  it.each(['gzip', 'deflate', 'deflate-raw'] as const)('round-trips through %s', async (format) => {
    const compressed = await compressBytes(SAMPLE, format);
    expect(compressed.length).toBeGreaterThan(0);
    expect(compressed.length).toBeLessThan(SAMPLE.length);

    const decompressed = await decompressBytes(compressed, format);
    expect(new TextDecoder().decode(decompressed)).toBe(new TextDecoder().decode(SAMPLE));
  });

  it.each([
    ['gzip', gzipSync, gunzipSync],
    ['deflate', deflateSync, inflateSync],
    ['deflate-raw', deflateRawSync, inflateRawSync],
  ] as const)('cross-checks native %s streams against Node zlib', async (format, nodeCompress, nodeDecompress) => {
    const nativeCompressed = await compressBytes(SAMPLE, format);
    expect(Array.from(nodeDecompress(nativeCompressed))).toEqual(Array.from(SAMPLE));

    const nodeCompressed = new Uint8Array(nodeCompress(SAMPLE));
    expect(Array.from(await decompressBytes(nodeCompressed, format))).toEqual(Array.from(SAMPLE));
  });

  it('rejects garbage input when decompressing', async () => {
    await expect(decompressBytes(new Uint8Array([1, 2, 3, 4]), 'gzip')).rejects.toBeTruthy();
  });
});

describe('computeStats', () => {
  it('computes a shrink ratio below 1', () => {
    expect(computeStats(100, 40)).toEqual({ inputBytes: 100, outputBytes: 40, ratio: 0.4 });
  });

  it('returns a null ratio for empty input', () => {
    expect(computeStats(0, 0).ratio).toBeNull();
  });
});
