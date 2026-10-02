import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./border-radius-generator.pipeline-step.js";

describe('border-radius-generator pipeline step', () => {
  it('applies the piped number uniformly to all corners', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '24' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'border-radius: 24px;' } });
  });

  it('falls back to the default radius on non-numeric input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-number' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'border-radius: 16px;' } });
  });

  it('falls back to the default radius on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '  ' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'border-radius: 16px;' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Border Radius Generator expects text input.', kind: 'invalid-input' } });
  });
});
