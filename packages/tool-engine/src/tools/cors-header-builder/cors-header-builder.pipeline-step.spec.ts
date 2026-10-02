import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cors-header-builder.pipeline-step.js";

describe('cors-header-builder pipeline step', () => {
  it('parses a block of CORS response headers into a structured json value', async () => {
    const raw = 'Access-Control-Allow-Origin: https://app.example.com\nAccess-Control-Allow-Methods: GET, POST';
    const result = await pipelineStep.run({ type: 'text', value: raw });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: {
          allowOrigin: 'https://app.example.com',
          allowMethods: 'GET, POST',
          allowHeaders: '',
          allowCredentials: false,
          maxAge: '',
          exposeHeaders: '',
        },
      },
    });
  });

  it('returns the empty defaults for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: { allowOrigin: '', allowMethods: '', allowHeaders: '', allowCredentials: false, maxAge: '', exposeHeaders: '' },
      },
    });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'CORS Header Builder expects text input.', kind: 'invalid-input' },
    });
  });
});
