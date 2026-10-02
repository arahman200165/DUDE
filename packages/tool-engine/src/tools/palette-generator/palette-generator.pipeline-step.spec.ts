import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./palette-generator.pipeline-step.js";

describe('palette-generator pipeline step', () => {
  it('generates a complementary palette from a base color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#3b82f6' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { colors: readonly string[] } }).value;
      expect(value.colors).toHaveLength(2);
      expect(value.colors[0].toLowerCase()).toBe('#3b82f6');
    }
  });

  it('fails on an unrecognized color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-color' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Palette Generator expects text input.', kind: 'invalid-input' } });
  });
});
