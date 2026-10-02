import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./number-theory-toolkit.pipeline-step.js";

describe('number-theory-toolkit pipeline step', () => {
  it('computes the GCD of a comma-separated list of integers', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '12, 18, 24' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '6' } });
  });

  it('computes the GCD of a whitespace-separated list of integers', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '9 27' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '9' } });
  });

  it('fails on a non-integer token', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '12, abc' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Number Theory Toolkit expects text input.', kind: 'invalid-input' } });
  });
});
