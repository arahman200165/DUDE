import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./http-response-viewer.pipeline-step.js";

describe('http-response-viewer pipeline step', () => {
  it('parses a raw http response into an http-response value with a json body', async () => {
    const raw = ['HTTP/1.1 200 OK', 'Content-Type: application/json', '', '{"ok":true}'].join('\n');
    const result = await pipelineStep.run({ type: 'text', value: raw });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'http-response',
        value: {
          status: 200,
          statusText: 'OK',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: { type: 'json', value: { ok: true } },
        },
      },
    });
  });

  it('keeps a non-json body as text', async () => {
    const raw = 'HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello world';
    const result = await pipelineStep.run({ type: 'text', value: raw });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'http-response') {
      expect(result.output.value.body).toEqual({ type: 'text', value: 'hello world' });
    }
  });

  it('fails when the first line is not a status line', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a status line' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'HTTP Response Viewer expects text input.', kind: 'invalid-input' },
    });
  });
});
