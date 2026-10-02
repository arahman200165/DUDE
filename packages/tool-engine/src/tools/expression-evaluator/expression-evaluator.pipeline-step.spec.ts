import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./expression-evaluator.pipeline-step.js";

describe('expression-evaluator pipeline step', () => {
  it('evaluates an arithmetic expression', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '2 + 3 * 4' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '14' } });
  });

  it('fails on an expression referencing an unknown variable', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'x + 1' });
    expect(result.ok).toBe(false);
  });

  it('fails on an empty expression', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter an expression.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Expression Evaluator expects text input.', kind: 'invalid-input' } });
  });
});
