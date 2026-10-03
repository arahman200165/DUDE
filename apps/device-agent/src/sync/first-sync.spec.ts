import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentHubStatus } from '@dude/contracts';
import type { SyncRecord, SyncSnapshotResponse } from '@dude/contracts/hub';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from '../store/entity-commit.js';
import { saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { listOutbox } from '../store/repos/outbox.repo.js';
import { listRecords } from '../store/repos/records.repo.js';
import { listConflicts } from '../store/repos/sync-conflicts.repo.js';
import { getSyncState, resetHubBookkeeping } from '../store/repos/sync-state.repo.js';
import { workingEnvironmentId } from '../store/environment.js';
import { createSyncRuntime } from './sync-runtime.js';
import type { SyncManagerPort, SyncRuntime } from './sync-runtime.js';
import { readLocal } from './sync-entities.js';
import type { SyncCategory } from '@dude/sync';

const runtimes: SyncRuntime[] = [];
afterEach(() => { for (const r of runtimes.splice(0)) r.stop(); cleanupTemp(); });

const T0 = new Date('2026-02-01T00:00:00.000Z');
const ENROLL = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(),
};
const rec = (entityType: string, entityId: string, revision: number, payload: unknown): SyncRecord => ({
  entityType, entityId, revision, deleted: false, payload, schemaVersion: 1, updatedAt: '2026-02-01T00:00:00.000Z', updatedByDeviceId: 'other',
});
const fav = (id: string, order = 0) => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });
const pipe = (id: string, over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, id, name: 'P', description: 'd', steps: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

function setup(hubRecords: SyncRecord[], options: { afterCategory?: (c: SyncCategory) => void; asOf?: number } = {}) {
  const dir = tempDir();
  const store = openReady(dir);
  saveEnrollment(store.db, ENROLL, T0);
  const commit = commitContext(store);
  let clock = T0.getTime();
  const hub: AgentHubStatus = {
    state: 'online', lastError: null, lastContactAt: null, ownerSignedIn: false, hubVersion: '1', recoveryTrusted: null,  pendingOps: 0,
    enrollment: {
      state: 'enrolled', hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a',
      spkiNext: null, enrolledAt: T0.toISOString(), lastContactAt: null, revokedAt: null,
    },
  };
  const records = { current: hubRecords };
  const api = {
    syncPush: vi.fn(async (_t: string, ops: readonly { opId: string }[]) => ({ results: ops.map((o, i) => ({ opId: o.opId, status: 'applied' as const, revision: 100 + i })), headRevision: 200 })),
    syncChanges: vi.fn(async () => ({ changes: [] as SyncRecord[], cursor: options.asOf ?? 50, hasMore: false, floor: 0, headRevision: options.asOf ?? 50 })),
    syncSnapshot: vi.fn(async (): Promise<SyncSnapshotResponse> => ({ records: records.current, asOfRevision: options.asOf ?? 50, next: null, floor: 0 })),
    syncReportState: vi.fn(async () => ({ floor: 0, headRevision: 200, retentionDays: 90 })),
  };
  const manager: SyncManagerPort = {
    status: () => hub, onChange: () => () => undefined, hubProtocol: () => 2, onChangesAvailable: () => () => undefined,
    deviceCall: (async (fn: (api: unknown, token: string) => Promise<unknown>) => fn(api, 'tok')) as SyncManagerPort['deviceCall'],
  };
  let seq = 0;
  let tokenSeq = 0;
  const runtime = createSyncRuntime({
    db: store.db, manager, now: () => new Date(clock), newOpId: () => `op-${(seq += 1)}`,
    intervals: { debounceMs: 5, pollMs: 60_000, backoffMinMs: 20, backoffMaxMs: 80, reportMinIntervalMs: 60_000 },
    newToken: () => `token-${(tokenSeq += 1)}`, backupDir: path.join(dir, 'backups'), afterFirstSyncCategory: options.afterCategory,
  });
  runtimes.push(runtime);
  runtime.start();
  const put = (entityType: string, entityId: string, payload: unknown) => {
    const r = commitEntity(store.db, commit, { entityType, entityId, op: 'upsert', payload });
    if (!r.ok) throw new Error(r.error);
  };
  return { store, runtime, api, records, dir, put, advance: (ms: number) => { clock += ms; } };
}

const ids = (db: ReturnType<typeof openReady>['db'], type: string): string[] => listRecords(db, type).map((r) => r.entityId);
const cat = (preview: Awaited<ReturnType<SyncRuntime['firstSyncPreview']>>, id: SyncCategory) => preview.categories.find((c) => c.category === id)!;

describe('firstSyncPreview', () => {
  it('counts per category, finds same-id differences and same-name collisions, and discloses uploads', async () => {
    const t = setup([
      rec('favorite', 'tool:a', 3, fav('a')), rec('favorite', 'tool:b', 4, fav('b', 9)), rec('favorite', 'tool:hub-only', 5, fav('hub-only')),
      rec('pipeline', 'ph', 6, pipe('ph', { name: 'Shared' })),
    ]);
    t.put('favorite', 'tool:a', fav('a'));
    t.put('favorite', 'tool:b', fav('b', 1));
    t.put('favorite', 'tool:local-only', fav('local-only'));
    t.put('pipeline', 'pl', pipe('pl', { name: 'Shared' }));
    const preview = await t.runtime.firstSyncPreview();
    expect(preview.asOfRevision).toBe(50);
    expect(preview.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.confirmToken).toBe('token-1');
    expect(cat(preview, 'favorites')).toMatchObject({
      localCount: 3, hubCount: 3, sameIdIdentical: 1, localOnly: 1, hubOnly: 1, recommended: 'merge', sensitivity: 'non-sensitive',
      sameIdDifferent: [{ entityType: 'favorite', entityId: 'tool:b' }],
    });
    expect(cat(preview, 'favorites').disclosure).toContain('2 favorites');
    expect(cat(preview, 'pipelines').sameNameDifferentId).toEqual([{ entityType: 'pipeline', name: 'Shared', localId: 'pl', hubId: 'ph' }]);
    expect(cat(preview, 'scratchpad')).toMatchObject({ recommended: 'keep-local', sensitivity: 'sensitive' });
    expect(cat(preview, 'scratchpad').disclosure).toContain('sensitive');
    // Nothing was written.
    expect(ids(t.store.db, 'favorite').sort()).toEqual(['tool:a', 'tool:b', 'tool:local-only']);
    expect(getSyncState(t.store.db).firstSyncState).toBe('pending');
  });

  it('issues no token when this device has nothing to lose', async () => {
    const t = setup([rec('favorite', 'tool:a', 3, fav('a'))]);
    expect((await t.runtime.firstSyncPreview()).confirmToken).toBeNull();
  });
});

describe('merge', () => {
  it('combines both sides, queues local-only work, records conflicts and re-keys', async () => {
    const t = setup([
      rec('favorite', 'tool:same', 3, fav('same')), rec('favorite', 'tool:diff', 4, fav('diff', 9)), rec('favorite', 'tool:hub-only', 5, fav('hub-only')),
      rec('pipeline', 'pc', 6, pipe('pc', { name: 'Theirs' })), rec('pipeline', 'ph', 7, pipe('ph', { name: 'Shared' })),
    ]);
    t.put('favorite', 'tool:same', fav('same'));
    t.put('favorite', 'tool:diff', fav('diff', 1));
    t.put('favorite', 'tool:local-only', fav('local-only'));
    t.put('pipeline', 'pc', pipe('pc', { name: 'Mine' }));
    t.put('pipeline', 'pl', pipe('pl', { name: 'Shared' }));
    const preview = await t.runtime.firstSyncPreview();
    const status = await t.runtime.firstSyncApply({ choices: {}, digest: preview.digest });
    const db = t.store.db;

    expect(getSyncState(db)).toMatchObject({ firstSyncState: 'done', cursor: 50 });
    // Identical: only the base is recorded, no op. Different lww: local value kept and queued on the Hub revision.
    expect(readLocal(db, 'favorite', 'tool:same')).toMatchObject({ hubRevision: 3 });
    expect(readLocal(db, 'favorite', 'tool:diff')).toMatchObject({ payload: fav('diff', 1), hubRevision: 4 });
    const ops = new Map(listOutbox(db, 50).map((o) => [o.entityId, o]));
    expect(ops.has('tool:same')).toBe(false);
    expect(ops.get('tool:diff')).toMatchObject({ opKind: 'upsert', basedOnRevision: 4, status: 'pending' });
    // Hub-only applies locally; local-only uploads from scratch.
    expect(readLocal(db, 'favorite', 'tool:hub-only')).toMatchObject({ exists: true, hubRevision: 5 });
    expect(ops.has('tool:hub-only')).toBe(false);
    expect(ops.get('tool:local-only')).toMatchObject({ basedOnRevision: null, status: 'pending' });
    // merge3 difference: inbox conflict keeps the local version, the Hub version applied, no op.
    expect(listConflicts(db)).toMatchObject([{ entityType: 'pipeline', entityId: 'pc', kind: 'first-sync', localPayload: { name: 'Mine' }, remotePayload: { name: 'Theirs' }, remoteRevision: 6 }]);
    expect(readLocal(db, 'pipeline', 'pc').payload).toMatchObject({ name: 'Theirs' });
    expect(ops.has('pc')).toBe(false);
    // Same name, different id: both kept, the local one renamed and queued.
    expect(readLocal(db, 'pipeline', 'pl').payload).toMatchObject({ name: 'Shared (this device)' });
    expect(readLocal(db, 'pipeline', 'ph')).toMatchObject({ exists: true, hubRevision: 7 });
    expect(ops.get('pl')).toMatchObject({ basedOnRevision: null, status: 'pending' });
    // Re-key: records and ops carry the Hub environment; the standalone one is preserved.
    expect(new Set((db.prepare('SELECT environment_id FROM records').all() as Array<{ environment_id: string }>).map((r) => r.environment_id))).toEqual(new Set(['env-hub']));
    expect(new Set(listOutbox(db, 50).map((o) => o.environmentId))).toEqual(new Set(['env-hub']));
    expect(workingEnvironmentId(db)).toBe('env-hub');
    expect(db.prepare("SELECT value FROM meta WHERE key = 'standalone_environment_id'").get()).toBeTruthy();
    expect(db.prepare("SELECT value FROM meta WHERE key = 'first_sync_progress'").get()).toBeUndefined();
    // Normal sync took over and pushes the queued work.
    expect(status.categories.favorites).toBe(true);
    await vi.waitFor(() => expect(t.api.syncPush).toHaveBeenCalled());
  });

  it('refuses a preview that no longer matches', async () => {
    const t = setup([rec('favorite', 'tool:a', 3, fav('a'))]);
    const preview = await t.runtime.firstSyncPreview();
    t.put('favorite', 'tool:new', fav('new'));
    t.advance(11 * 60_000);
    await expect(t.runtime.firstSyncApply({ choices: {}, digest: preview.digest })).rejects.toMatchObject({ code: 'first-sync-stale' });
    expect(getSyncState(t.store.db).firstSyncState).toBe('pending');
  });
});

describe('use-hub', () => {
  async function prepared() {
    const t = setup([rec('favorite', 'tool:hub', 3, fav('hub'))]);
    t.put('favorite', 'tool:mine', fav('mine'));
    const preview = await t.runtime.firstSyncPreview();
    return { t, preview };
  }

  it('needs the confirmation, then snapshots the store and replaces the local rows', async () => {
    const { t, preview } = await prepared();
    await expect(t.runtime.firstSyncApply({ choices: { favorites: 'use-hub' }, digest: preview.digest })).rejects.toMatchObject({ code: 'confirmation-required' });
    await expect(t.runtime.firstSyncApply({ choices: { favorites: 'use-hub' }, digest: preview.digest, confirmToken: 'wrong' })).rejects.toMatchObject({ code: 'invalid-token' });
    expect(ids(t.store.db, 'favorite')).toEqual(['tool:mine']);
    expect(existsSync(path.join(t.dir, 'backups'))).toBe(false);

    // The wrong token was not the real one; preview again for a fresh token.
    const again = await t.runtime.firstSyncPreview();
    await t.runtime.firstSyncApply({ choices: { favorites: 'use-hub' }, digest: again.digest, confirmToken: again.confirmToken! });
    expect(ids(t.store.db, 'favorite')).toEqual(['tool:hub']);
    expect(listOutbox(t.store.db, 10)).toEqual([]);
    const files = readdirSync(path.join(t.dir, 'backups')).filter((f) => f.startsWith('first-sync-'));
    expect(files).toHaveLength(1);
    // The token is single use.
    await expect(t.runtime.firstSyncApply({ choices: { favorites: 'use-hub' }, digest: again.digest, confirmToken: again.confirmToken! })).rejects.toMatchObject({ code: 'invalid-token' });
  });

  it('refuses an expired token', async () => {
    const { t, preview } = await prepared();
    t.advance(11 * 60_000);
    await expect(t.runtime.firstSyncApply({ choices: { favorites: 'use-hub' }, digest: preview.digest, confirmToken: preview.confirmToken! })).rejects.toMatchObject({ code: 'invalid-token' });
    expect(ids(t.store.db, 'favorite')).toEqual(['tool:mine']);
  });
});

describe('keep-local', () => {
  it('disables the category and leaves its data and ops alone', async () => {
    const t = setup([rec('favorite', 'tool:hub', 3, fav('hub'))]);
    t.put('favorite', 'tool:mine', fav('mine'));
    const preview = await t.runtime.firstSyncPreview();
    const status = await t.runtime.firstSyncApply({ choices: { favorites: 'keep-local' }, digest: preview.digest });
    expect(status.categories.favorites).toBe(false);
    expect(ids(t.store.db, 'favorite')).toEqual(['tool:mine']);
    expect(listOutbox(t.store.db, 10)).toMatchObject([{ entityId: 'tool:mine', status: 'pending' }]);
    expect(status).toMatchObject({ held: 1, pending: 0 });
    expect(t.api.syncPush).not.toHaveBeenCalled();
  });
});

describe('resumability', () => {
  it('re-runs safely after a crash between categories', async () => {
    let crash = true;
    const t = setup([rec('favorite', 'tool:hub', 3, fav('hub')), rec('favorite', 'tool:diff', 4, fav('diff', 9))], {
      afterCategory: (c) => { if (c === 'favorites' && crash) { crash = false; throw new Error('boom'); } },
    });
    t.put('favorite', 'tool:diff', fav('diff', 1));
    t.put('favorite', 'tool:mine', fav('mine'));
    const preview = await t.runtime.firstSyncPreview();
    await expect(t.runtime.firstSyncApply({ choices: {}, digest: preview.digest })).rejects.toThrow('boom');
    expect(getSyncState(t.store.db).firstSyncState).toBe('pending');
    // The favorites category already committed; the rest is still to do.
    expect(ids(t.store.db, 'favorite').sort()).toEqual(['tool:diff', 'tool:hub', 'tool:mine']);

    const status = await t.runtime.firstSyncApply({ choices: {}, digest: preview.digest });
    expect(getSyncState(t.store.db)).toMatchObject({ firstSyncState: 'done', cursor: 50 });
    expect(status.phase).not.toBe('needs-first-sync');
    const ops = listOutbox(t.store.db, 10).map((o) => o.entityId).sort();
    expect(ops.filter((id) => id === 'tool:mine' || id === 'tool:diff')).toEqual(['tool:diff', 'tool:mine']);
    expect(t.store.db.prepare("SELECT value FROM meta WHERE key = 'first_sync_progress'").get()).toBeUndefined();
  });
});

describe('re-enrollment', () => {
  it('resets the first sync and the Hub bookkeeping', async () => {
    const t = setup([rec('favorite', 'tool:hub', 3, fav('hub'))]);
    t.put('favorite', 'tool:mine', fav('mine'));
    const preview = await t.runtime.firstSyncPreview();
    await t.runtime.firstSyncApply({ choices: {}, digest: preview.digest });
    expect(getSyncState(t.store.db)).toMatchObject({ firstSyncState: 'done' });
    expect(readLocal(t.store.db, 'favorite', 'tool:hub').hubRevision).toBe(3);

    resetHubBookkeeping(t.store.db);
    expect(getSyncState(t.store.db)).toMatchObject({ firstSyncState: 'pending', cursor: 0 });
    expect(readLocal(t.store.db, 'favorite', 'tool:hub').hubRevision).toBeNull();
    expect(listOutbox(t.store.db, 10).every((o) => o.basedOnRevision === null)).toBe(true);
  });
});
