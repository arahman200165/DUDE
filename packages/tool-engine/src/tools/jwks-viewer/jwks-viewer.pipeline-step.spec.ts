import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./jwks-viewer.pipeline-step.js";

describe('jwks-viewer pipeline step', () => {
  it('parses a JWKS document from text into json', async () => {
    const doc = { keys: [{ kty: 'oct', k: 'c2VjcmV0', kid: 'sym' }] };
    const result = await pipelineStep.run({ type: 'text', value: JSON.stringify(doc) });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { keys: readonly { kid?: string; warnings: readonly string[] }[] };
      expect(value.keys).toHaveLength(1);
      expect(value.keys[0].kid).toBe('sym');
      expect(value.keys[0].warnings.some((w) => w.includes('Symmetric'))).toBe(true);
    }
  });

  it('parses a JWKS document given as a json value', async () => {
    const doc = { keys: [{ kty: 'oct', k: 'c2VjcmV0', kid: 'sym' }] };
    const result = await pipelineStep.run({ type: 'json', value: doc });
    expect(result.ok).toBe(true);
  });

  it('fails on a document without a "keys" array', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"foo":"bar"}' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({ ok: false, error: { message: 'JWKS Viewer expects text or JSON input.', kind: 'invalid-input' } });
  });
});
