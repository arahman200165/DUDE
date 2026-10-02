import { describe, expect, it } from 'vitest';
import { pipelineStep } from './html-jsx-converter.pipeline-step';

describe('html-jsx-converter pipeline step', () => {
  it('converts a class attribute to className', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<div class="a">Hi</div>' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '<div className="a">Hi</div>' } });
  });

  it('self-closes void elements', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<br>' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '<br />' } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'HTML ↔ JSX Converter expects text input.', kind: 'invalid-input' } });
  });
});
