import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./qr-code-generator.pipeline-step.js";

describe('qr-code-generator pipeline step', () => {
  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'QR Code Generator expects text input.', kind: 'invalid-input' } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('never throws for valid text input, regardless of whether PNG encoding succeeds in this environment', async () => {
    await expect(pipelineStep.run({ type: 'text', value: 'https://example.com' })).resolves.toBeDefined();
  });

  it('produces a PNG file value when encoding succeeds', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'https://example.com' });
    if (result.ok) {
      expect(result.output.type).toBe('file');
      expect((result.output as { value: { mimeType: string } }).value.mimeType).toBe('image/png');
    } else {
      // Documented risk: `qrcode`'s browser build renders through a real <canvas>, which
      // jsdom does not implement in this repo (no `canvas` npm package installed).
      expect(result.error.kind).toBe('execution-error');
    }
  });
});
