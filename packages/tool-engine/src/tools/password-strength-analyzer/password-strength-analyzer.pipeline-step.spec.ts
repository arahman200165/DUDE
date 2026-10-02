import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./password-strength-analyzer.pipeline-step.js";

describe('password-strength-analyzer pipeline step', () => {
  it('analyzes a weak, common password', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'password' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('json');
    expect((result.output.value as { verdict: string }).verdict).toBe('very-weak');
  });

  it('analyzes a longer, more random password as stronger', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Tr0ub4dor&3xtraLong!' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const value = result.output.value as { verdict: string };
    expect(['fair', 'good', 'strong']).toContain(value.verdict);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Password Strength Analyzer expects text input.', kind: 'invalid-input' },
    });
  });
});
