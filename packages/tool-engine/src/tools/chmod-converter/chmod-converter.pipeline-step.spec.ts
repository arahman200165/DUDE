import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./chmod-converter.pipeline-step.js";

describe('chmod-converter pipeline step', () => {
  it('converts octal input to symbolic', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '754' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'rwxr-xr--' } });
  });

  it('converts symbolic input to octal', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'rwxr-xr-x' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '755' } });
  });

  it('round-trips a 4-digit octal value with the setuid bit', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '4755' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'rwsr-xr-x' } });
  });

  it('fails on malformed input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a permission string' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'chmod Converter expects text input.', kind: 'invalid-input' } });
  });
});
