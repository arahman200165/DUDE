import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./http-header-inspector.pipeline-step.js";

describe('http-header-inspector pipeline step', () => {
  it('parses raw header text into ordered key/value pairs', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Content-Type: application/json\nAccept: */*' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Accept', value: '*/*' },
        ],
      },
    });
  });

  it('returns an empty array for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'HTTP Header Inspector expects text input.', kind: 'invalid-input' },
    });
  });
});
