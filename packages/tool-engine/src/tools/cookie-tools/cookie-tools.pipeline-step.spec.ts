import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cookie-tools.pipeline-step.js";

describe('cookie-tools pipeline step', () => {
  it('splits a Cookie header into name/value pairs', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'session=abc123; theme=dark' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: [{ key: 'session', value: 'abc123' }, { key: 'theme', value: 'dark' }] },
    });
  });

  it('returns an empty array for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Cookie Tools expects text input.', kind: 'invalid-input' } });
  });
});
