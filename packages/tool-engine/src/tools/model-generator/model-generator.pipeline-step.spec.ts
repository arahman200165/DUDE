import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./model-generator.pipeline-step.js";

describe('model-generator pipeline step', () => {
  it('generates TypeScript from a json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { id: 1, name: 'Ada' } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('text');
    expect(result.output.value).toContain('export interface Root {');
  });

  it('generates nested interfaces for nested objects', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { id: 1, address: { city: 'NYC' } } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.value).toContain('export interface Address {');
  });

  it('handles a bare scalar json value without erroring', async () => {
    const result = await pipelineStep.run({ type: 'json', value: 42 });
    expect(result.ok).toBe(true);
  });

  it('rejects non-json input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{}' });
    expect(result).toEqual({ ok: false, error: { message: 'Model Generator expects JSON input.', kind: 'invalid-input' } });
  });
});
