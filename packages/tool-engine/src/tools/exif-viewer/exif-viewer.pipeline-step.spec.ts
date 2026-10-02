import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./exif-viewer.pipeline-step.js";

// exifr also reads a PNG's own header chunk as "tags" (ImageWidth/BitDepth/...), so this 1x1 PNG
// gives a genuine non-empty result without needing a real JPEG+EXIF fixture.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('exif-viewer pipeline step', () => {
  it('extracts tags as a key/value table', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'pixel.png', mimeType: 'image/png', base64: ONE_PIXEL_PNG_BASE64 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { columns: readonly string[]; rows: readonly (readonly unknown[])[] } }).value;
      expect(value.columns).toEqual(['key', 'value']);
      expect(value.rows.some(([key]) => key === 'ImageWidth')).toBe(true);
    }
  });

  it('reports an execution error for bytes that are not a recognizable image', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.bin', mimeType: 'application/octet-stream', base64: btoa('not an image') } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('execution-error');
    }
  });

  it('fails on invalid Base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: 'not-base64!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'EXIF Viewer expects file input.', kind: 'invalid-input' } });
  });
});
