import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./env-validator.pipeline-step.js";

describe('env-validator pipeline step', () => {
  it('reports no issues when all default rules are satisfied', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'PORT=8080\nNAME=app\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'No issues found.' } });
  });

  it('reports a missing required variable', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'PORT=8080\n' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('NAME: Missing required variable.');
    }
  });

  it('reports an invalid type', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'PORT=not-a-number\nNAME=app\n' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('is not a valid number');
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: '.env Validator expects text input.', kind: 'invalid-input' } });
  });
});
