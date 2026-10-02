import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./duplicate-finder.pipeline-step.js";

describe('duplicate-finder pipeline step', () => {
  it('finds duplicate lines', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a\nb\na\nc\nb\na' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: [{ value: 'a', count: 3, firstLineNumber: 1 }, { value: 'b', count: 2, firstLineNumber: 2 }] },
    });
  });

  it('returns an empty list when there are no duplicates', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a\nb\nc' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Duplicate Finder expects text input.', kind: 'invalid-input' } });
  });
});
