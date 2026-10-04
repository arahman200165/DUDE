import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HubTransport } from '@dude/api-client';
import { formatPairingString } from '@dude/contracts/hub';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { createRpcServer } from '../rpc/server.js';
import { readDeviceRecord } from '../store/identity.js';
import { getEnrollment, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { RECONCILE_META, getReconcileRequired, getSyncState, resetHubBookkeeping, setReconcileRequired, updateSyncState } from '../store/repos/sync-state.repo.js';
import { CAPABILITIES, fakeDpapi } from '../testing/hub-harness.js';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { reconnectDevice } from './enroll.js';
import type { ReconnectDeps } from './enroll.js';
import { HubManagerError } from './errors.js';
import type { HubConnectionManager } from './hub-client.js';
import type { HubRuntime } from './index.js';

afterEach(cleanupTemp);

const SPKI = 'A'.repeat(43);
const NEW_INSTANCE = '0190a1b2-c3d4-7e5f-8a6b-1c2d3e4f5a6b';
const OLD_INSTANCE = '0190ffff-c3d4-7e5f-8a6b-1c2d3e4f5a6b';
const PAIRING = formatPairingString({ host: 'hub.local', port: 47600, code: 'ABCD2345', spkiSha256: SPKI });
const T0 = new Date('2026-02-01T00:00:00.000Z');
const NOW = new Date('2026-03-01T12:00:00.000Z');

type HubState = ReturnType<HubConnectionManager['status']>['state'];

const hello = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  service: 'dude-hub', protocolVersion: 1, minClientProtocol: 1, hubVersion: '1.0.0', hubInstanceId: NEW_INSTANCE, environmentId: 'env-new', bootstrapped: true,
  tls: { spkiSha256: SPKI, nextSpkiSha256: null }, authorityEpoch: 3, authorityState: 'active', ...overrides,
});

interface Wire { requests: string[]; enrollStatus: number; enrollBodies: unknown[] }

function setup(options: { state?: HubState; backupDir?: boolean; hubOverrides?: Record<string, unknown> } = {}) {
  const dir = tempDir();
  const store = openReady(dir, { capabilities: CAPABILITIES });
  const db = store.db;
  saveEnrollment(db, {
    hubInstanceId: OLD_INSTANCE, environmentId: 'env-old', hubUrl: 'https://old.hub:8443', protocolVersion: 1, spkiActive: 'B'.repeat(43), certActivePem: 'OLD-PEM',
    keyId: 'key-old', publicKey: new Uint8Array([1, 2, 3]), wrappedPrivateKey: new Uint8Array([9, 9, 9]), enrolledAt: T0.toISOString(), authorityEpoch: 2,
  }, T0);

  let state: HubState = options.state ?? 'authority-changed';
  const manager = {
    status: vi.fn(() => ({ state, enrollment: getEnrollment(db) })),
    start: vi.fn(() => { state = 'connecting'; }),
    stop: vi.fn(),
  } as unknown as HubConnectionManager & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

  const wire: Wire = { requests: [], enrollStatus: 200, enrollBodies: [] };
  const createTransport = (): HubTransport => ({
    async request(req) {
      wire.requests.push(`${req.method} ${req.path}`);
      if (req.path.endsWith('/hello')) return { status: 200, headers: {}, body: hello(options.hubOverrides) };
      if (req.path.endsWith('/devices/enroll')) {
        wire.enrollBodies.push(req.body);
        if (wire.enrollStatus !== 200) return { status: wire.enrollStatus, headers: {}, body: { error: { code: 'unauthorized', message: 'The pairing code was not accepted.' } } };
        const device = (req.body as { device: { deviceId: string } }).device;
        return { status: 200, headers: {}, body: { deviceId: device.deviceId, environmentId: 'env-new', hubInstanceId: NEW_INSTANCE, keyId: 'key-new', registeredAt: NOW.toISOString(), hubRevision: 0 } };
      }
      return { status: 404, headers: {}, body: {} };
    },
  });
  const probe = vi.fn(async (_host: string, _port: number, spki: string) => ({ matches: spki === SPKI, certPem: 'NEW-PEM', spki: SPKI }));
  const backupDir = path.join(dir, 'backups');
  const deps: ReconnectDeps = {
    db, dpapi: fakeDpapi(), now: () => NOW, device: () => readDeviceRecord(db, CAPABILITIES), manager, createTransport, probe,
    ...(options.backupDir === false ? {} : { backupDir }),
  };
  return { dir, store, db, manager, wire, probe, deps, backupDir };
}

const commit = async (store: ReturnType<typeof openReady>, name: string, order: number): Promise<void> => {
  const server = createRpcServer(store, { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)) });
  const response = await server.handle({ id: 1, method: 'entity.commit', params: { entityType: 'favorite', entityId: `tool:${name}`, op: 'upsert', payload: { id: `tool:${name}`, kind: 'tool', targetId: name, order } } });
  if (!response.ok) throw new Error(response.error.message);
  if (!(response.result as { ok: boolean }).ok) throw new Error(JSON.stringify(response.result));
};

/** Every row of a table as JSON, minus the named columns (the bookkeeping a re-enrollment resets). */
const dump = (db: Db, table: string, omit: readonly string[] = []): string =>
  JSON.stringify((db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all() as Array<Record<string, unknown>>).map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !omit.includes(k)))));
const enrollmentDump = (db: Db): string => JSON.stringify(db.prepare('SELECT * FROM hub_enrollment').all(), (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v));
const snapshots = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.startsWith('reconnect-') && f.endsWith('.db'));

async function seedLocalWork(ctx: ReturnType<typeof setup>): Promise<void> {
  await commit(ctx.store, 'a', 0);
  await commit(ctx.store, 'b', 1);
  // The bookkeeping of the previous registration: Hub revisions, bases, a cursor, a finished first sync and a raised flag.
  ctx.db.exec("UPDATE records SET hub_revision = 5, hub_payload_json = '{\"old\":true}'; UPDATE outbox SET based_on_revision = 4");
  ctx.db.exec("INSERT INTO kv_sync(namespace, key, hub_revision, base_json) VALUES('settings', 'theme', 3, '\"dark\"')");
  updateSyncState(ctx.db, { cursor: 7, floor: 2, firstSyncState: 'done', firstSyncAt: T0.toISOString(), lastSyncAt: T0.toISOString(), lastError: 'old' });
  setMeta(ctx.db, 'first_sync_progress', '{"x":1}');
  setMeta(ctx.db, 'sync_rebase_pending', '1');
  setReconcileRequired(ctx.db, 'cursor-ahead', T0, { cursor: 7, headRevision: 1 });
}

describe('resetHubBookkeeping', () => {
  it('leaves entities and outbox rows byte-identical except the bookkeeping columns it resets', async () => {
    const ctx = setup();
    await seedLocalWork(ctx);
    const outboxBefore = dump(ctx.db, 'outbox');
    expect(JSON.parse(outboxBefore)).toHaveLength(2);
    const recordsBefore = dump(ctx.db, 'records');
    const recordsStable = dump(ctx.db, 'records', ['hub_revision', 'hub_payload_json']);
    const outboxStable = dump(ctx.db, 'outbox', ['based_on_revision']);

    resetHubBookkeeping(ctx.db);

    expect(dump(ctx.db, 'records', ['hub_revision', 'hub_payload_json'])).toBe(recordsStable);
    expect(dump(ctx.db, 'outbox', ['based_on_revision'])).toBe(outboxStable);
    expect(dump(ctx.db, 'records')).not.toBe(recordsBefore);
    // The reset columns really were cleared, and nothing else.
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM records WHERE hub_revision IS NOT NULL OR hub_payload_json IS NOT NULL').get()).toEqual({ n: 0 });
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE based_on_revision IS NOT NULL').get()).toEqual({ n: 0 });
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 2 });
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM kv_sync').get()).toEqual({ n: 0 });
    expect(getSyncState(ctx.db)).toMatchObject({ cursor: 0, floor: 0, firstSyncState: 'pending', firstSyncAt: null, lastSyncAt: null, lastError: null });
    expect(getMeta(ctx.db, RECONCILE_META)).toBeUndefined();
    expect(getMeta(ctx.db, 'first_sync_progress')).toBeUndefined();
    expect(getMeta(ctx.db, 'sync_rebase_pending')).toBeUndefined();
  });
});

describe('reconnectDevice', () => {
  it('re-keys the same device against the new Hub, keeping local records and pending ops, and starts the manager', async () => {
    const ctx = setup();
    await seedLocalWork(ctx);
    const deviceId = ctx.store.device.deviceId;
    const recordsStable = dump(ctx.db, 'records', ['hub_revision', 'hub_payload_json']);
    const outboxStable = dump(ctx.db, 'outbox', ['based_on_revision']);
    const oldKey = getEnrollment(ctx.db)!.wrappedPrivateKey;

    const status = await reconnectDevice(PAIRING, ctx.deps);

    expect(ctx.manager.stop).toHaveBeenCalledOnce();
    expect(ctx.manager.start).toHaveBeenCalledOnce();
    expect(status.state).toBe('connecting');
    // The proof presents the SAME device id, with a freshly created key.
    expect(ctx.wire.enrollBodies).toHaveLength(1);
    expect(ctx.wire.enrollBodies[0]).toMatchObject({ pairingCode: 'ABCD2345', device: { deviceId } });
    const enrollment = getEnrollment(ctx.db)!;
    expect(enrollment).toMatchObject({
      state: 'enrolled', hubInstanceId: NEW_INSTANCE, environmentId: 'env-new', hubUrl: 'https://hub.local:47600', spkiActive: SPKI, certActivePem: 'NEW-PEM', keyId: 'key-new', authorityEpoch: 3,
      enrolledAt: NOW.toISOString(), revokedAt: null, lastContactAt: null,
    });
    expect(enrollment.wrappedPrivateKey).not.toEqual(oldKey);
    expect(ctx.store.device.deviceId).toBe(deviceId);
    expect(readDeviceRecord(ctx.db, CAPABILITIES).deviceId).toBe(deviceId);
    // Local data and the outbox are untouched; only the bookkeeping was reset.
    expect(dump(ctx.db, 'records', ['hub_revision', 'hub_payload_json'])).toBe(recordsStable);
    expect(dump(ctx.db, 'outbox', ['based_on_revision'])).toBe(outboxStable);
    expect(JSON.parse(dump(ctx.db, 'outbox'))).toHaveLength(2);
    expect(getSyncState(ctx.db)).toMatchObject({ cursor: 0, firstSyncState: 'pending' });
    expect(getReconcileRequired(ctx.db)).toBeNull();
    // A recovery snapshot was taken before anything changed.
    expect(snapshots(ctx.backupDir)).toHaveLength(1);
  });

  it.each(['authority-changed', 'untrusted-tls', 'revoked', 'incompatible'] as const)('is allowed while the connection is %s', async (state) => {
    const ctx = setup({ state });
    await expect(reconnectDevice(PAIRING, ctx.deps)).resolves.toBeDefined();
    expect(getEnrollment(ctx.db)?.hubInstanceId).toBe(NEW_INSTANCE);
  });

  it('is allowed for a revoked enrollment row and when only the reconcile flag is set', async () => {
    const revoked = setup({ state: 'offline' });
    revoked.db.prepare("UPDATE hub_enrollment SET state = 'revoked', revoked_at = ?").run(T0.toISOString());
    await expect(reconnectDevice(PAIRING, revoked.deps)).resolves.toBeDefined();
    expect(getEnrollment(revoked.db)?.state).toBe('enrolled');

    const flagged = setup({ state: 'online' });
    setReconcileRequired(flagged.db, 'epoch-lower', T0);
    await expect(reconnectDevice(PAIRING, flagged.deps)).resolves.toBeDefined();
    expect(getReconcileRequired(flagged.db)).toBeNull();
  });

  it.each(['online', 'offline', 'connecting', 'standalone'] as const)('refuses a healthy-and-consistent connection (%s) and changes nothing', async (state) => {
    const ctx = setup({ state });
    await commit(ctx.store, 'a', 0);
    const before = { enrollment: enrollmentDump(ctx.db), records: dump(ctx.db, 'records'), outbox: dump(ctx.db, 'outbox'), sync: JSON.stringify(getSyncState(ctx.db)) };
    await expect(reconnectDevice(PAIRING, ctx.deps)).rejects.toMatchObject({ name: 'HubManagerError', code: 'not-reconnectable' });
    expect({ enrollment: enrollmentDump(ctx.db), records: dump(ctx.db, 'records'), outbox: dump(ctx.db, 'outbox'), sync: JSON.stringify(getSyncState(ctx.db)) }).toEqual(before);
    expect(ctx.manager.stop).not.toHaveBeenCalled();
    expect(ctx.manager.start).not.toHaveBeenCalled();
    expect(ctx.probe).not.toHaveBeenCalled();
    expect(ctx.wire.requests).toEqual([]);
    expect(snapshots(ctx.backupDir)).toEqual([]);
  });

  it('refuses a device that is not enrolled', async () => {
    const ctx = setup();
    ctx.db.exec('DELETE FROM hub_enrollment');
    await expect(reconnectDevice(PAIRING, ctx.deps)).rejects.toMatchObject({ code: 'not-enrolled' });
    expect(ctx.manager.stop).not.toHaveBeenCalled();
    expect(ctx.wire.requests).toEqual([]);
  });

  it('rejects a malformed pairing string before looking at anything else', async () => {
    const ctx = setup();
    await expect(reconnectDevice('nonsense', ctx.deps)).rejects.toMatchObject({ code: 'invalid-pairing-string' });
    expect(ctx.manager.stop).not.toHaveBeenCalled();
  });

  it('leaves everything unchanged when the pin probe, compatibility or hello pin check fails (the loop is never stopped)', async () => {
    const mismatch = setup();
    mismatch.probe.mockResolvedValueOnce({ matches: false, certPem: 'X', spki: 'X' });
    const before = enrollmentDump(mismatch.db);
    await expect(reconnectDevice(PAIRING, mismatch.deps)).rejects.toMatchObject({ code: 'tls-pin-mismatch' });
    expect(enrollmentDump(mismatch.db)).toBe(before);
    expect(mismatch.manager.stop).not.toHaveBeenCalled();
    expect(mismatch.wire.requests).toEqual([]);

    const unreachable = setup();
    unreachable.probe.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(reconnectDevice(PAIRING, unreachable.deps)).rejects.toMatchObject({ code: 'hub-unreachable' });
    expect(unreachable.manager.stop).not.toHaveBeenCalled();

    const incompatible = setup({ hubOverrides: { protocolVersion: 99, minClientProtocol: 98 } });
    await expect(reconnectDevice(PAIRING, incompatible.deps)).rejects.toMatchObject({ code: 'incompatible' });
    expect(incompatible.manager.stop).not.toHaveBeenCalled();

    const wrongKey = setup({ hubOverrides: { tls: { spkiSha256: 'C'.repeat(43), nextSpkiSha256: null } } });
    await expect(reconnectDevice(PAIRING, wrongKey.deps)).rejects.toMatchObject({ code: 'tls-pin-mismatch' });
    expect(wrongKey.manager.stop).not.toHaveBeenCalled();
    expect(getEnrollment(wrongKey.db)?.hubInstanceId).toBe(OLD_INSTANCE);
  });

  it('keeps the enrollment, data and bookkeeping and restarts the manager when the Hub rejects the code', async () => {
    const ctx = setup();
    await seedLocalWork(ctx);
    ctx.wire.enrollStatus = 401;
    const before = { enrollment: enrollmentDump(ctx.db), records: dump(ctx.db, 'records'), outbox: dump(ctx.db, 'outbox'), sync: JSON.stringify(getSyncState(ctx.db)), flag: getMeta(ctx.db, RECONCILE_META) };

    await expect(reconnectDevice(PAIRING, ctx.deps)).rejects.toMatchObject({ code: 'pairing-rejected' });

    expect({ enrollment: enrollmentDump(ctx.db), records: dump(ctx.db, 'records'), outbox: dump(ctx.db, 'outbox'), sync: JSON.stringify(getSyncState(ctx.db)), flag: getMeta(ctx.db, RECONCILE_META) }).toEqual(before);
    expect(ctx.manager.stop).toHaveBeenCalledOnce();
    expect(ctx.manager.start).toHaveBeenCalledOnce();
    // The snapshot taken first stays; it is harmless and the next attempt takes another.
    expect(snapshots(ctx.backupDir)).toHaveLength(1);
  });

  it('aborts with a clear error, unchanged and without contacting the Hub, when the recovery snapshot cannot be taken', async () => {
    const ctx = setup();
    await seedLocalWork(ctx);
    // A file where the snapshot folder must be: creating the directory fails.
    const blocker = path.join(ctx.dir, 'blocked');
    ctx.deps.backupDir = path.join(blocker, 'backups');
    writeFileSync(blocker, 'not a folder');
    const before = { enrollment: enrollmentDump(ctx.db), records: dump(ctx.db, 'records'), outbox: dump(ctx.db, 'outbox'), sync: JSON.stringify(getSyncState(ctx.db)), flag: getMeta(ctx.db, RECONCILE_META) };

    const error = await reconnectDevice(PAIRING, ctx.deps).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HubManagerError);
    expect(error).toMatchObject({ code: 'snapshot-failed' });
    expect((error as Error).message).toContain('recovery snapshot');
    expect({ enrollment: enrollmentDump(ctx.db), records: dump(ctx.db, 'records'), outbox: dump(ctx.db, 'outbox'), sync: JSON.stringify(getSyncState(ctx.db)), flag: getMeta(ctx.db, RECONCILE_META) }).toEqual(before);
    expect(ctx.wire.enrollBodies).toEqual([]);
    expect(ctx.manager.stop).toHaveBeenCalledOnce();
    expect(ctx.manager.start).toHaveBeenCalledOnce();
  });

  it('takes no snapshot when no folder is configured, and still reconnects', async () => {
    const ctx = setup({ backupDir: false });
    await expect(reconnectDevice(PAIRING, ctx.deps)).resolves.toBeDefined();
    expect(snapshots(ctx.backupDir)).toEqual([]);
  });
});

describe('hub.reconnect RPC', () => {
  const server = (reconnect: HubRuntime['reconnect'], afterReset = vi.fn()) => {
    const store = openReady(tempDir());
    const hub = { reconnect, manager: {} } as unknown as HubRuntime;
    const sync = { afterReset } as unknown as NonNullable<Parameters<typeof createRpcServer>[1]['sync']>;
    return { rpc: createRpcServer(store, { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub, sync }), afterReset };
  };
  const call = (rpc: ReturnType<typeof server>['rpc'], params: unknown) => rpc.handle({ id: 1, method: 'hub.reconnect', params: params as never });

  it('rejects any request without acknowledged === true, before the runtime is reached', async () => {
    const reconnect = vi.fn(async () => ({}) as never);
    const { rpc } = server(reconnect);
    for (const params of [{ pairingString: PAIRING }, { pairingString: PAIRING, acknowledged: false }, { pairingString: PAIRING, acknowledged: 'true' }, { pairingString: PAIRING, acknowledged: 1 }, {}]) {
      const response = await call(rpc, params);
      expect(response, JSON.stringify(params)).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    }
    expect(await call(rpc, { pairingString: '', acknowledged: true })).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('reconnects when acknowledged, drops the old in-memory sync state, and maps typed errors to their code', async () => {
    const status = { state: 'connecting' } as never;
    const reconnect = vi.fn<HubRuntime['reconnect']>(async () => status);
    const { rpc, afterReset } = server(reconnect);
    expect(await call(rpc, { pairingString: PAIRING, acknowledged: true })).toMatchObject({ ok: true, result: { state: 'connecting' } });
    expect(reconnect).toHaveBeenCalledExactlyOnceWith(PAIRING);
    expect(afterReset).toHaveBeenCalledOnce();

    reconnect.mockRejectedValueOnce(new HubManagerError('not-reconnectable', 'nothing to reconnect'));
    expect(await call(rpc, { pairingString: PAIRING, acknowledged: true })).toMatchObject({ ok: false, error: { code: 'not-reconnectable', message: 'nothing to reconnect' } });
    expect(afterReset).toHaveBeenCalledOnce();
  });
});
