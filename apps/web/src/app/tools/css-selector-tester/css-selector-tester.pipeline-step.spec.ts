import { describe, expect, it } from 'vitest';
import { pipelineStep } from './css-selector-tester.pipeline-step';

describe('css-selector-tester pipeline step', () => {
  it('matches elements in the fixed sample document', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '.item' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { matchCount: number } }).value;
      expect(value.matchCount).toBe(3);
    }
  });

  it('reports zero matches for a selector that matches nothing', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '.does-not-exist' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: { matchCount: number } }).value.matchCount).toBe(0);
    }
  });

  it('fails on an empty selector', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSS Selector Tester expects text input.', kind: 'invalid-input' } });
  });
});
