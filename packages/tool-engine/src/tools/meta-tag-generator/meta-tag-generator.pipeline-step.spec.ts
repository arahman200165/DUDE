import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./meta-tag-generator.pipeline-step.js";

describe('meta-tag-generator pipeline step', () => {
  it('uses the piped text as the page title', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'My Page' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('<title>My Page</title>');
    }
  });

  it('always includes the default charset and viewport tags', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: string }).value;
      expect(value).toContain('<meta charset="UTF-8">');
      expect(value).toContain('name="viewport"');
    }
  });

  it('escapes special characters in the title', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'A & B' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('<title>A &amp; B</title>');
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Meta Tag Generator expects text input.', kind: 'invalid-input' } });
  });
});
