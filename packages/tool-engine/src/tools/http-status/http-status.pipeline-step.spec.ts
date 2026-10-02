import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./http-status.pipeline-step.js";

describe('http-status pipeline step', () => {
  it('looks up a status code and returns matching groups as json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '404' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const groups = result.output.value as { category: string; entries: { code: number }[] }[];
      expect(groups.flatMap((g) => g.entries.map((e) => e.code))).toContain(404);
    }
  });

  it('returns every code grouped when the filter is empty', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const groups = result.output.value as { entries: unknown[] }[];
      expect(groups.length).toBeGreaterThan(0);
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'HTTP Status Code Reference expects text input.', kind: 'invalid-input' },
    });
  });
});
