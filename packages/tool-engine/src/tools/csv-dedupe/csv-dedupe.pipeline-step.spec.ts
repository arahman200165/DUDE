import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-dedupe.pipeline-step.js";

describe('csv-dedupe pipeline step', () => {
  it('removes duplicate rows across all columns', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a,b\n1,2\n1,2\n3,4\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'a,b\n1,2\n3,4' } });
  });

  it('fails on a CSV with no header row', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV Deduplicator expects text input.', kind: 'invalid-input' } });
  });
});
