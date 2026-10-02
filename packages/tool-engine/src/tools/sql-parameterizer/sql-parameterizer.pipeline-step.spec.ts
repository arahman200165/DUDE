import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./sql-parameterizer.pipeline-step.js";

describe('sql-parameterizer pipeline step', () => {
  it('replaces literal values with ? placeholders and extracts them', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'SELECT * FROM t WHERE x = 1' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { sql: string; values: readonly unknown[] };
      expect(value.sql).toContain('?');
      expect(value.values).toEqual([1]);
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter some SQL.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SQL Parameterizer expects text input.', kind: 'invalid-input' } });
  });
});
