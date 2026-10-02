import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./json-flatten.pipeline-step.js";

describe('json-flatten pipeline step', () => {
  it('flattens text input into dot-notation json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"a":{"b":1}}' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { 'a.b': 1 } } });
  });

  it('flattens an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { a: [1, 2] } });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { 'a[0]': 1, 'a[1]': 2 } } });
  });

  it('fails on malformed json text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{not json' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({
      ok: false,
      error: { message: 'JSON Flatten / Unflatten expects text or JSON input.', kind: 'invalid-input' },
    });
  });
});
