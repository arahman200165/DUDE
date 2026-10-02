import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./markdown.pipeline-step.js";

describe('markdown pipeline step', () => {
  it('renders a heading to sanitized HTML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '# Hello' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toContain('<h1>Hello</h1>');
  });

  it('never lets a raw <script> tag through', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<script>alert(1)</script>\n\n# Still renders' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value.toLowerCase()).not.toContain('<script');
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Markdown Preview expects text input.', kind: 'invalid-input' } });
  });
});
