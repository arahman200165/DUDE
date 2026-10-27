import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_JOBS_PATH, HUB_JOB_IDS, HUB_JOB_SUMMARY_MAX, HubJobStatus, HubJobsResponse } from './jobs.schema.js';

describe('HubJobsResponse', () => {
  const never = { id: 'leaf-renewal', intervalMs: 43_200_000, running: false, lastStartedAt: null, lastFinishedAt: null, lastOutcome: null, lastSummary: null, nextDueAt: null };
  const ran = { ...never, id: 'backup-schedule', lastStartedAt: '2026-10-24T10:00:00.000Z', lastFinishedAt: '2026-10-24T10:00:01.000Z', lastOutcome: 'skipped', lastSummary: 'Not due yet.', nextDueAt: '2026-10-24T10:10:01.000Z' };

  it('names the path and a closed, ordered job list', () => {
    expect(HUB_JOBS_PATH).toBe('/api/v1/jobs');
    expect([...HUB_JOB_IDS]).toEqual(['leaf-renewal', 'acme-renewal', 'backup-schedule', 'sync-compaction', 'address-watch', 'audit-prune', 'collab-history-prune', 'collab-maintenance', 'queue-runner', 'blobs-verify', 'blobs-staging-sweep', 'uploads-expire']);
  });

  it('accepts a never-run job, a finished job and a running job', () => {
    expect(Value.Check(HubJobsResponse, { jobs: [never, ran, { ...ran, running: true, lastOutcome: 'failed' }, { ...ran, lastOutcome: 'success' }] })).toBe(true);
    expect(Value.Check(HubJobsResponse, { jobs: [] })).toBe(true);
  });

  it('accepts lastAttempt present, null or absent, and rejects a skipped attempt, a missing field and an over-long summary', () => {
    const attempt = { finishedAt: '2026-10-24T09:00:00.000Z', outcome: 'failed', summary: 'The run failed (ENOSPC).' };
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: attempt })).toBe(true);
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: { ...attempt, outcome: 'success' } })).toBe(true);
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: null })).toBe(true);
    expect(Value.Check(HubJobStatus, ran)).toBe(true);
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: { ...attempt, outcome: 'skipped' } })).toBe(false);
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: { finishedAt: attempt.finishedAt, outcome: 'failed' } })).toBe(false);
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: { ...attempt, finishedAt: null } })).toBe(false);
    expect(Value.Check(HubJobStatus, { ...ran, lastAttempt: { ...attempt, summary: 'x'.repeat(HUB_JOB_SUMMARY_MAX + 1) } })).toBe(false);
  });

  it('rejects an unknown job id, an unknown outcome, a missing field, a bad interval and an over-long summary', () => {
    expect(Value.Check(HubJobStatus, { ...never, id: 'run-anything' })).toBe(false);
    expect(Value.Check(HubJobStatus, { ...ran, lastOutcome: 'ok' })).toBe(false);
    const { running: _omitted, ...missing } = never;
    expect(Value.Check(HubJobStatus, missing)).toBe(false);
    expect(Value.Check(HubJobStatus, { ...never, intervalMs: -1 })).toBe(false);
    expect(Value.Check(HubJobStatus, { ...never, intervalMs: 1.5 })).toBe(false);
    expect(Value.Check(HubJobStatus, { ...ran, lastSummary: 'x'.repeat(HUB_JOB_SUMMARY_MAX + 1) })).toBe(false);
  });
});
