import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./unicode-code-point-converter.pipeline-step.js";

describe('unicode-code-point-converter pipeline step', () => {
  it('formats a single character into all notations', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'A' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: { codePoint: 65, uPlus: 'U+0041', decimal: '65', htmlDecimal: '&#65;', htmlHex: '&#x41;', jsEscape: '\\u0041', utf8Hex: '41' },
      },
    });
  });

  it('formats bulk input into an array of per-token notations', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'A,B' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { token: string }[];
      expect(value.map((v) => v.token)).toEqual(['A', 'B']);
    }
  });

  it('fails on unrecognized single-token input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-codepoint' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Unicode Code Point Converter expects text input.', kind: 'invalid-input' } });
  });
});
