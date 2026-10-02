import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./escape-unescape-toolkit.pipeline-step.js";

describe('escape-unescape-toolkit pipeline step', () => {
  it('escapes text for a JavaScript string literal', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'line one\n"quoted"' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'line one\\n\\"quoted\\"' } });
  });

  it('escapes an empty string as an empty string', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Escape / Unescape Toolkit expects text input.', kind: 'invalid-input' } });
  });
});
