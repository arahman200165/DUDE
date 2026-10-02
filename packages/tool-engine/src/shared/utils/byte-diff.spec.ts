import { computeByteDiff, looksLikeText } from "./byte-diff.js";

describe('computeByteDiff', () => {
  it('marks identical chunks as equal', () => {
    const left = new Uint8Array([1, 2, 3, 4]);
    const right = new Uint8Array([1, 2, 3, 4]);
    const chunks = computeByteDiff(left, right, 16);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].equal).toBe(true);
  });

  it('marks differing chunks as not equal', () => {
    const left = new Uint8Array([1, 2, 3, 4]);
    const right = new Uint8Array([1, 2, 9, 4]);
    const chunks = computeByteDiff(left, right, 16);
    expect(chunks[0].equal).toBe(false);
  });

  it('handles a right side longer than the left', () => {
    const left = new Uint8Array([1, 2]);
    const right = new Uint8Array(Array.from({ length: 20 }, (_, i) => i));
    const chunks = computeByteDiff(left, right, 16);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].equal).toBe(false);
    expect(chunks[1].leftBytes).toBeNull();
  });

  it('splits into multiple chunks of the given size', () => {
    const left = new Uint8Array(32);
    const right = new Uint8Array(32);
    const chunks = computeByteDiff(left, right, 16);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].offset).toBe(0);
    expect(chunks[1].offset).toBe(16);
  });

  it('returns no chunks for two empty buffers', () => {
    expect(computeByteDiff(new Uint8Array(), new Uint8Array())).toEqual([]);
  });
});

describe('looksLikeText', () => {
  it('treats plain ASCII text as text', () => {
    expect(looksLikeText(new TextEncoder().encode('hello world'))).toBe(true);
  });

  it('treats a buffer with a NUL byte as binary', () => {
    expect(looksLikeText(new Uint8Array([104, 105, 0, 106]))).toBe(false);
  });

  it('only samples the given prefix length', () => {
    const bytes = new Uint8Array(20000);
    bytes[15000] = 0; // outside the default 8000-byte sample
    expect(looksLikeText(bytes.fill(65, 0, 8000))).toBe(true);
  });
});
