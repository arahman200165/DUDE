import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./programmer-calculator.pipeline-step.js";

describe('programmer-calculator pipeline step', () => {
  it('computes the 32-bit bitwise NOT of a decimal operand', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '0' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '0xffffffff' } });
  });

  it('computes the 32-bit bitwise NOT of a hex operand', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '0xFF' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '0xffffff00' } });
  });

  it('fails on unparsable input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Programmer Calculator expects text input.', kind: 'invalid-input' } });
  });
});
