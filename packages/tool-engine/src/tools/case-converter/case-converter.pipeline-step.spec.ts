import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./case-converter.pipeline-step.js";

describe('case-converter pipeline step', () => {
  it('converts text to camelCase', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello world' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'helloWorld' } });
  });

  it('returns empty string for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Case Converter expects text input.', kind: 'invalid-input' } });
  });
});
