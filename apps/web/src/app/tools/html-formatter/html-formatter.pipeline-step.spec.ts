import { describe, expect, it } from 'vitest';
import { pipelineStep } from './html-formatter.pipeline-step';

describe('html-formatter pipeline step', () => {
  it('pretty-prints a single line of HTML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<div><p>Hi</p></div>' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '<div>\n  <p>Hi</p>\n</div>' } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('collapses insignificant whitespace', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<span>a    b</span>' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '<span>a b</span>' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'HTML Formatter expects text input.', kind: 'invalid-input' } });
  });
});
