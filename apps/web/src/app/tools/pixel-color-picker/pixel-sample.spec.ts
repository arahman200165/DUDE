import { describe, expect, it } from 'vitest';
import { samplePixel } from './pixel-sample';

function makeImageData(width: number, height: number, fill: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('samplePixel', () => {
  it('reads the RGBA value at a given coordinate', () => {
    const imageData = makeImageData(4, 4, [10, 20, 30, 255]);
    expect(samplePixel(imageData, 1, 1)).toEqual({ r: 10, g: 20, b: 30, a: 255 });
  });

  it('returns null for out-of-bounds coordinates', () => {
    const imageData = makeImageData(4, 4, [0, 0, 0, 255]);
    expect(samplePixel(imageData, -1, 0)).toBeNull();
    expect(samplePixel(imageData, 4, 0)).toBeNull();
    expect(samplePixel(imageData, 0, 4)).toBeNull();
  });

  it('floors fractional coordinates', () => {
    const imageData = makeImageData(4, 4, [5, 6, 7, 255]);
    expect(samplePixel(imageData, 1.9, 1.2)).toEqual({ r: 5, g: 6, b: 7, a: 255 });
  });
});
