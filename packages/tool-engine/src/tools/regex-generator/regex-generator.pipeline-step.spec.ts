import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./regex-generator.pipeline-step.js";

describe('regex-generator pipeline step', () => {
  it('generalizes same-shape examples into a character-class pattern', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'cat\ndog' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '^[a-z]{3}$' } });
  });

  it('falls back to a literal alternation for differently-shaped examples', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '123\nabc' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '^(?:123|abc)$' } });
  });

  it('fails when there are no examples', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter at least one example.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Regex Generator expects text input.', kind: 'invalid-input' } });
  });
});
