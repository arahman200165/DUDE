import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./css-specificity-calculator.pipeline-step.js";

describe('css-specificity-calculator pipeline step', () => {
  it('scores a single selector', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#id .class' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { ranked: readonly { result: { ok: boolean } }[] } }).value;
      expect(value.ranked).toHaveLength(1);
      expect(value.ranked[0].result.ok).toBe(true);
    }
  });

  it('ranks a comma-separated selector list, most specific first', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'div, #id' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { ranked: readonly { rank?: number }[] } }).value;
      expect(value.ranked).toHaveLength(2);
      expect(value.ranked[1].rank).toBe(1);
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSS Specificity Calculator expects text input.', kind: 'invalid-input' } });
  });
});
