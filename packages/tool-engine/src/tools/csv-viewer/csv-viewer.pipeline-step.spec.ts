import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-viewer.pipeline-step.js";

describe('csv-viewer pipeline step', () => {
  it('parses csv text with a header row into a table value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'name,age\nAlice,30\nBob,25' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['name', 'age'], rows: [['Alice', '30'], ['Bob', '25']] } },
    });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV Viewer expects text input.', kind: 'invalid-input' } });
  });
});
