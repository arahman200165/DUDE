import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./opengraph-preview.pipeline-step.js";

describe('opengraph-preview pipeline step', () => {
  it('builds og: and twitter: title tags from the piped text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'My Page' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: string }).value;
      expect(value).toContain('<meta property="og:title" content="My Page">');
      expect(value).toContain('<meta name="twitter:title" content="My Page">');
      expect(value).toContain('<meta property="og:type" content="website">');
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('escapes special characters in the title', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'A & B' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('content="A &amp; B"');
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'OpenGraph Preview expects text input.', kind: 'invalid-input' } });
  });
});
