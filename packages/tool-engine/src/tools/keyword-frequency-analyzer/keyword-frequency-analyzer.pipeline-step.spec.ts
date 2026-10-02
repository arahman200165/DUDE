import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./keyword-frequency-analyzer.pipeline-step.js";

describe('keyword-frequency-analyzer pipeline step', () => {
  it('counts word frequency, ignoring stop words and short words', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'the cat sat on the cat mat' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['Word', 'Count'], rows: [['cat', 2], ['mat', 1], ['sat', 1]] } },
    });
  });

  it('returns no rows for text with only stop words and short words', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a an on' });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['Word', 'Count'], rows: [] } } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Keyword Frequency Analyzer expects text input.', kind: 'invalid-input' } });
  });
});
