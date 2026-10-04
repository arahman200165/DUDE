import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatPairingString, parsePairingString } from '@dude/contracts/hub';
import { getEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { getReconcileRequired, getSyncState } from '../store/repos/sync-state.repo.js';
import { fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { cleanupTemp } from '../testing/test-utils.js';
import { createPinnedTransport } from './pinned-transport.js';

/**
 * PD-073: a device that finds a changed Hub authority (a different instance, a retired Hub, a lower epoch) stops every Hub call and
 * sync, keeps its enrollment, data and outbox, and takes one recovery snapshot. One real Hub process (the compiled bundle) and one real
 * Device Agent; the Hub authority is changed by editing its `meta` table while it is stopped, the instance id through the transport.
 */
const PASSWORD = 'correct horse battery staple';

let hub: HubHandle;
let agent: Agent;

/** The wire seen from the device: records every request and can rewrite what the Hub says about itself. */
const wire = { requests: [] as string[], helloInstance: null as string | null, stripAuthority: false };
const createTransport = (target: Parameters<typeof createPinnedTransport>[0]): ReturnType<typeof createPinnedTransport> => {
  const real = createPinnedTransport(target);
  return {
    async request(req) {
      wire.requests.push(`${req.method} ${req.path}`);
      const response = await real.request(req);
      const isHello = req.path.endsWith('/hello');
      const isToken = req.path.endsWith('/auth/device/token');
      if (response.status === 200 && (isHello || isToken) && response.body !== null && typeof response.body === 'object') {
        const body = { ...(response.body as Record<string, unknown>) };
        if (isHello && wire.helloInstance !== null) body['hubInstanceId'] = wire.helloInstance;
        if (wire.stripAuthority) { delete body['authorityEpoch']; delete body['authorityState']; }
        return { ...response, body };
      }
      return response;
    },
  };
};

const setHubAuthority = async (epoch: number, state: 'active' | 'transferred'): Promise<void> => {
  await hub.stop();
  const db = new DatabaseSync(path.join(hub.dir, 'data', 'dude.db'));
  try {
    const upsert = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('authority_epoch', String(epoch));
    upsert.run('authority_state', state);
  } finally { db.close(); }
  await hub.restart();
};

const state = (): string => agent.hub.manager.status().state;
const credentialRequests = (from: number): string[] => wire.requests.slice(from).filter((r) => /\/(auth\/device|sync)\//.test(r));
const snapshots = (): string[] => (existsSync(path.join(agent.dir, 'backups')) ? readdirSync(path.join(agent.dir, 'backups')) : []).filter((f) => f.startsWith('authority-changed-'));
const storedEpoch = (): number => getEnrollment(agent.store.db)?.authorityEpoch ?? 0;
const dump = (sql: string): string => JSON.stringify(agent.store.db.prepare(sql).all(), (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v));
const restart = (): void => { agent.hub.manager.stop(); agent.hub.manager.start(); };
const settle = (ms = 1_200): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  hub = await startHub({ bootstrap: { password: PASSWORD } });
  agent = startAgent(fakeDpapi(), { createTransport });
  await agent.rpc('hub.enroll', { pairingString: await hub.pairingString(PASSWORD) });
  await waitFor('online', () => state() === 'online');
}, 90_000);

afterAll(async () => {
  stopAgents();
  await hub?.dispose();
  cleanupTemp();
}, 30_000);

describe('device agent against a changed Hub authority', { timeout: 90_000 }, () => {
  it('stores the epoch at enrollment and reports no authority problem', () => {
    expect(storedEpoch()).toBe(1);
    expect(agent.hub.manager.status().authority).toBeNull();
    expect(agent.hub.manager.status().enrollment?.authorityEpoch).toBe(1);
  });

  it('stops on a different instance id: no credential request, nothing deleted, not revoked, one snapshot', async () => {
    wire.helloInstance = '0190a1b2-c3d4-7e5f-8a6b-1c2d3e4f5a6b';
    const before = wire.requests.length;
    restart();
    await waitFor('authority-changed', () => state() === 'authority-changed');

    const status = agent.hub.manager.status();
    expect(status.authority).toEqual({ reason: 'instance-changed', hubInstanceId: '0190a1b2-c3d4-7e5f-8a6b-1c2d3e4f5a6b', epoch: 1 });
    expect(status.lastError).toContain('different Hub');
    expect(state()).not.toBe('revoked');

    // Work done after the stop stays queued, and nothing runs against the Hub.
    await agent.rpc('entity.commit', { entityType: 'favorite', entityId: 'tool:authority', op: 'upsert', payload: { id: 'tool:authority', kind: 'tool', targetId: 'authority', order: 0 } });
    const enrollmentBefore = dump('SELECT * FROM hub_enrollment');
    const outboxBefore = dump('SELECT * FROM outbox');
    expect(JSON.parse(outboxBefore)).toHaveLength(1);
    const sync = await agent.rpc('sync.now', {});
    expect(sync.phase).toBe('needs-reconcile');
    await settle();
    expect(state()).toBe('authority-changed');
    expect(credentialRequests(before)).toEqual([]);
    expect(dump('SELECT * FROM hub_enrollment')).toBe(enrollmentBefore);
    expect(dump('SELECT * FROM outbox')).toBe(outboxBefore);
    expect(snapshots()).toHaveLength(1);

    // A restart that still finds the mismatch lands in the same place and does not repeat the snapshot.
    restart();
    await waitFor('authority-changed again', () => state() === 'authority-changed');
    expect(credentialRequests(before)).toEqual([]);
    expect(snapshots()).toHaveLength(1);
  });

  it('resumes normal operation when the Hub is the enrolled one again', async () => {
    wire.helloInstance = null;
    restart();
    await waitFor('online', () => state() === 'online');
    expect(agent.hub.manager.status().authority).toBeNull();
  });

  it('raises the stored epoch when the Hub reports a higher one', async () => {
    await setHubAuthority(3, 'active');
    await waitFor('epoch raised', () => storedEpoch() === 3, 30_000);
    await waitFor('online', () => state() === 'online', 30_000);
    expect(agent.hub.manager.status().enrollment?.authorityEpoch).toBe(3);
  });

  it('stops on a transferred Hub', async () => {
    const taken = snapshots().length;
    await setHubAuthority(3, 'transferred');
    restart();
    await waitFor('transferred', () => agent.hub.manager.status().authority?.reason === 'transferred', 30_000);
    expect(state()).toBe('authority-changed');
    expect(getEnrollment(agent.store.db)?.state).toBe('enrolled');
    expect((await agent.rpc('sync.status', {})).phase).toBe('needs-reconcile');
    await waitFor('another snapshot', () => snapshots().length === taken + 1);
  });

  it('stops on a lower epoch reported by hello', async () => {
    await setHubAuthority(2, 'active');
    restart();
    await waitFor('epoch-lower', () => agent.hub.manager.status().authority?.reason === 'epoch-lower', 30_000);
    expect(agent.hub.manager.status().authority?.epoch).toBe(2);
    expect(storedEpoch()).toBe(3);
  });

  it('stops on a lower epoch reported only by the realtime welcome, then recovers at a higher one', async () => {
    wire.stripAuthority = true;
    const before = wire.requests.length;
    restart();
    await waitFor('epoch-lower via welcome', () => state() === 'authority-changed', 30_000);
    expect(agent.hub.manager.status().authority).toMatchObject({ reason: 'epoch-lower', epoch: 2 });
    // Neither hello nor token said anything, so the device got as far as a token before the welcome stopped it.
    expect(credentialRequests(before).some((r) => r.includes('/auth/device/token'))).toBe(true);
    wire.stripAuthority = false;
    await setHubAuthority(4, 'active');
    restart();
    await waitFor('online at epoch 4', () => state() === 'online' && storedEpoch() === 4, 30_000);
    expect(agent.hub.manager.status().authority).toBeNull();
  });
});

/**
 * PD-072/PD-073 end to end: a restored Hub (new instance id, higher epoch, every desktop row `needs_re_pair` with its keys revoked) is
 * detected by the device, which keeps its data and pending edits; the owner creates a re-attach code for that device row and the device
 * reconnects with the SAME device id. The Hub is "restored" by editing its database while it is stopped.
 */
describe('device agent reconnecting to a restored Hub', { timeout: 120_000 }, () => {
  const RESTORED_INSTANCE = '0190c0de-c3d4-7e5f-8a6b-1c2d3e4f5a6b';
  const reconnectSnapshots = (): string[] => (existsSync(path.join(agent.dir, 'backups')) ? readdirSync(path.join(agent.dir, 'backups')) : []).filter((f) => /^reconnect-.*\.db$/.test(f));
  const rows = (table: string, omit: readonly string[] = []): string =>
    JSON.stringify((agent.store.db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all() as Array<Record<string, unknown>>).map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !omit.includes(k)))));
  const reattachCode = async (deviceId: string): Promise<string> => {
    const headers = await hub.ownerHeaders(PASSWORD);
    const response = await hub.request('POST', '/api/v1/pairing-codes', { host: '127.0.0.1', reattachDeviceId: deviceId }, headers);
    expect(response.status).toBe(200);
    expect(response.body['reattachDeviceId']).toBe(deviceId);
    return String(response.body['pairingString']);
  };
  const restoreHub = async (deviceId: string): Promise<void> => {
    await hub.stop();
    const db = new DatabaseSync(path.join(hub.dir, 'data', 'dude.db'));
    try {
      const upsert = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      upsert.run('hub_instance_id', RESTORED_INSTANCE);
      upsert.run('authority_epoch', '5');
      upsert.run('authority_state', 'active');
      db.prepare('UPDATE devices SET needs_re_pair = 1 WHERE device_id = ?').run(deviceId);
      db.prepare('UPDATE device_keys SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), deviceId);
    } finally { db.close(); }
    await hub.restart();
  };

  it('refuses to reconnect a healthy, consistent device and changes nothing', async () => {
    expect(state()).toBe('online');
    const snapshot = (): { enrollment: string; outbox: string } => ({ enrollment: rows('hub_enrollment', ['last_contact_at', 'updated_at']), outbox: rows('outbox') });
    const before = snapshot();
    await expect(agent.rpc('hub.reconnect', { pairingString: await hub.pairingString(PASSWORD), acknowledged: true })).rejects.toMatchObject({ code: 'not-reconnectable' });
    expect(snapshot()).toEqual(before);
    expect(state()).toBe('online');
    expect(reconnectSnapshots()).toEqual([]);
  });

  it('reconnects after a restore: same device id, data and pending edits kept, bookkeeping reset, snapshot taken', async () => {
    const deviceId = agent.store.device.deviceId;
    await agent.rpc('entity.commit', { entityType: 'favorite', entityId: 'tool:restored', op: 'upsert', payload: { id: 'tool:restored', kind: 'tool', targetId: 'restored', order: 1 } });
    expect(JSON.parse(dump('SELECT * FROM outbox')).length).toBeGreaterThanOrEqual(2);
    const oldEnrollment = getEnrollment(agent.store.db)!;

    await restoreHub(deviceId);
    agent.hub.manager.stop();
    agent.hub.manager.start();
    await waitFor('authority-changed after the restore', () => state() === 'authority-changed', 30_000);
    expect(agent.hub.manager.status().authority).toMatchObject({ reason: 'instance-changed', hubInstanceId: RESTORED_INSTANCE });
    expect((await agent.rpc('sync.status', {})).phase).toBe('needs-reconcile');
    await agent.rpc('entity.commit', { entityType: 'favorite', entityId: 'tool:offline-edit', op: 'upsert', payload: { id: 'tool:offline-edit', kind: 'tool', targetId: 'offline-edit', order: 2 } });
    expect(await agent.rpc('sync.now', {})).toMatchObject({ phase: 'needs-reconcile' });

    const recordsStable = rows('records', ['hub_revision', 'hub_payload_json']);
    const outboxStable = rows('outbox', ['based_on_revision']);
    expect((JSON.parse(outboxStable) as unknown[]).length).toBeGreaterThanOrEqual(3);

    // A wrong code changes nothing and puts the device back into its blocked state.
    const good = await reattachCode(deviceId);
    const parts = parsePairingString(good)!;
    const wrong = formatPairingString({ ...parts, code: parts.code === 'ZZZZZZZZ' ? 'YYYYYYYY' : 'ZZZZZZZZ' });
    const enrollmentStable = (): string => rows('hub_enrollment', ['last_contact_at', 'updated_at']);
    const enrollmentBefore = enrollmentStable();
    await expect(agent.rpc('hub.reconnect', { pairingString: wrong, acknowledged: true })).rejects.toMatchObject({ code: 'pairing-rejected' });
    expect(enrollmentStable()).toBe(enrollmentBefore);
    expect(rows('outbox', ['based_on_revision'])).toBe(outboxStable);
    await waitFor('blocked again after the failed reconnect', () => state() === 'authority-changed', 30_000);
    // Without the acknowledgement the request is refused outright.
    await expect(agent.rpc('hub.reconnect', { pairingString: good, acknowledged: false as never })).rejects.toMatchObject({ code: 'invalid-params' });
    expect(enrollmentStable()).toBe(enrollmentBefore);

    const status = await agent.rpc('hub.reconnect', { pairingString: good, acknowledged: true });
    expect(status.enrollment).toMatchObject({ hubInstanceId: RESTORED_INSTANCE, authorityEpoch: 5, state: 'enrolled' });
    await waitFor('online on the restored Hub', () => state() === 'online', 30_000);

    const enrollment = getEnrollment(agent.store.db)!;
    expect(enrollment.hubInstanceId).toBe(RESTORED_INSTANCE);
    expect(enrollment.hubInstanceId).not.toBe(oldEnrollment.hubInstanceId);
    expect(enrollment.authorityEpoch).toBe(5);
    expect(enrollment.keyId).not.toBe(oldEnrollment.keyId);
    expect(agent.store.device.deviceId).toBe(deviceId);
    expect(agent.hub.manager.status().authority).toBeNull();
    // Pending edits and records are exactly what they were, apart from the bookkeeping columns.
    expect(rows('records', ['hub_revision', 'hub_payload_json'])).toBe(recordsStable);
    expect(rows('outbox', ['based_on_revision'])).toBe(outboxStable);
    // First sync starts over with the preview; nothing was shared, and the reconcile block is gone.
    expect(getSyncState(agent.store.db)).toMatchObject({ firstSyncState: 'pending', cursor: 0 });
    expect(getReconcileRequired(agent.store.db)).toBeNull();
    expect((await agent.rpc('sync.status', {})).phase).toBe('needs-first-sync');
    // Two attempts took a snapshot each (the rejected code one included).
    expect(reconnectSnapshots()).toHaveLength(2);

    // The Hub knows the device again: the owner sees the row online and no longer awaiting re-pair.
    await agent.rpc('hub.owner.signIn', { password: PASSWORD });
    const devices = await agent.rpc('hub.owner.listDevices', {});
    expect(devices.find((d) => d.deviceId === deviceId)).toMatchObject({ online: true, current: true, revokedAt: null, unenrolledAt: null });
  });
});
