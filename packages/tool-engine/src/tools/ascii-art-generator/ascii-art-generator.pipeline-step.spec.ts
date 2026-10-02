import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ascii-art-generator.pipeline-step.js";

describe('ascii-art-generator pipeline step', () => {
  it('renders text as ascii art banner', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Hi' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'text') {
      expect(result.output.value.length).toBeGreaterThan(0);
      expect(result.output.value).toContain('\n');
    }
  });

  it('returns empty output for blank input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'ASCII Art Generator expects text input.', kind: 'invalid-input' } });
  });
});
