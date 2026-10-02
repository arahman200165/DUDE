import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./css-transform-builder.pipeline-step.js";

describe('css-transform-builder pipeline step', () => {
  it('applies the piped number as a rotation angle', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '45' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'text', value: 'transform: rotate(45deg);\ntransform-origin: center;' },
    });
  });

  it('produces "none" for a zero/default rotation', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '0' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'transform: none;\ntransform-origin: center;' } });
  });

  it('falls back to the default state on non-numeric input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'transform: none;\ntransform-origin: center;' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSS Transform Builder expects text input.', kind: 'invalid-input' } });
  });
});
