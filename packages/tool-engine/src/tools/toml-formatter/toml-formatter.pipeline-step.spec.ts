import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./toml-formatter.pipeline-step.js";

describe('toml-formatter pipeline step', () => {
  it('formats valid TOML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'name = "test"\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'name = "test"\n' } });
  });

  it('fails on invalid TOML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'name = ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'TOML Formatter / Validator expects text input.', kind: 'invalid-input' } });
  });
});
