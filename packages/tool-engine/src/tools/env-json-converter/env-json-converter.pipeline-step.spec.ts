import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./env-json-converter.pipeline-step.js";

describe('env-json-converter pipeline step', () => {
  it('converts a .env document to a json value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'FOO=bar\nPORT=8080\n' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { FOO: 'bar', PORT: '8080' } } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter some .env text.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: '.env ↔ JSON expects text input.', kind: 'invalid-input' } });
  });
});
