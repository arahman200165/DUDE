import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import type { HubJobsResponse, HubNotificationsResponse } from '@dude/contracts/hub';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import type { HubRuntime } from '../hub/index.js';
import { createRpcServer } from './server.js';

afterEach(cleanupTemp);

const NOW = new Date('2026-10-24T12:00:00.000Z');
const LIST: HubNotificationsResponse = {
  notifications: [{ id: 'n1', createdAt: '2026-10-24T11:00:00.000Z', kind: 'backup-failed', severity: 'error', title: 'Backup failed', body: 'No space.', readAt: null, dismissedAt: null }],
  unread: 1,
};

/** An RPC server whose Hub runtime has the given owner state and a device-token path; each call records which credential it used. */
function server(api: Partial<Record<keyof HubClient, unknown>>, options: { ownerSignedIn: boolean; deviceStatus?: number }) {
  const withOwner = vi.fn(async (fn: (client: HubClient, token: string) => Promise<unknown>) => fn(api as unknown as HubClient, 'owner-token'));
  const deviceCall = vi.fn(async (fn: (client: HubClient, token: string) => Promise<unknown>) => {
    if (options.deviceStatus !== undefined) throw new HubApiError(options.deviceStatus, 'forbidden', 'This device may not read notifications.');
    return fn(api as unknown as HubClient, 'device-token');
  });
  const manager = { owner: { status: () => ({ signedIn: options.ownerSignedIn, displayName: null, expiresAt: null }), withOwner }, deviceCall };
  const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub: { manager } as unknown as HubRuntime });
  const call = (method: string, params: unknown) => rpc.handle({ id: 1, method, params: params as never } as never);
  return { call, withOwner, deviceCall };
}

describe('notifications.* (PD-109, PD-110)', () => {
  it('lists with the owner bearer when the owner is signed in on this agent', async () => {
    const listNotifications = vi.fn(async () => LIST);
    const { call, withOwner, deviceCall } = server({ listNotifications }, { ownerSignedIn: true });
    expect(await call('notifications.list', {})).toMatchObject({ ok: true, result: LIST });
    expect(listNotifications).toHaveBeenCalledExactlyOnceWith('owner-token');
    expect(withOwner).toHaveBeenCalledOnce();
    expect(deviceCall).not.toHaveBeenCalled();
  });

  it('lists with the device token when no owner is signed in', async () => {
    const listNotifications = vi.fn(async () => LIST);
    const { call, withOwner } = server({ listNotifications }, { ownerSignedIn: false });
    expect(await call('notifications.list', {})).toMatchObject({ ok: true, result: LIST });
    expect(listNotifications).toHaveBeenCalledExactlyOnceWith('device-token');
    expect(withOwner).not.toHaveBeenCalled();
  });

  it('answers a Hub refusal of the device (no grant) with notifications-unavailable, not a hub-* error', async () => {
    const listNotifications = vi.fn();
    const { call } = server({ listNotifications }, { ownerSignedIn: false, deviceStatus: 403 });
    expect(await call('notifications.list', {})).toMatchObject({ ok: false, error: { code: 'notifications-unavailable' } });
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it('marks the listed ids or everything read, and rejects any other shape before the Hub is called', async () => {
    const markNotificationsRead = vi.fn(async () => ({ ok: true as const }));
    const { call } = server({ markNotificationsRead }, { ownerSignedIn: true });
    expect(await call('notifications.markRead', { ids: ['n1', 'n2'] })).toMatchObject({ ok: true });
    expect(await call('notifications.markRead', { all: true })).toMatchObject({ ok: true });
    expect(markNotificationsRead.mock.calls).toEqual([['owner-token', { ids: ['n1', 'n2'] }], ['owner-token', { all: true }]]);
    markNotificationsRead.mockClear();
    const bad: unknown[] = [{}, { ids: [] }, { ids: 'n1' }, { ids: [1] }, { ids: ['n1', 'n1'] }, { ids: ['a'.repeat(65)] }, { all: false }, { all: true, ids: ['n1'] }, { ids: ['n1'], extra: 1 }, { ids: Array.from({ length: 101 }, (_, i) => `n${i}`) }];
    for (const params of bad) expect(await call('notifications.markRead', params), JSON.stringify(params).slice(0, 60)).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it('dismisses one notification by id and rejects a missing or oversized id', async () => {
    const dismissNotification = vi.fn(async () => ({ ok: true as const }));
    const { call } = server({ dismissNotification }, { ownerSignedIn: true });
    expect(await call('notifications.dismiss', { id: 'n1' })).toMatchObject({ ok: true });
    expect(dismissNotification).toHaveBeenCalledExactlyOnceWith('owner-token', 'n1');
    for (const params of [{}, { id: '' }, { id: 5 }, { id: 'a'.repeat(65) }]) expect(await call('notifications.dismiss', params)).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    expect(dismissNotification).toHaveBeenCalledOnce();
  });
});

describe('hub.owner.jobs (PD-112)', () => {
  const JOBS: HubJobsResponse = { jobs: [{ id: 'backup-schedule', intervalMs: 3_600_000, running: false, lastStartedAt: null, lastFinishedAt: null, lastOutcome: null, lastSummary: null, nextDueAt: null }] };

  it('reads the jobs with the owner bearer only', async () => {
    const listJobs = vi.fn(async () => JOBS);
    const { call, withOwner, deviceCall } = server({ listJobs }, { ownerSignedIn: true });
    expect(await call('hub.owner.jobs', {})).toMatchObject({ ok: true, result: JOBS });
    expect(listJobs).toHaveBeenCalledExactlyOnceWith('owner-token');
    expect(withOwner).toHaveBeenCalledOnce();
    expect(deviceCall).not.toHaveBeenCalled();
  });
});
