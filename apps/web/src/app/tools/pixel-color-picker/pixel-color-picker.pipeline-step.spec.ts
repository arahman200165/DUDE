import { describe, expect, it } from 'vitest';
import { pipelineStep } from './pixel-color-picker.pipeline-step';

// `createImageBitmap`/`canvas.getContext('2d')` are not implemented in this repo's jsdom test
// environment (no `canvas` npm package installed), so this can only verify input validation and
// that the step never throws — not the actual pixel sampling, which needs a real browser.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('pixel-color-picker pipeline step', () => {
  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Pixel Color Picker expects file input.', kind: 'invalid-input' } });
  });

  it('reports invalid Base64 as an error result rather than throwing', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: 'not-base64!!' } });
    expect(result.ok).toBe(false);
  });

  it('never throws even when the decoded bytes are not a real image', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: 'aGVsbG8=' } });
    expect(result.ok).toBe(false);
  });

  it('does not throw when given a well-formed 1x1 PNG (jsdom cannot decode it, but the step must still resolve)', async () => {
    await expect(
      pipelineStep.run({ type: 'file', value: { name: 'pixel.png', mimeType: 'image/png', base64: ONE_PIXEL_PNG_BASE64 } }),
    ).resolves.toBeDefined();
  });
});
