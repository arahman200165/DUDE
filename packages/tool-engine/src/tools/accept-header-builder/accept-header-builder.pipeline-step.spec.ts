import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./accept-header-builder.pipeline-step.js";

describe('accept-header-builder pipeline step', () => {
  it('parses an Accept header into media-type/q pairs', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'text/html, application/json;q=0.9' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: [{ key: 'text/html', value: '' }, { key: 'application/json', value: '0.9' }] },
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
      error: { message: 'Accept Header Builder expects text input.', kind: 'invalid-input' },
    });
  });
});
