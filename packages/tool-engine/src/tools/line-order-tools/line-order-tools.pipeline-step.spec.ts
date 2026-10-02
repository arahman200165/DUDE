import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./line-order-tools.pipeline-step.js";

describe('line-order-tools pipeline step', () => {
  it('sorts lines ascending', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'banana\napple\ncherry' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'apple\nbanana\ncherry' } });
  });

  it('handles a single line', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'only' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'only' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Line Order Tools expects text input.', kind: 'invalid-input' } });
  });
});
