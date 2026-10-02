import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./invisible-char-scanner.pipeline-step.js";

describe('invisible-char-scanner pipeline step', () => {
  it('finds a zero-width space in the input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a​b' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const occurrences = result.output.value as { position: number; kind: string }[];
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({ position: 1, kind: 'zero-width' });
    }
  });

  it('returns an empty list for clean text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'clean text' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Invisible Char Scanner expects text input.', kind: 'invalid-input' } });
  });
});
