import { describe, expect, it } from 'vitest';
import { pipelineStep } from './barcode-generator.pipeline-step';

describe('barcode-generator pipeline step', () => {
  it('generates an SVG barcode file for a valid value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '123456789012' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.type).toBe('file');
      const value = (result.output as { value: { mimeType: string; base64: string } }).value;
      expect(value.mimeType).toBe('image/svg+xml');
      expect(atob(value.base64)).toContain('<svg');
    }
  });

  it('fails on an empty value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Barcode Generator expects text input.', kind: 'invalid-input' } });
  });
});
