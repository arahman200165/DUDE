import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./contrast-checker.pipeline-step.js";

describe('contrast-checker pipeline step', () => {
  it('checks the piped foreground color against a white background', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#0f172a' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { ratio: number; compliance: { aaNormalText: boolean } } }).value;
      expect(value.ratio).toBeGreaterThan(4.5);
      expect(value.compliance.aaNormalText).toBe(true);
    }
  });

  it('reports low contrast for near-white foreground on white', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#fefefe' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { compliance: { aaNormalText: boolean } } }).value;
      expect(value.compliance.aaNormalText).toBe(false);
    }
  });

  it('fails on an unrecognized color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-color' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Contrast Checker expects text input.', kind: 'invalid-input' } });
  });
});
