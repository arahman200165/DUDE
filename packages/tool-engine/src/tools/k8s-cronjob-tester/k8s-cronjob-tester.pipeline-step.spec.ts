import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./k8s-cronjob-tester.pipeline-step.js";

describe('k8s-cronjob-tester pipeline step', () => {
  it('tests a bare cron expression', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '*/5 * * * *' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Schedule: */5 * * * *');
      expect(value).toContain('Next runs:');
    }
  });

  it('extracts the schedule from a full CronJob manifest', async () => {
    const manifest = 'apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: my-job\nspec:\n  schedule: "0 0 * * *"\n  suspend: true\n';
    const result = await pipelineStep.run({ type: 'text', value: manifest });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('Schedule: 0 0 * * * (suspended)');
    }
  });

  it('fails on an invalid cron expression', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a cron expression' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'K8s CronJob Tester expects text input.', kind: 'invalid-input' } });
  });
});
