import { describe, expect, it } from 'vitest';
import { createTar, extractTar } from "./archive-tool-tar.js";

describe('createTar / extractTar', () => {
  it('round-trips multiple entries of different sizes', () => {
    const entries = [
      { name: 'a.txt', data: new TextEncoder().encode('short') },
      { name: 'b.txt', data: new Uint8Array(1000).fill(65) }, // spans multiple 512-byte blocks
    ];

    const result = createTar(entries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bytes.length % 512).toBe(0);

    const extracted = extractTar(result.bytes);
    expect(extracted).toHaveLength(2);
    expect(new TextDecoder().decode(extracted[0].data)).toBe('short');
    expect(extracted[0].name).toBe('a.txt');
    expect(extracted[1].data.length).toBe(1000);
  });

  it('rejects a name longer than the 100-byte USTAR limit', () => {
    const result = createTar([{ name: 'x'.repeat(101), data: new Uint8Array(0) }]);
    expect(result.ok).toBe(false);
  });

  it('produces a valid empty archive (just the end-of-archive marker)', () => {
    const result = createTar([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(extractTar(result.bytes)).toEqual([]);
    }
  });
});
