import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { pipelineStep } from './qr-code-scanner.pipeline-step';

/**
 * Rasterizes real QR module data (via `qrcode`'s canvas-free `create()`) into an `ImageData`-shaped
 * buffer, so this spec exercises the adapter's real decode path (via `jsqr`) with genuinely
 * scannable pixel data — no `<canvas>` needed to produce it, and no mocking of `./qr-decode`
 * itself (this project's Angular unit-test builder disallows `vi.mock` on relative imports).
 */
function renderQrImageData(text: string): ImageData {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const modules = qr.modules.data;
  const scale = 4;
  const margin = 4;
  const dim = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y * size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = (((y + margin) * scale + dy) * dim + ((x + margin) * scale + dx)) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }
  }

  return { data, width: dim, height: dim, colorSpace: 'srgb' } as ImageData;
}

// This project's test environment has no `canvas` npm package installed, so jsdom's real
// `HTMLCanvasElement.getContext('2d')` returns null and `createImageBitmap` is unavailable. This
// spec mocks only those two raster-extraction browser primitives — never the decode logic — so
// the adapter's real orchestration (bytes -> bitmap -> canvas -> ImageData -> jsqr -> output)
// still runs against genuine pixel data.
let currentImageData: ImageData;

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: currentImageData.width, height: currentImageData.height, close: () => {} }) as unknown as ImageBitmap),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => {},
    getImageData: () => currentImageData,
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('qr-code-scanner pipeline step', () => {
  it('decodes a QR code found in the image', async () => {
    currentImageData = renderQrImageData('https://example.com');

    const result = await pipelineStep.run({ type: 'file', value: { name: 'qr.png', mimeType: 'image/png', base64: btoa('fake') } });

    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'https://example.com' } });
  });

  it('fails when no QR code is found in the image', async () => {
    currentImageData = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64, colorSpace: 'srgb' } as ImageData;

    const result = await pipelineStep.run({ type: 'file', value: { name: 'blank.png', mimeType: 'image/png', base64: btoa('fake') } });

    expect(result).toEqual({ ok: false, error: { message: 'No QR code found in this image.', kind: 'invalid-input' } });
  });

  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello' });
    expect(result).toEqual({ ok: false, error: { message: 'QR Code Scanner expects file input.', kind: 'invalid-input' } });
  });

  it('fails on invalid Base64 file content', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: '***not base64***' } });
    expect(result).toEqual({ ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } });
  });
});
