import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./sql-formatter-tool.pipeline-step.js";

describe('sql-formatter-tool pipeline step', () => {
  it('pretty-prints a SQL statement', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'select a from t' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value.toUpperCase()).toContain('SELECT');
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter some SQL.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SQL Formatter / Minifier expects text input.', kind: 'invalid-input' } });
  });
});
