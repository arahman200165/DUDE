import { describe, expect, it } from 'vitest';
import { pipelineStep } from './svg-viewer.pipeline-step';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

describe('svg-viewer pipeline step', () => {
  it('pretty-prints SVG text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: SVG });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('\n  <rect');
    }
  });

  it('decodes and formats a file input', async () => {
    const base64 = btoa(SVG);
    const result = await pipelineStep.run({ type: 'file', value: { name: 'icon.svg', mimeType: 'image/svg+xml', base64 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('<rect');
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SVG Viewer expects text or file input.', kind: 'invalid-input' } });
  });
});
