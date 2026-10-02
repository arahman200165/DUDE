import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./url-normalizer.pipeline-step.js";

describe('url-normalizer pipeline step', () => {
  it('lowercases scheme/host and removes the default port', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'HTTP://Example.COM:80/a' });
    expect(result).toEqual({ ok: true, output: { type: 'url', value: 'http://example.com/a' } });
  });

  it('fails on a non-absolute URL', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'not a url' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-url input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'https://example.com' });
    expect(result).toEqual({ ok: false, error: { message: 'URL Normalizer expects url input.', kind: 'invalid-input' } });
  });
});
