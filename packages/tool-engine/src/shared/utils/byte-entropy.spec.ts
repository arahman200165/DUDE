import { byteHistogram, classifyEntropy, shannonEntropy, slidingWindowEntropy } from "./byte-entropy.js";

describe('byteHistogram', () => {
  it('counts occurrences of each byte value', () => {
    const histogram = byteHistogram(new Uint8Array([0x00, 0x00, 0xff, 0x41]));
    expect(histogram[0x00]).toBe(2);
    expect(histogram[0xff]).toBe(1);
    expect(histogram[0x41]).toBe(1);
    expect(histogram.length).toBe(256);
  });

  it('returns an all-zero histogram for an empty buffer', () => {
    const histogram = byteHistogram(new Uint8Array());
    expect(histogram.every((count) => count === 0)).toBe(true);
  });
});

describe('shannonEntropy', () => {
  it('returns 0 for an empty buffer', () => {
    expect(shannonEntropy(new Uint8Array())).toBe(0);
  });

  it('returns 0 for a buffer of a single repeated byte', () => {
    expect(shannonEntropy(new Uint8Array(100).fill(0x41))).toBe(0);
  });

  it('returns 1 for a buffer of exactly two equally-frequent byte values', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01]);
    expect(shannonEntropy(bytes)).toBeCloseTo(1, 10);
  });

  it('returns close to 8 for uniformly distributed random-looking bytes', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(shannonEntropy(bytes)).toBeCloseTo(8, 10);
  });

  it('reports higher entropy for more varied data than for repetitive data', () => {
    const repetitive = new Uint8Array(64).fill(0x00);
    const varied = new Uint8Array(64);
    for (let i = 0; i < 64; i++) varied[i] = i * 4;
    expect(shannonEntropy(varied)).toBeGreaterThan(shannonEntropy(repetitive));
  });
});

describe('slidingWindowEntropy', () => {
  it('splits input into fixed-size windows', () => {
    const bytes = new Uint8Array(10);
    const windows = slidingWindowEntropy(bytes, 4);
    expect(windows).toHaveLength(3);
    expect(windows.map((w) => w.length)).toEqual([4, 4, 2]);
    expect(windows.map((w) => w.offset)).toEqual([0, 4, 8]);
  });

  it('returns an empty array for empty input', () => {
    expect(slidingWindowEntropy(new Uint8Array(), 16)).toEqual([]);
  });

  it('throws for a non-positive window size', () => {
    expect(() => slidingWindowEntropy(new Uint8Array(10), 0)).toThrow();
  });
});

describe('classifyEntropy', () => {
  it('classifies near-zero entropy as low', () => {
    expect(classifyEntropy(0.5)).toBe('low');
  });

  it('classifies mid-range entropy as medium', () => {
    expect(classifyEntropy(6)).toBe('medium');
  });

  it('classifies near-ceiling entropy as high', () => {
    expect(classifyEntropy(7.9)).toBe('high');
  });
});
