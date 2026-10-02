import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-sql.pipeline-step.js";

describe('csv-sql pipeline step', () => {
  it('converts CSV to SQL INSERT statements', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a,b\n1,hello\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: "INSERT INTO table (a, b) VALUES (1, 'hello');" } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV ↔ SQL Converter expects text input.', kind: 'invalid-input' } });
  });
});
