import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./json-sort-keys.pipeline-step.js";

describe('json-sort-keys pipeline step', () => {
  it('sorts keys recursively in ascending order for text input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"b":1,"a":{"d":1,"c":2}}' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: { c: 2, d: 1 }, b: 1 } } });
  });

  it('sorts keys for an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { z: 1, a: 2 } });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: 2, z: 1 } } });
  });

  it('fails on malformed json text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{not json' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({ ok: false, error: { message: 'JSON Sort Keys expects text or JSON input.', kind: 'invalid-input' } });
  });
});
