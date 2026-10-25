import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_JOB_IDS, HubJobsResponse } from '@dude/contracts/hub';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

/** `GET /api/v1/jobs`: the owner's read-only view of the Hub's background jobs (PD-112). */
describe('GET /jobs', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => { h = await startAuthHub({ sync: { compactionIntervalMs: 0 } }); owner = await h.signIn(); });
  afterAll(async () => { await h.close(); });

  it('lists every job in order for the owner, uncached, matching the contract', async () => {
    const res = await h.call('GET', '/jobs', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(HubJobsResponse, res.json)).toBe(true);
    expect(res.json.jobs.map((j: { id: string }) => j.id)).toEqual([...HUB_JOB_IDS]);
  });

  it('reports the audit prune that the real timer ran at startup, with its period and next due time', async () => {
    const res = await h.call('GET', '/jobs', { cookie: owner.cookie });
    const prune = res.json.jobs.find((j: { id: string }) => j.id === 'audit-prune');
    expect(prune).toMatchObject({ running: false, lastOutcome: 'success', intervalMs: 24 * 3600_000 });
    expect(typeof prune.lastSummary).toBe('string');
    expect(prune.lastAttempt).toEqual({ finishedAt: prune.lastFinishedAt, outcome: 'success', summary: prune.lastSummary });
    expect(Date.parse(prune.nextDueAt) - Date.parse(prune.lastFinishedAt)).toBe(24 * 3600_000);
    // The timers `run` starts are not registered in a test Hub and never ran.
    expect(res.json.jobs.find((j: { id: string }) => j.id === 'leaf-renewal')).toMatchObject({ intervalMs: 0, lastOutcome: null, nextDueAt: null, lastAttempt: null });
  });

  it('runs the collaboration maintenance at startup right after the sync compaction, on the same cadence', async () => {
    const res = await h.call('GET', '/jobs', { cookie: owner.cookie });
    const find = (id: string) => res.json.jobs.find((j: { id: string }) => j.id === id);
    expect(find('collab-maintenance')).toMatchObject({ running: false, lastOutcome: 'success', lastSummary: 'Nothing needed pruning or compaction.', intervalMs: find('sync-compaction').intervalMs });
    expect(Date.parse(find('collab-maintenance').lastStartedAt)).toBeGreaterThanOrEqual(Date.parse(find('sync-compaction').lastFinishedAt));
  });

  it('refreshes live: a recorded run pushes a contentless jobs view change', async () => {
    const notify = vi.spyOn(h.hub.app.realtime, 'notifyOwnerView');
    h.hub.app.hubJobs.register('address-watch', 300_000);
    h.hub.app.hubJobs.report('address-watch', 'success', 'No address change.');
    expect(notify).toHaveBeenCalledWith('jobs');
    const res = await h.call('GET', '/jobs', { cookie: owner.cookie });
    expect(res.json.jobs.find((j: { id: string }) => j.id === 'address-watch')).toMatchObject({ lastOutcome: 'success', lastSummary: 'No address change.' });
    notify.mockRestore();
  });

  it('keeps the last real attempt visible after later skipped checks', async () => {
    h.hub.app.hubJobs.report('backup-schedule', 'failed', 'The run failed (ENOSPC).');
    h.hub.app.hubJobs.report('backup-schedule', 'skipped', 'Not due yet.');
    const res = await h.call('GET', '/jobs', { cookie: owner.cookie });
    expect(Value.Check(HubJobsResponse, res.json)).toBe(true);
    expect(res.json.jobs.find((j: { id: string }) => j.id === 'backup-schedule')).toMatchObject({ lastOutcome: 'skipped', lastSummary: 'Not due yet.', lastAttempt: { outcome: 'failed', summary: 'The run failed (ENOSPC).' } });
  });

  it('is owner-only: anonymous is 401, a device token is refused, a bearer owner session works', async () => {
    expect((await h.call('GET', '/jobs')).status).toBe(401);
    expect((await h.call('GET', '/jobs', { cookie: 'not-a-session' })).status).toBe(401);
    const { token } = await enrolled(h, owner);
    expect((await h.call('GET', '/jobs', { bearer: token, noOrigin: true })).status).toBe(403);
    const bearer = await h.call('POST', '/auth/owner/bearer', { bearer: token, noOrigin: true, body: { password: PASSWORD } });
    expect(bearer.status).toBe(200);
    expect((await h.call('GET', '/jobs', { bearer: bearer.json.accessToken as string, noOrigin: true })).status).toBe(200);
  });

  it('writes no audit event for a read', async () => {
    const count = () => Number((h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n);
    const before = count();
    await h.call('GET', '/jobs', { cookie: owner.cookie });
    expect(count()).toBe(before);
  });
});
