import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./week-number-calculator.pipeline-step.js";

describe('week-number-calculator pipeline step', () => {
  it('converts a date to its ISO week info', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '2024-01-01' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output).toEqual({
      type: 'json',
      value: {
        weekYear: 2024,
        weekNumber: 1,
        weekday: 1,
        weekdayName: 'Monday',
        weeksInWeekYear: 52,
        isoWeekLabel: '2024-W01',
      },
    });
  });

  it('fails on an invalid date', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-date' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Week Number Calculator expects text input.', kind: 'invalid-input' },
    });
  });
});
