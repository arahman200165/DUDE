import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./sql-query-explainer.pipeline-step.js";

describe('sql-query-explainer pipeline step', () => {
  it('explains a simple SELECT statement', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'SELECT a FROM t1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.type).toBe('text');
      expect((result.output as { type: 'text'; value: string }).value).toContain('Selects: a.');
    }
  });

  it('fails on invalid SQL', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not sql at all (((' });
    expect(result.ok).toBe(false);
  });

  it('fails on a non-SELECT statement', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'DELETE FROM t1' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SQL Query Explainer expects text input.', kind: 'invalid-input' } });
  });
});
