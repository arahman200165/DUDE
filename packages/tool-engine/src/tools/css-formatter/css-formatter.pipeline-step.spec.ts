import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./css-formatter.pipeline-step.js";

describe('css-formatter pipeline step', () => {
  it('pretty-prints minified css', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '.a{color:red;background:blue}' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toBe('.a {\n  color: red;\n  background: blue;\n}');
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('fails on unbalanced braces', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '.a { color: red;' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSS Formatter expects text input.', kind: 'invalid-input' } });
  });
});
