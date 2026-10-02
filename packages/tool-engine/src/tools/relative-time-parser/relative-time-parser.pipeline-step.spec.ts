import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./relative-time-parser.pipeline-step.js";

describe('relative-time-parser pipeline step', () => {
  it('parses a relative expression into an ISO timestamp', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '3 days ago' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('text');
    expect(new Date(result.output.value as string).toString()).not.toBe('Invalid Date');
  });

  it('fails on unparseable text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'zzzzzz not a date zzzzzz' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Relative Time Parser expects text input.', kind: 'invalid-input' },
    });
  });
});
