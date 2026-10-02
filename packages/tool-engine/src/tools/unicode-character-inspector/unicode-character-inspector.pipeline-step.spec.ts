import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./unicode-character-inspector.pipeline-step.js";

describe('unicode-character-inspector pipeline step', () => {
  it('analyzes each character of the input text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'A' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { entries: { char: string; codePointDecimal: number }[]; totalCount: number };
      expect(value.totalCount).toBe(1);
      expect(value.entries[0].char).toBe('A');
      expect(value.entries[0].codePointDecimal).toBe(65);
    }
  });

  it('handles empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      expect((result.output.value as { totalCount: number }).totalCount).toBe(0);
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Unicode Character Inspector expects text input.', kind: 'invalid-input' } });
  });
});
