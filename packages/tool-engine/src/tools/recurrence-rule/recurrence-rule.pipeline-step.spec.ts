import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./recurrence-rule.pipeline-step.js";

describe('recurrence-rule pipeline step', () => {
  it('expands a valid RRULE into occurrences and human text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'FREQ=DAILY;COUNT=3' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('json');
    const value = result.output.value as { occurrences: readonly string[]; humanText: string };
    expect(value.occurrences).toHaveLength(3);
    expect(typeof value.humanText).toBe('string');
  });

  it('fails on a rule with no FREQ', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'COUNT=3' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Recurrence Rule Calculator expects text input.', kind: 'invalid-input' },
    });
  });
});
