import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-pivot.pipeline-step.js";

describe('csv-pivot pipeline step', () => {
  it('pivots using the first column as row key, second as column key, last as value, counted', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'region,quarter,amount\nEast,Q1,10\nEast,Q2,20\nWest,Q1,5\n' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['region', 'Q1', 'Q2'], rows: [['East', '1', '1'], ['West', '1', '']] } },
    });
  });

  it('fails on a CSV with no header row', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV Pivot expects text input.', kind: 'invalid-input' } });
  });
});
