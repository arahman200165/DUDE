import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./statistics-calculator.pipeline-step.js";

describe('statistics-calculator pipeline step', () => {
  it('computes summary statistics for a list of numbers', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1, 2, 3, 4, 5' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: {
          count: 5,
          sum: 15,
          mean: 3,
          median: 3,
          mode: [1, 2, 3, 4, 5],
          min: 1,
          max: 5,
          range: 4,
          variancePopulation: 2,
          varianceSample: 2.5,
          stdDevPopulation: Math.sqrt(2),
          stdDevSample: Math.sqrt(2.5),
          q1: 2,
          q3: 4,
          iqr: 2,
        },
      },
    });
  });

  it('fails on non-numeric input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a, b, c' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Statistics Calculator expects text input.', kind: 'invalid-input' } });
  });
});
