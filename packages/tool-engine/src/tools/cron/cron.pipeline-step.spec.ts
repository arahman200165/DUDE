import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cron.pipeline-step.js";

describe('cron pipeline step', () => {
  it('parses a cron expression into a description and next/previous runs', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '0 0 * * *' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { description: string; nextRuns: unknown[]; previousRuns: unknown[] };
      expect(typeof value.description).toBe('string');
      expect(value.nextRuns).toHaveLength(5);
      expect(value.previousRuns).toHaveLength(5);
    }
  });

  it('fails on an invalid cron expression', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a cron expression' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Cron Expression Parser expects text input.', kind: 'invalid-input' },
    });
  });
});
