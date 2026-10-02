import { describe, expect, it } from 'vitest';
import { pipelineStep } from './color-blindness-simulator.pipeline-step';

// A 1x1 transparent PNG, base64-encoded — enough to exercise the decode path without a real
// photographic image. `createImageBitmap`/`canvas.getContext('2d')` are not implemented in this
// repo's jsdom test environment (no `canvas` npm package installed), so this can only verify
// input validation and that the step never throws — not the actual pixel transform, which needs
// a real browser to exercise.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('color-blindness-simulator pipeline step', () => {
  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Color Blindness Simulator expects file input.', kind: 'invalid-input' } });
  });

  it('never throws even when the decoded bytes are not a real image', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: 'aGVsbG8=' } });
    expect(result.ok).toBe(false);
  });

  it('reports invalid Base64 as an error result rather than throwing', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x.png', mimeType: 'image/png', base64: 'not-base64!!' } });
    expect(result.ok).toBe(false);
  });

  it('does not throw when given a well-formed 1x1 PNG (jsdom cannot decode it, but the step must still resolve)', async () => {
    await expect(
      pipelineStep.run({ type: 'file', value: { name: 'pixel.png', mimeType: 'image/png', base64: ONE_PIXEL_PNG_BASE64 } }),
    ).resolves.toBeDefined();
  });
});
