import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentHubStatus } from '@dude/contracts';
import { getMeta } from '@dude/sqlite-store';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from '../store/entity-commit.js';
import { getEnrollment, markRevoked, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { listOutbox } from '../store/repos/outbox.repo.js';
import { listRecords } from '../store/repos/records.repo.js';
import { getSyncState, updateSyncState } from '../store/repos/sync-state.repo.js';
import { workingEnvironmentId } from '../store/environment.js';
import { createSyncRuntime } from './sync-runtime.js';
import type { SyncManagerPort, SyncRuntime } from './sync-runtime.js';

/** Confirmation boundary of "Continue standalone": previewing never changes anything, applying needs the preview's token and digest. */
const runtimes: SyncRuntime[] = [];
afterEach(() => { for (const r of runtimes.splice(0)) r.stop(); cleanupTemp(); });

const T0 = new Date('2026-02-01T00:00:00.000Z');
const ENROLL = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(),
};
const fav = (id: string) => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order: 0 });

function setup(options: { revoked?: boolean } = {}) {
  const dir = tempDir();
  const store = openReady(dir);
  saveEnrollment(store.db, ENROLL, T0);
  const commit = () => commitContext(store, { environmentId: workingEnvironmentId(store.db) });
  const put = (id: string) => { if (!commitEntity(store.db, commit(), { entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert', payload: fav(id) }).ok) throw new Error('commit'); };
  put('a');
  put('b');
  if (options.revoked !== false) markRevoked(store.db, T0);
  updateSyncState(store.db, { firstSyncState: 'done', cursor: 42 });
  let hubState: AgentHubStatus['state'] = options.revoked === false ? 'online' : 'revoked';
  const hub = (): AgentHubStatus => {
    const enrollment = getEnrollment(store.db);
    return {
      state: hubState, lastError: null, lastContactAt: null, ownerSignedIn: false, hubVersion: '1', recoveryTrusted: null, pendingOps: 0,
      enrollment: enrollment && {
        state: enrollment.state, hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: enrollment.hubUrl, protocolVersion: 2, spkiActive: 'spki-a',
        spkiNext: null, enrolledAt: T0.toISOString(), lastContactAt: null, revokedAt: null,
      },
    };
  };
  const manager: SyncManagerPort = {
    status: hub, onChange: () => () => undefined, hubProtocol: () => 2, onChangesAvailable: () => () => undefined,
    deviceCall: (async () => { throw new Error('no hub call expected'); }) as SyncManagerPort['deviceCall'],
    resetToStandalone: () => { hubState = 'standalone'; },
  };
  let clock = T0.getTime();
  let tokenSeq = 0;
  let idSeq = 0;
  const runtime = createSyncRuntime({
    db: store.db, manager, now: () => new Date(clock), newOpId: () => `op-${(idSeq += 1)}`, newToken: () => `token-${(tokenSeq += 1)}`,
    backupDir: path.join(dir, 'backups'), intervals: { pollMs: 60_000 },
  });
  runtimes.push(runtime);
  runtime.start();
  return { store, runtime, dir, advance: (ms: number) => { clock += ms; } };
}

const strandedCount = (t: ReturnType<typeof setup>): number => listOutbox(t.store.db, 100).filter((o) => o.status === 'stranded').length;

describe('continue standalone', () => {
  it('preview changes nothing and discloses the stranded ops', () => {
    const t = setup();
    const before = { env: getMeta(t.store.db, 'environment_id'), outbox: listOutbox(t.store.db, 100).length };
    const preview = t.runtime.standalonePreview();
    expect(preview).toMatchObject({ strandedOps: 2, records: 2, confirmToken: 'token-1' });
    expect(preview.environmentId).not.toBe('env-hub');
    expect(preview.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(strandedCount(t)).toBe(2);
    expect(getEnrollment(t.store.db)?.state).toBe('revoked');
    expect(getMeta(t.store.db, 'environment_id')).toBe(before.env);
    expect(existsSync(path.join(t.dir, 'backups'))).toBe(false);
  });

  it('apply with the token: snapshot, fresh environment, ops dropped, enrollment cleared, sync standalone', () => {
    const t = setup();
    const preview = t.runtime.standalonePreview();
    const status = t.runtime.standaloneApply({ confirmToken: preview.confirmToken, digest: preview.digest });
    expect(status.phase).toBe('standalone');
    expect(readdirSync(path.join(t.dir, 'backups')).some((f) => f.startsWith('standalone-') && f.endsWith('.db'))).toBe(true);
    expect(getEnrollment(t.store.db)).toBeNull();
    expect(listOutbox(t.store.db, 100)).toEqual([]);
    expect(getMeta(t.store.db, 'environment_id')).toBe(preview.environmentId);
    expect(workingEnvironmentId(t.store.db)).toBe(preview.environmentId);
    const records = listRecords(t.store.db, 'favorite');
    expect(records.map((r) => r.entityId).sort()).toEqual(['tool:a', 'tool:b']);
    expect(t.store.db.prepare('SELECT COUNT(*) AS n FROM records WHERE environment_id = ?').get(preview.environmentId)).toEqual({ n: 2 });
    expect(getSyncState(t.store.db)).toMatchObject({ firstSyncState: 'pending', cursor: 0 });
  });

  it('the token is single use, and a wrong or expired one changes nothing', () => {
    const t = setup();
    const preview = t.runtime.standalonePreview();
    expect(() => t.runtime.standaloneApply({ confirmToken: 'made-up', digest: preview.digest })).toThrow(/expired|confirmation/i);
    expect(() => t.runtime.standaloneApply({ confirmToken: preview.confirmToken, digest: 'x'.repeat(64) })).toThrow(/confirmation/i);
    // The wrong digest spent the token.
    expect(() => t.runtime.standaloneApply({ confirmToken: preview.confirmToken, digest: preview.digest })).toThrow(/confirmation/i);
    expect(getEnrollment(t.store.db)?.state).toBe('revoked');
    expect(strandedCount(t)).toBe(2);

    const second = t.runtime.standalonePreview();
    t.advance(10 * 60_000);
    expect(() => t.runtime.standaloneApply({ confirmToken: second.confirmToken, digest: second.digest })).toThrow(/confirmation/i);
    expect(getEnrollment(t.store.db)?.state).toBe('revoked');
  });

  it('a device change since the preview is stale and nothing is converted', () => {
    const t = setup();
    const preview = t.runtime.standalonePreview();
    commitEntity(t.store.db, commitContext(t.store, { environmentId: 'env-hub' }), { entityType: 'favorite', entityId: 'tool:c', op: 'upsert', payload: fav('c') });
    expect(() => t.runtime.standaloneApply({ confirmToken: preview.confirmToken, digest: preview.digest })).toThrow(/changed/i);
    expect(getEnrollment(t.store.db)?.state).toBe('revoked');
    expect(listOutbox(t.store.db, 100).length).toBeGreaterThan(0);
  });

  it('is refused while the device is still enrolled', () => {
    const t = setup({ revoked: false });
    expect(() => t.runtime.standalonePreview()).toThrow(/revoked/i);
    expect(getEnrollment(t.store.db)?.state).toBe('enrolled');
    expect(listOutbox(t.store.db, 100).length).toBe(2);
  });
});
