import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./yaml-json.pipeline-step.js";

describe('yaml-json pipeline step', () => {
  it('converts YAML text into a json value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: 1\nb:\n  - 2\n  - 3\n' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: 1, b: [2, 3] } } });
  });

  it('fails on malformed yaml', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: [1, 2\n' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'YAML <-> JSON Converter expects text input.', kind: 'invalid-input' },
    });
  });
});
