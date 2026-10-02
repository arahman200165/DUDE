import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./range-generator.pipeline-step.js";

describe('range-generator pipeline step', () => {
  it('generates a fixed 1-10 range, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ignored' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '1,2,3,4,5,6,7,8,9,10' } });
  });

  it('produces the same range regardless of input content', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '1,2,3,4,5,6,7,8,9,10' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Range Generator expects text input.', kind: 'invalid-input' } });
  });
});
