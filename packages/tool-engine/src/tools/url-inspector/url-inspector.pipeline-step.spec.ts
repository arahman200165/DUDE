import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./url-inspector.pipeline-step.js";

describe('url-inspector pipeline step', () => {
  it('parses a URL into its component parts', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'https://user@example.com:8443/a/b?x=1#top' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const parts = result.output.value as { hostname: string; port: string; pathname: string };
      expect(parts.hostname).toBe('example.com');
      expect(parts.port).toBe('8443');
      expect(parts.pathname).toBe('/a/b');
    }
  });

  it('accepts a plain text URL too', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'https://example.com' });
    expect(result.ok).toBe(true);
  });

  it('fails on a non-absolute URL', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'not a url' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'URL / URI Inspector expects text or url input.', kind: 'invalid-input' },
    });
  });
});
