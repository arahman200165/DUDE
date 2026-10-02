import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./json.pipeline-step.js";

describe('json pipeline step', () => {
  it('parses text input into a json value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"a":1}' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: 1 } } });
  });

  it('round-trips an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { a: [1, 2] } });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: [1, 2] } } });
  });

  it('fails on malformed json text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{not json' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({ ok: false, error: { message: 'JSON Formatter expects text or JSON input.', kind: 'invalid-input' } });
  });
});
