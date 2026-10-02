import { analyzeFileEntropy } from "./file-entropy-analyzer-logic.js";

describe('analyzeFileEntropy', () => {
  it('classifies a repetitive buffer as low entropy', () => {
    const report = analyzeFileEntropy(new Uint8Array(1024).fill(0x00));
    expect(report.verdict).toBe('low');
    expect(report.overallEntropy).toBeCloseTo(0, 5);
  });

  it('classifies a maximally varied buffer as high entropy', () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const report = analyzeFileEntropy(bytes);
    expect(report.verdict).toBe('high');
  });

  it('reports the byte length', () => {
    expect(analyzeFileEntropy(new Uint8Array(500)).byteLength).toBe(500);
  });

  it('produces a window per chunk at the given window size', () => {
    const report = analyzeFileEntropy(new Uint8Array(1000), 100);
    expect(report.windows).toHaveLength(10);
  });

  it('handles an empty buffer without throwing', () => {
    const report = analyzeFileEntropy(new Uint8Array());
    expect(report.overallEntropy).toBe(0);
    expect(report.windows).toEqual([]);
  });
});
