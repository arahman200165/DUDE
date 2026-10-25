import { DatabaseSync } from 'node:sqlite';
import { getMeta } from '@dude/sqlite-store';
import { HUB_JOB_IDS, HUB_JOB_SUMMARY_MAX, HubJobsResponse } from '@dude/contracts/hub';
import type { HubJobStatus } from '@dude/contracts/hub';
import { Value } from 'typebox/value';
import { describe, expect, it, vi } from 'vitest';
import { JOB_LAST_META_PREFIX, createJobRegistry } from './job-status.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const clock = { t: Date.parse('2026-10-24T10:00:00.000Z') };
  const onChange = vi.fn();
  const registry = createJobRegistry({ db, now: () => clock.t, onChange });
  return { db, clock, onChange, registry, again: () => createJobRegistry({ db, now: () => clock.t }) };
}

const find = (jobs: HubJobStatus[], id: string): HubJobStatus => jobs.find((j) => j.id === id)!;

describe('job registry', () => {
  it('lists every closed job id in order, never run, with a schema-valid shape', () => {
    const { registry } = setup();
    const jobs = registry.list();
    expect(jobs.map((j) => j.id)).toEqual([...HUB_JOB_IDS]);
    for (const job of jobs) expect(job).toEqual({ id: job.id, intervalMs: 0, running: false, lastStartedAt: null, lastFinishedAt: null, lastOutcome: null, lastSummary: null, nextDueAt: null, lastAttempt: null });
    expect(Value.Check(HubJobsResponse, { jobs })).toBe(true);
  });

  it('tracks a successful sync run: start, finish, outcome, nextDueAt = finish + interval', () => {
    const { registry, clock, onChange, db } = setup();
    registry.register('audit-prune', 60_000);
    const seen: boolean[] = [];
    const result = registry.track('audit-prune', () => { seen.push(find(registry.list(), 'audit-prune').running); clock.t += 1500; return 7; });
    expect(result).toBe(7);
    expect(seen).toEqual([true]);
    const job = find(registry.list(), 'audit-prune');
    expect(job).toEqual({
      id: 'audit-prune', intervalMs: 60_000, running: false, lastStartedAt: '2026-10-24T10:00:00.000Z', lastFinishedAt: '2026-10-24T10:00:01.500Z',
      lastOutcome: 'success', lastSummary: 'Completed.', nextDueAt: '2026-10-24T10:01:01.500Z',
      lastAttempt: { finishedAt: '2026-10-24T10:00:01.500Z', outcome: 'success', summary: 'Completed.' },
    });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(JSON.parse(getMeta(db, `${JOB_LAST_META_PREFIX}audit-prune`)!)).toEqual({ startedAt: '2026-10-24T10:00:00.000Z', finishedAt: '2026-10-24T10:00:01.500Z', outcome: 'success', summary: 'Completed.', attempt: { finishedAt: '2026-10-24T10:00:01.500Z', outcome: 'success', summary: 'Completed.' } });
  });

  it('uses the classifier for the outcome and summary, and a classifier that throws is a plain success', () => {
    const { registry } = setup();
    registry.track('backup-schedule', () => 'not-due', (r) => ({ outcome: 'skipped', summary: `Result ${r}.` }));
    expect(find(registry.list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'skipped', lastSummary: 'Result not-due.' });
    registry.track('backup-schedule', () => 1, () => { throw new Error('boom'); });
    expect(find(registry.list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'success', lastSummary: 'Completed.' });
  });

  it('records a failing sync run as failed and rethrows the same error', () => {
    const { registry, onChange } = setup();
    const error = Object.assign(new Error('secret path C:\\keys\\x'), { code: 'ENOSPC' });
    expect(() => registry.track('leaf-renewal', () => { throw error; })).toThrow(error);
    const job = find(registry.list(), 'leaf-renewal');
    expect(job).toMatchObject({ running: false, lastOutcome: 'failed', lastSummary: 'The run failed (ENOSPC).' });
    expect(JSON.stringify(job)).not.toContain('secret path');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(() => registry.track('leaf-renewal', () => { throw new Error('plain'); })).toThrow('plain');
    expect(find(registry.list(), 'leaf-renewal').lastSummary).toBe('The run failed.');
  });

  it('tracks an async run as running until it settles, and passes the value or rejection through', async () => {
    const { registry, clock } = setup();
    let release!: (value: string) => void;
    const pending = registry.track('acme-renewal', () => new Promise<string>((resolve) => { release = resolve; }), (r) => ({ outcome: 'success', summary: `Got ${r}.` }));
    expect(find(registry.list(), 'acme-renewal')).toMatchObject({ running: true, lastStartedAt: '2026-10-24T10:00:00.000Z', lastFinishedAt: null, lastOutcome: null });
    clock.t += 2000;
    release('ok');
    await expect(pending).resolves.toBe('ok');
    expect(find(registry.list(), 'acme-renewal')).toMatchObject({ running: false, lastFinishedAt: '2026-10-24T10:00:02.000Z', lastOutcome: 'success', lastSummary: 'Got ok.' });

    const failing = new Error('nope');
    await expect(registry.track('acme-renewal', () => Promise.reject(failing))).rejects.toBe(failing);
    expect(find(registry.list(), 'acme-renewal')).toMatchObject({ running: false, lastOutcome: 'failed', lastSummary: 'The run failed.' });
  });

  it('report records a finished run with its own outcome', () => {
    const { registry, onChange } = setup();
    registry.report('acme-renewal', 'skipped', 'ACME is not configured.');
    expect(find(registry.list(), 'acme-renewal')).toMatchObject({ running: false, lastOutcome: 'skipped', lastSummary: 'ACME is not configured.', lastStartedAt: '2026-10-24T10:00:00.000Z', lastFinishedAt: '2026-10-24T10:00:00.000Z' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps nextDueAt null for a job with no registered timer or a zero interval', () => {
    const { registry } = setup();
    registry.report('address-watch', 'success', 'x');
    expect(find(registry.list(), 'address-watch').nextDueAt).toBeNull();
    registry.register('address-watch', 0);
    expect(find(registry.list(), 'address-watch').nextDueAt).toBeNull();
    registry.register('address-watch', 300_000);
    expect(find(registry.list(), 'address-watch').nextDueAt).toBe('2026-10-24T10:05:00.000Z');
  });

  it('persists across a new registry on the same database; an unregistered job has no nextDueAt', () => {
    const { registry, again, clock } = setup();
    registry.register('sync-compaction', 21_600_000);
    clock.t += 1000;
    registry.report('sync-compaction', 'success', 'Compacted 3 change entries.');
    const next = again();
    expect(find(next.list(), 'sync-compaction')).toEqual({
      id: 'sync-compaction', intervalMs: 0, running: false, lastStartedAt: '2026-10-24T10:00:01.000Z', lastFinishedAt: '2026-10-24T10:00:01.000Z',
      lastOutcome: 'success', lastSummary: 'Compacted 3 change entries.', nextDueAt: null,
      lastAttempt: { finishedAt: '2026-10-24T10:00:01.000Z', outcome: 'success', summary: 'Compacted 3 change entries.' },
    });
    next.register('sync-compaction', 21_600_000);
    expect(find(next.list(), 'sync-compaction').nextDueAt).toBe('2026-10-24T16:00:01.000Z');
  });

  it('keeps the last real attempt across later skipped checks, and a newer real attempt replaces it', () => {
    const { registry, clock } = setup();
    expect(() => registry.track('backup-schedule', () => { throw Object.assign(new Error('x'), { code: 'ENOSPC' }); })).toThrow('x');
    const failed = { finishedAt: '2026-10-24T10:00:00.000Z', outcome: 'failed', summary: 'The run failed (ENOSPC).' };
    expect(find(registry.list(), 'backup-schedule').lastAttempt).toEqual(failed);
    clock.t += 600_000;
    registry.report('backup-schedule', 'skipped', 'Not due yet.');
    clock.t += 600_000;
    registry.report('backup-schedule', 'skipped', 'Not due yet.');
    expect(find(registry.list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'skipped', lastSummary: 'Not due yet.', lastFinishedAt: '2026-10-24T10:20:00.000Z', lastAttempt: failed });
    clock.t += 600_000;
    registry.report('backup-schedule', 'success', 'Backup written.');
    expect(find(registry.list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'success', lastAttempt: { finishedAt: '2026-10-24T10:30:00.000Z', outcome: 'success', summary: 'Backup written.' } });
    clock.t += 600_000;
    registry.report('backup-schedule', 'skipped', 'Not due yet.');
    expect(find(registry.list(), 'backup-schedule').lastAttempt).toEqual({ finishedAt: '2026-10-24T10:30:00.000Z', outcome: 'success', summary: 'Backup written.' });
  });

  it('has a null lastAttempt while every run was skipped', () => {
    const { registry } = setup();
    registry.report('backup-schedule', 'skipped', 'Not due yet.');
    expect(find(registry.list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'skipped', lastAttempt: null });
    expect(Value.Check(HubJobsResponse, { jobs: registry.list() })).toBe(true);
  });

  it('derives the attempt for a legacy record without one, and keeps it through a skipped check', () => {
    const { registry, db, clock } = setup();
    const put = (id: string, record: unknown): void => void db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(`${JOB_LAST_META_PREFIX}${id}`, JSON.stringify(record));
    const legacy = { startedAt: '2026-10-24T09:00:00.000Z', finishedAt: '2026-10-24T09:00:01.000Z', outcome: 'failed', summary: 'The run failed.' };
    put('backup-schedule', legacy);
    put('audit-prune', { ...legacy, outcome: 'skipped', summary: 'Nothing to do.' });
    put('leaf-renewal', { ...legacy, outcome: 'success', summary: 'Renewed.', attempt: { finishedAt: 5, outcome: 'skipped', summary: 1 } });
    expect(find(registry.list(), 'backup-schedule').lastAttempt).toEqual({ finishedAt: '2026-10-24T09:00:01.000Z', outcome: 'failed', summary: 'The run failed.' });
    expect(find(registry.list(), 'audit-prune').lastAttempt).toBeNull();
    expect(find(registry.list(), 'leaf-renewal').lastAttempt).toEqual({ finishedAt: '2026-10-24T09:00:01.000Z', outcome: 'success', summary: 'Renewed.' });
    clock.t += 1000;
    registry.report('backup-schedule', 'skipped', 'Not due yet.');
    expect(find(registry.list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'skipped', lastAttempt: { finishedAt: '2026-10-24T09:00:01.000Z', outcome: 'failed' } });
  });

  it('persists the attempt across a new registry on the same database', () => {
    const { registry, again, clock } = setup();
    registry.report('backup-schedule', 'failed', 'The run failed.');
    clock.t += 600_000;
    registry.report('backup-schedule', 'skipped', 'Not due yet.');
    expect(find(again().list(), 'backup-schedule')).toMatchObject({ lastOutcome: 'skipped', lastAttempt: { finishedAt: '2026-10-24T10:00:00.000Z', outcome: 'failed', summary: 'The run failed.' } });
  });

  it('clips an over-long summary to one short line and ignores a corrupt stored record', () => {
    const { registry, db } = setup();
    registry.report('audit-prune', 'success', `line one\n${'x'.repeat(400)}`);
    const summary = find(registry.list(), 'audit-prune').lastSummary!;
    expect(summary.length).toBeLessThanOrEqual(HUB_JOB_SUMMARY_MAX);
    expect(summary).not.toContain('\n');
    db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(`${JOB_LAST_META_PREFIX}audit-prune`, '{not json');
    expect(find(registry.list(), 'audit-prune')).toMatchObject({ lastOutcome: null, lastSummary: null });
  });

  it('never lets an onChange failure or a closed database reach the job', () => {
    const { db, clock } = setup();
    const registry = createJobRegistry({ db, now: () => clock.t, onChange: () => { throw new Error('socket'); } });
    expect(registry.track('audit-prune', () => 5)).toBe(5);
    db.close();
    expect(registry.track('audit-prune', () => 6)).toBe(6);
  });

  it('reports each finished run to onFinish (sync, async and thrown) and never lets an observer failure reach the job', async () => {
    const { registry, clock } = setup();
    const finished: Array<[string, string, string, string]> = [];
    registry.onFinish = ({ id, outcome, summary, finishedAt }) => void finished.push([id, outcome, summary, finishedAt]);
    registry.track('audit-prune', () => 1, () => ({ outcome: 'success', summary: 'Done.' }));
    await registry.track('sync-compaction', async () => 2);
    expect(() => registry.track('leaf-renewal', () => { throw Object.assign(new Error('secret'), { code: 'EACCES' }); })).toThrow('secret');
    registry.report('backup-schedule', 'skipped', 'Not due.');
    const at = new Date(clock.t).toISOString();
    expect(finished).toEqual([
      ['audit-prune', 'success', 'Done.', at], ['sync-compaction', 'success', 'Completed.', at],
      ['leaf-renewal', 'failed', 'The run failed (EACCES).', at], ['backup-schedule', 'skipped', 'Not due.', at],
    ]);
    registry.onFinish = () => { throw new Error('observer'); };
    expect(registry.track('audit-prune', () => 7)).toBe(7);
  });

  it('handle(id) tracks that job', () => {
    const { registry } = setup();
    expect(registry.handle('address-watch').track(() => 'x', () => ({ outcome: 'skipped', summary: 'None.' }))).toBe('x');
    expect(find(registry.list(), 'address-watch')).toMatchObject({ lastOutcome: 'skipped', lastSummary: 'None.' });
  });
});
