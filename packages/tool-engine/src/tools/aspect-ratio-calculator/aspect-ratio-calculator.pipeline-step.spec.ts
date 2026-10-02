import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./aspect-ratio-calculator.pipeline-step.js";

describe('aspect-ratio-calculator pipeline step', () => {
  it('simplifies 1920x1080 to 16:9', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1920x1080' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '16:9' } });
  });

  it('accepts an "x" separator with surrounding whitespace and either case', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '3840 X 2160' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '16:9' } });
  });

  it('fails on text that is not in WIDTHxHEIGHT form', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not dimensions' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Aspect Ratio Calculator expects text input.', kind: 'invalid-input' } });
  });
});
