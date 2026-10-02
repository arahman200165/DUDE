import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./bigint-calculator.pipeline-step.js";

describe('bigint-calculator pipeline step', () => {
  it('computes the factorial of a parsed operand', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '5' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '120' } });
  });

  it('supports a hex-prefixed operand', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '0x4' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '24' } });
  });

  it('fails on a negative operand', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '-1' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Arbitrary Precision Calculator expects text input.', kind: 'invalid-input' } });
  });
});
