import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./sql-dialect-converter.pipeline-step.js";

describe('sql-dialect-converter pipeline step', () => {
  it('converts a PostgreSQL statement to MySQL syntax', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'SELECT * FROM t LIMIT 10' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && typeof result.output.value).toBe('string');
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter some SQL.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SQL Dialect Converter expects text input.', kind: 'invalid-input' } });
  });
});
