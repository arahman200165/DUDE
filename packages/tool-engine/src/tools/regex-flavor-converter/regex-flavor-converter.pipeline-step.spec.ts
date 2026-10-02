import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./regex-flavor-converter.pipeline-step.js";

describe('regex-flavor-converter pipeline step', () => {
  it('converts a JS named group to Python re syntax', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '(?<year>\\d{4})' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '(?P<year>\\d{4})' } });
  });

  it('fails on an empty pattern', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a regular expression.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Regex Flavor Converter expects text input.', kind: 'invalid-input' } });
  });
});
