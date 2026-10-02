import { analyzeByteFrequency } from "./byte-frequency-analyzer-logic.js";

describe('analyzeByteFrequency', () => {
  it('reports a 256-entry histogram', () => {
    expect(analyzeByteFrequency(new Uint8Array([0x00, 0x01])).histogram).toHaveLength(256);
  });

  it('identifies the most frequent byte and its count', () => {
    const report = analyzeByteFrequency(new Uint8Array([0x41, 0x41, 0x41, 0x42]));
    expect(report.mostFrequentByte).toBe(0x41);
    expect(report.maxCount).toBe(3);
  });

  it('counts distinct byte values', () => {
    const report = analyzeByteFrequency(new Uint8Array([0x00, 0x00, 0x01, 0x02]));
    expect(report.distinctByteValues).toBe(3);
  });

  it('reports the byte length', () => {
    expect(analyzeByteFrequency(new Uint8Array(10)).byteLength).toBe(10);
  });

  it('handles an empty buffer', () => {
    const report = analyzeByteFrequency(new Uint8Array());
    expect(report.mostFrequentByte).toBeNull();
    expect(report.maxCount).toBe(0);
    expect(report.distinctByteValues).toBe(0);
  });
});
