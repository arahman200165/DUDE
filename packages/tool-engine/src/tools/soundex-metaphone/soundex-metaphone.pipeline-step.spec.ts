import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./soundex-metaphone.pipeline-step.js";

describe('soundex-metaphone pipeline step', () => {
  it('computes phonetic codes for bulk words', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Robert, Rupert' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'table') {
      expect(result.output.value.columns).toEqual(['Word', 'Soundex', 'Metaphone']);
      expect(result.output.value.rows).toHaveLength(2);
      expect(result.output.value.rows[0][0]).toBe('Robert');
    }
  });

  it('returns no rows for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['Word', 'Soundex', 'Metaphone'], rows: [] } } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Soundex / Metaphone expects text input.', kind: 'invalid-input' } });
  });
});
