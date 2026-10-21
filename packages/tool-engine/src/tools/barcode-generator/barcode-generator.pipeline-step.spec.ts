import { describe, expect, it } from 'vitest';
import { pipelineStep } from './barcode-generator.pipeline-step.js';

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

describe('barcode-generator pipeline step (bwip-js engine)', () => {
  it('emits a self-contained black-on-white svg with no host dependency', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'DUDE-128' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const svg = atob((result.output as { value: { base64: string } }).value.base64);
      expect(svg).toContain('fill="#FFFFFF"');
      expect(svg).not.toContain('currentColor');
    }
  });

  it('reports a Code 128 encoder error as invalid input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'x'.repeat(5000) });
    expect(result.ok).toBe(false);
  });
});
