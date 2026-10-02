import { extractCronJobSchedule, testCronJobSchedule } from "./k8s-cronjob-tester-logic.js";

const MANIFEST = `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-job
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  jobTemplate: {}
`;

describe('extractCronJobSchedule', () => {
  it('extracts spec.schedule and spec.concurrencyPolicy from a CronJob manifest', () => {
    const result = extractCronJobSchedule(MANIFEST);
    expect(result).toEqual({ ok: true, info: { schedule: '*/5 * * * *', suspend: false, concurrencyPolicy: 'Forbid' } });
  });

  it('detects a suspended CronJob', () => {
    const result = extractCronJobSchedule('spec:\n  schedule: "0 0 * * *"\n  suspend: true\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.info.suspend).toBe(true);
  });

  it('falls back to treating the whole input as a bare schedule expression', () => {
    const result = extractCronJobSchedule('*/5 * * * *');
    expect(result).toEqual({ ok: true, info: { schedule: '*/5 * * * *', suspend: false } });
  });

  it('rejects empty input', () => {
    expect(extractCronJobSchedule('').ok).toBe(false);
  });
});

describe('testCronJobSchedule', () => {
  it('computes next run times for the extracted schedule', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const result = testCronJobSchedule(MANIFEST, 3, 'utc', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.concurrencyPolicy).toBe('Forbid');
    expect(result.result.ok).toBe(true);
    if (result.result.ok) expect(result.result.nextRuns).toHaveLength(3);
  });

  it('propagates an invalid schedule error', () => {
    const result = testCronJobSchedule('not a schedule', 3, 'utc');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.ok).toBe(false);
  });
});
