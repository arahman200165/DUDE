import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./create-table-generator.pipeline-step.js";

describe('create-table-generator pipeline step', () => {
  it('generates DDL from a JSON array sample given as text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '[{"id":1,"name":"Ada"}]' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('CREATE TABLE "users"');
    }
  });

  it('generates DDL from an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: [{ id: 1, name: 'Ada' }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('"id" INTEGER');
    }
  });

  it('fails on an empty sample', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({
      ok: false,
      error: { message: 'CREATE TABLE Generator expects text or JSON input.', kind: 'invalid-input' },
    });
  });
});
