import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./structured-data-converter.pipeline-step.js";

describe('structured-data-converter pipeline step', () => {
  it('converts YAML text into a json value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'name: Alice\nage: 30' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { name: 'Alice', age: 30 } } });
  });

  it('fails on malformed YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'name: "unterminated' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Universal Structured Data Converter expects text (YAML) input.', kind: 'invalid-input' },
    });
  });
});
