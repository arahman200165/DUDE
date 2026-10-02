import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./rich-text-editor.pipeline-step.js";

describe('rich-text-editor pipeline step', () => {
  it('passes through plain formatted HTML unchanged in substance', async () => {
    const html = '<p><strong>bold</strong> and <em>italic</em></p>';
    const result = await pipelineStep.run({ type: 'text', value: html });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: html } });
  });

  it('strips script tags', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<p>hello</p><script>alert(1)</script>' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'text') {
      expect(result.output.value).not.toContain('<script');
      expect(result.output.value).toContain('hello');
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Rich Text Editor expects text input.', kind: 'invalid-input' } });
  });
});
