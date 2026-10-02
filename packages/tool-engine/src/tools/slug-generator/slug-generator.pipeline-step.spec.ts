import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./slug-generator.pipeline-step.js";

describe('slug-generator pipeline step', () => {
  it('turns a title into a url-friendly slug', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Hello, World!' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello-world' } });
  });

  it('handles empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Slug Generator expects text input.', kind: 'invalid-input' } });
  });
});
