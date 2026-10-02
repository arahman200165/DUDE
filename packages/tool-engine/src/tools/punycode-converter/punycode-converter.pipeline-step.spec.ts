import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./punycode-converter.pipeline-step.js";

describe('punycode-converter pipeline step', () => {
  it('converts a Unicode domain to its Punycode (ASCII) form', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'münchen.de' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'xn--mnchen-3ya.de' } });
  });

  it('accepts url input the same as text', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'münchen.de' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'xn--mnchen-3ya.de' } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a domain name.', kind: 'invalid-input' } });
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Punycode Converter expects text or url input.', kind: 'invalid-input' } });
  });
});
