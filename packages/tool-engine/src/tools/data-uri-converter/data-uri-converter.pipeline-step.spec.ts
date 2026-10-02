import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./data-uri-converter.pipeline-step.js";

describe('data-uri-converter pipeline step', () => {
  it('generates a data URI from a file value using its own mime type', async () => {
    const base64 = btoa('hello');
    const result = await pipelineStep.run({ type: 'file', value: { name: 'hi.txt', mimeType: 'text/plain', base64 } });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: `data:text/plain;base64,${base64}` } });
  });

  it('generates a data URI from a bytes value, defaulting the mime type', async () => {
    const base64 = btoa('hello');
    const result = await pipelineStep.run({ type: 'bytes', value: base64 });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: `data:application/octet-stream;base64,${base64}` } });
  });

  it('fails on invalid Base64', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: 'not-base64!!' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Data URI Converter expects file or bytes input.', kind: 'invalid-input' } });
  });
});
