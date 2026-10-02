import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./box-shadow-generator.pipeline-step.js";

describe('box-shadow-generator pipeline step', () => {
  it('builds a box-shadow declaration using the piped value as the color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#ff0000' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'box-shadow: 0px 4px 8px 0px #ff0000;' } });
  });

  it('falls back to the default color on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'box-shadow: 0px 4px 8px 0px rgba(0,0,0,0.35);' } });
  });

  it('trims whitespace around the piped color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '  blue  ' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'box-shadow: 0px 4px 8px 0px blue;' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Box Shadow Generator expects text input.', kind: 'invalid-input' } });
  });
});
