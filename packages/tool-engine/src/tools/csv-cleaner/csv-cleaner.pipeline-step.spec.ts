import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-cleaner.pipeline-step.js";

describe('csv-cleaner pipeline step', () => {
  it('trims cells and drops empty rows', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a,b\n 1 , 2 \n\n3,4\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'a,b\n1,2\n3,4' } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV Cleaner expects text input.', kind: 'invalid-input' } });
  });
});
