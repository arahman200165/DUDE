import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cubic-bezier-editor.pipeline-step.js";

describe('cubic-bezier-editor pipeline step', () => {
  it('resolves a known preset name to its cubic-bezier() value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ease-in-out' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'cubic-bezier(0.42, 0, 0.58, 1)' } });
  });

  it('falls back to "ease" for an unrecognized preset name', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-preset' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'cubic-bezier(0.25, 0.1, 0.25, 1)' } });
  });

  it('falls back to "ease" on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'cubic-bezier(0.25, 0.1, 0.25, 1)' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Cubic-Bezier Editor expects text input.', kind: 'invalid-input' } });
  });
});
