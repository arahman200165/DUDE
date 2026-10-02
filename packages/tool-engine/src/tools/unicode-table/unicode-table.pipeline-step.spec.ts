import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./unicode-table.pipeline-step.js";

describe('unicode-table pipeline step', () => {
  it('finds an exact code point match', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'U+0041' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'table') {
      expect(result.output.value.rows).toHaveLength(1);
      expect(result.output.value.rows[0][0]).toBe('U+0041');
      expect(result.output.value.rows[0][1]).toBe('A');
    }
  });

  it('returns no rows for a query with no matches', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'zzzzzznonexistentname' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'table') {
      expect(result.output.value.rows).toHaveLength(0);
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Unicode Table expects text input.', kind: 'invalid-input' } });
  });
});
