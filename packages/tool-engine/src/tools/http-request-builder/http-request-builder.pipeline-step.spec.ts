import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./http-request-builder.pipeline-step.js";

describe('http-request-builder pipeline step', () => {
  it('parses a raw http request into a ParsedHttpRequest json value', async () => {
    const raw = ['POST /users?active=true HTTP/1.1', 'Host: api.example.com', 'Content-Type: application/json', '', '{"name":"a"}'].join('\n');
    const result = await pipelineStep.run({ type: 'text', value: raw });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: {
          method: 'POST',
          url: 'https://api.example.com/users',
          queryParams: [{ key: 'active', value: 'true' }],
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
          auth: null,
        },
      },
    });
  });

  it('fails when the first line is not a request line', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a request line' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'HTTP Request Builder expects text input.', kind: 'invalid-input' },
    });
  });
});
