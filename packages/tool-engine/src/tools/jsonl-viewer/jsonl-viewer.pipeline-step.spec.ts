import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./jsonl-viewer.pipeline-step.js";

describe('jsonl-viewer pipeline step', () => {
  it('parses NDJSON text into a table', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"a":1,"b":2}\n{"a":3,"b":4}' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']] } },
    });
  });

  it('fails on a line that is not valid JSON', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"a":1}\nnot json' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'JSON Lines / NDJSON Viewer expects text input.', kind: 'invalid-input' } });
  });
});
