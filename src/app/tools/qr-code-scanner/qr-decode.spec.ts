import { describe, expect, it } from 'vitest';
import { decodeQrFromImageData } from './qr-decode';

function blankImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('decodeQrFromImageData', () => {
  it('returns null for image data with no QR code present', () => {
    expect(decodeQrFromImageData(blankImageData(64, 64))).toBeNull();
  });

  it('returns null for noisy image data with no valid QR structure', () => {
    // DUDE_PRD.md §21 Phase 23 Item 11 (deterministic test fixtures) -- Math.random() noise here
    // was, in principle, capable of coincidentally forming valid QR structure and flaking; a
    // fixed pseudo-random sequence is just as "noisy" for this test's purpose but reproducible.
    const data = new Uint8ClampedArray(64 * 64 * 4);
    let state = 0x2545f491;
    for (let i = 0; i < data.length; i += 1) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      data[i] = state % 256;
    }
    expect(decodeQrFromImageData({ data, width: 64, height: 64, colorSpace: 'srgb' } as ImageData)).toBeNull();
  });
});
