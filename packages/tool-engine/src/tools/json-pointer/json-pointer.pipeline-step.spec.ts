import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./json-pointer.pipeline-step.js";

describe('json-pointer pipeline step', () => {
  it('resolves the fixed default pointer (/0) against a top-level array', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '[10, 20, 30]' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: 10 } });
  });

  it('resolves the fixed default pointer against an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { '0': 'zero' } });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: 'zero' } });
  });

  it('fails when the document has no "/0" member', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"a":1}' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({
      ok: false,
      error: { message: 'JSON Pointer Tester expects text or JSON input.', kind: 'invalid-input' },
    });
  });
});
