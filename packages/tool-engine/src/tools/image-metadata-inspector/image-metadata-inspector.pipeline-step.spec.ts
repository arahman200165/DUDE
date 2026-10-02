import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./image-metadata-inspector.pipeline-step.js";

// A 1x1 PNG. `createImageBitmap` is not implemented in this repo's jsdom test environment, so
// width/height fall back to "unavailable" — but the PNG signature, IHDR bytes, and file size
// are read directly from bytes and are fully verifiable here.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('image-metadata-inspector pipeline step', () => {
  it('detects a PNG and reads its IHDR chunk', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'pixel.png', mimeType: 'image/png', base64: ONE_PIXEL_PNG_BASE64 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { detectedMime: string | null; pngIhdr: { width: number; height: number } | null } }).value;
      expect(value.detectedMime).toBe('image/png');
      expect(value.pngIhdr?.width).toBe(1);
      expect(value.pngIhdr?.height).toBe(1);
    }
  });

  it('reports the decoded file size', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'pixel.png', mimeType: 'image/png', base64: ONE_PIXEL_PNG_BASE64 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: { fileSize: number } }).value.fileSize).toBeGreaterThan(0);
    }
  });

  it('fails on invalid Base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: 'not-base64!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Image Metadata Inspector expects file input.', kind: 'invalid-input' } });
  });
});
