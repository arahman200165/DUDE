import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./resolution-calculator.pipeline-step.js";

describe('resolution-calculator pipeline step', () => {
  it('computes megapixels and aspect ratio for a custom resolution', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1000x1000' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '1.00 MP, aspect ratio 1:1' } });
  });

  it('names the matching preset for a well-known resolution', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1920x1080' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.value).toContain('Full HD (1080p)');
  });

  it('fails on text that is not in WIDTHxHEIGHT form', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a resolution' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Resolution Calculator expects text input.', kind: 'invalid-input' } });
  });
});
