import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./duration-formatter.pipeline-step.js";

describe('duration-formatter pipeline step', () => {
  it('parses a human-shorthand duration into every representation', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1d 2h' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output).toEqual({
      type: 'json',
      value: {
        ms: 26 * 60 * 60 * 1000,
        human: expect.any(String),
        iso8601: 'P1DT2H',
        breakdown: { days: 1, hours: 2, minutes: 0, seconds: 0, milliseconds: 0 },
      },
    });
  });

  it('parses an ISO 8601 duration', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'PT1H30M' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { ms: number }).ms).toBe(90 * 60 * 1000);
  });

  it('fails on an empty string', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Duration Parser / Formatter expects text input.', kind: 'invalid-input' },
    });
  });
});
