import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./semver-comparator.pipeline-step.js";

describe('semver-comparator pipeline step', () => {
  it('sorts a newline-separated version list ascending, separating invalid lines', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '2.0.0\n1.0.0\nnope\n1.5.0' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: { valid: ['1.0.0', '1.5.0', '2.0.0'], invalid: ['nope'] } },
    });
  });

  it('returns empty valid/invalid lists for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { valid: [], invalid: [] } } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Semantic Version Comparator expects text input.', kind: 'invalid-input' },
    });
  });
});
