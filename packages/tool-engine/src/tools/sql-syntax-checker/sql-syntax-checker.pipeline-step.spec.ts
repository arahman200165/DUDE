import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./sql-syntax-checker.pipeline-step.js";

describe('sql-syntax-checker pipeline step', () => {
  it('reports valid SQL as valid', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'SELECT * FROM t' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Valid SQL.' } });
  });

  it('reports a syntax error for malformed SQL', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'SELECT * FROM' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toContain('Syntax error:');
  });

  it('reports empty input as an error', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Syntax error: Enter some SQL.' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SQL Syntax Checker expects text input.', kind: 'invalid-input' } });
  });
});
