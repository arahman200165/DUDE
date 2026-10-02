import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./tailwind-color-matcher.pipeline-step.js";

describe('tailwind-color-matcher pipeline step', () => {
  it('finds the closest tailwind matches for a color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#3b82f6' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { matches: readonly { className: string }[] } }).value;
      expect(value.matches.length).toBeGreaterThan(0);
      expect(value.matches[0].className).toContain('-');
    }
  });

  it('ranks matches by ascending distance', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#000000' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { matches: readonly { distance: number }[] } }).value;
      for (let i = 1; i < value.matches.length; i++) {
        expect(value.matches[i].distance).toBeGreaterThanOrEqual(value.matches[i - 1].distance);
      }
    }
  });

  it('fails on an unrecognized color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Tailwind Color Matcher expects text input.', kind: 'invalid-input' } });
  });
});
