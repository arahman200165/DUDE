import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./mock-data-studio.pipeline-step.js";

describe('mock-data-studio pipeline step', () => {
  it('generates 5 rows of mock data from a schema', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { name: 'person.fullName' } });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'table') {
      expect(result.output.value.columns).toEqual(['name']);
      expect(result.output.value.rows).toHaveLength(5);
      expect(result.output.value.rows[0]).toHaveLength(1);
    }
  });

  it('fails on a schema with no fields', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(false);
  });

  it('fails on an unknown faker path', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { x: 'not.a.real.path' } });
    expect(result.ok).toBe(false);
  });

  it('rejects non-json input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{}' });
    expect(result).toEqual({ ok: false, error: { message: 'Mock Data Studio expects JSON input.', kind: 'invalid-input' } });
  });
});
