import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./base64-image-viewer.pipeline-step.js";

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('base64-image-viewer pipeline step', () => {
  it('normalizes a bare base64 payload into a data URI', async () => {
    const result = await pipelineStep.run({ type: 'text', value: ONE_PIXEL_PNG_BASE64 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toBe(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`);
    }
  });

  it('encodes file bytes into a data URI', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'pixel.png', mimeType: 'image/png', base64: ONE_PIXEL_PNG_BASE64 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toBe(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`);
    }
  });

  it('fails on bytes that do not match a known image signature', async () => {
    const result = await pipelineStep.run({ type: 'text', value: btoa('hello world') });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Base64 Image Viewer expects text or file input.', kind: 'invalid-input' } });
  });
});
