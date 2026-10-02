import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cache-control-builder.pipeline-step.js";

describe('cache-control-builder pipeline step', () => {
  it('parses a Cache-Control header into directive entries', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'public, max-age=3600, must-revalidate' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: [
          { name: 'public', value: null },
          { name: 'max-age', value: '3600' },
          { name: 'must-revalidate', value: null },
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
      error: { message: 'Cache-Control Builder expects text input.', kind: 'invalid-input' },
    });
  });
});
