import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./mime-types.pipeline-step.js";

describe('mime-types pipeline step', () => {
  it('looks up a mime type by extension and returns matches as json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'json' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { rows: { type: string }[] };
      expect(value.rows.some((r) => r.type === 'application/json')).toBe(true);
    }
  });

  it('returns every type when the filter is empty', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { totalMatches: number };
      expect(value.totalMatches).toBeGreaterThan(0);
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'MIME Type Reference expects text input.', kind: 'invalid-input' } });
  });
});
