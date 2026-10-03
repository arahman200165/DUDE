import { afterEach, describe, expect, it } from 'vitest';
import { defaultCategoryMap } from '@dude/sync';
import type { SyncRecord } from '@dude/contracts/hub';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from '../store/entity-commit.js';
import { commitKvBatch } from '../store/repos/kv.repo.js';
import { saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { listOutbox } from '../store/repos/outbox.repo.js';
import { listRecords } from '../store/repos/records.repo.js';
import { listConflicts } from '../store/repos/sync-conflicts.repo.js';
import { updateSyncState } from '../store/repos/sync-state.repo.js';
import type { DeviceStore } from '../store/open-store.js';
import { applyRemoteChanges } from './apply-remote.js';
import type { SyncApplyContext } from './apply-remote.js';
import { applyPushResults, buildPushBatch } from './push-results.js';
import { applySnapshot, applySnapshotPage, beginSnapshot, finishSnapshot } from './rebase.js';
import { listConflictViews, resolveConflict } from './conflicts.js';
import { computeSyncStatus } from './status.js';
import { discardQuarantined, exportQuarantined, retryQuarantined } from './quarantine.js';
import { readLocal, setBase } from './sync-entities.js';

afterEach(cleanupTemp);

const T0 = new Date('2026-02-01T00:00:00.000Z');
const ENROLL = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(),
};

let seq = 0;
function setup(): { store: DeviceStore; ctx: SyncApplyContext; commit: ReturnType<typeof commitContext> } {
  const store = openReady(tempDir());
  saveEnrollment(store.db, ENROLL, T0);
  const commit = commitContext(store, { newOpId: () => `op-${(seq += 1)}` });
  const ctx: SyncApplyContext = { environmentId: 'env-1', now: () => new Date('2026-03-01T00:00:00.000Z'), newOpId: commit.newOpId };
  return { store, ctx, commit };
}

const rec = (entityType: string, entityId: string, revision: number, payload: unknown | null, over: Partial<SyncRecord> = {}): SyncRecord => ({
  entityType, entityId, revision, deleted: payload === null, payload, schemaVersion: 1, updatedAt: '2026-02-01T00:00:00.000Z', updatedByDeviceId: 'other', ...over,
});
const pipe = (id: string, over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, id, name: 'P', description: 'd', steps: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const fav = (id: string, order = 0) => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });
const upsert = (type: string, id: string, payload: unknown) => ({ entityType: type, entityId: id, op: 'upsert' as const, payload });

/** A synced pipeline: Hub rev 1 applied, then a local edit pending on top. */
function pipelineWithLocalEdit(setup1: ReturnType<typeof setup>, localOver: Record<string, unknown>) {
  const { store, ctx, commit } = setup1;
  applyRemoteChanges(store.db, [rec('pipeline', 'p1', 1, pipe('p1'))], ctx);
  commitEntity(store.db, commit, upsert('pipeline', 'p1', pipe('p1', localOver)));
}

describe('pull: no local op', () => {
  it('applies a record without journaling, records revision and base, and skips an already-applied revision', () => {
    const { store, ctx } = setup();
    const r1 = applyRemoteChanges(store.db, [rec('favorite', 'tool:a', 3, fav('a', 1))], ctx);
    expect(r1.applied).toEqual([{ entityType: 'favorite', entityId: 'tool:a', deleted: false, payload: fav('a', 1) }]);
    expect(listOutbox(store.db, 10)).toHaveLength(0);
    expect(readLocal(store.db, 'favorite', 'tool:a')).toMatchObject({ hubRevision: 3, base: fav('a', 1), deleted: false });
    // Same or older revision: skipped.
    const r2 = applyRemoteChanges(store.db, [rec('favorite', 'tool:a', 3, fav('a', 9)), rec('favorite', 'tool:a', 2, fav('a', 8))], ctx);
    expect(r2.applied).toEqual([]);
    expect(listRecords(store.db, 'favorite')[0].payload).toEqual(fav('a', 1));
  });

  it('deletes on a tombstone, ignores non-sync entity types, defers a newer schema', () => {
    const { store, ctx } = setup();
    applyRemoteChanges(store.db, [rec('favorite', 'tool:a', 1, fav('a'))], ctx);
    const r = applyRemoteChanges(store.db, [
      rec('favorite', 'tool:a', 2, null),
      rec('appearance', 'default', 1, { x: 1 }),
      rec('pipeline', 'p1', 1, pipe('p1'), { schemaVersion: 99 }),
    ], ctx);
    expect(r.applied).toEqual([{ entityType: 'favorite', entityId: 'tool:a', deleted: true, payload: null }]);
    expect(r.deferred.map((d) => d.entityId)).toEqual(['p1']);
    expect(listRecords(store.db)).toHaveLength(0);
    expect(listOutbox(store.db, 10)).toHaveLength(0);
  });

  it('round-trips settings and kv-bound entities through the kv without journaling', () => {
    const { store, ctx } = setup();
    const layout = { schemaVersion: 1, openTabs: ['base64'], panelTree: null, focusedNodeId: null };
    const r = applyRemoteChanges(store.db, [
      rec('setting', 'base64:wrap', 4, { namespace: 'base64', key: 'wrap', value: true }),
      rec('workspace-layout', 'default', 5, layout),
    ], ctx);
    expect(r.applied[0]).toMatchObject({ entityType: 'setting', namespace: 'base64', key: 'wrap', value: true });
    expect(store.db.prepare("SELECT value_json FROM kv WHERE namespace = 'base64' AND key = 'wrap'").get()).toEqual({ value_json: 'true' });
    expect(store.db.prepare("SELECT value_json FROM kv WHERE namespace = '__workspace__' AND key = 'layout'").get()).toEqual({ value_json: JSON.stringify(layout) });
    expect(readLocal(store.db, 'workspace-layout', 'default')).toMatchObject({ hubRevision: 5, payload: layout });
    expect(listOutbox(store.db, 10)).toHaveLength(0);

    const del = applyRemoteChanges(store.db, [rec('setting', 'base64:wrap', 6, null)], ctx);
    expect(del.applied[0]).toEqual({ entityType: 'setting', entityId: 'base64:wrap', deleted: true, payload: null, namespace: 'base64', key: 'wrap' });
    expect(readLocal(store.db, 'setting', 'base64:wrap')).toMatchObject({ exists: false, hubRevision: 6 });
  });
});

describe('pull: local op present', () => {
  it('lww keeps the local op and rebases it onto the remote revision', () => {
    const { store, ctx, commit } = setup();
    applyRemoteChanges(store.db, [rec('favorite', 'tool:a', 1, fav('a', 0))], ctx);
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a', 5)));
    const r = applyRemoteChanges(store.db, [rec('favorite', 'tool:a', 4, fav('a', 9))], ctx);
    expect(r.applied).toEqual([]);
    const [op] = listOutbox(store.db, 10);
    expect(op.basedOnRevision).toBe(4);
    expect(op.payload).toEqual(fav('a', 5));
    expect(listRecords(store.db, 'favorite')[0].payload).toEqual(fav('a', 5));
    expect(readLocal(store.db, 'favorite', 'tool:a')).toMatchObject({ hubRevision: 4, base: fav('a', 9) });
  });

  it('merge3 auto-merges disjoint field edits and updates the op payload and base', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    const before = listOutbox(s.store.db, 10)[0];
    const r = applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 2, pipe('p1', { description: 'Theirs' }))], s.ctx);
    const merged = pipe('p1', { name: 'Mine', description: 'Theirs' });
    expect(r.applied).toEqual([{ entityType: 'pipeline', entityId: 'p1', deleted: false, payload: merged }]);
    expect(r.conflicts).toBe(0);
    expect(listRecords(s.store.db, 'pipeline')[0].payload).toEqual(merged);
    const ops = listOutbox(s.store.db, 10);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ basedOnRevision: 2, payload: merged });
    expect(ops[0].opId).not.toBe(before.opId);
    expect(readLocal(s.store.db, 'pipeline', 'p1')).toMatchObject({ hubRevision: 2, base: pipe('p1', { description: 'Theirs' }) });
  });

  it('merge3 overlapping edits make a conflict row, apply the Hub version and drop the op', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    const r = applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 2, pipe('p1', { name: 'Theirs' }))], s.ctx);
    expect(r.conflicts).toBe(1);
    expect(listOutbox(s.store.db, 10)).toHaveLength(0);
    expect(listRecords(s.store.db, 'pipeline')[0].payload).toMatchObject({ name: 'Theirs' });
    const [c] = listConflicts(s.store.db);
    expect(c).toMatchObject({ kind: 'edit-edit', fields: ['name'], remoteRevision: 2, localDeleted: false, remoteDeleted: false });
    expect(c.localPayload).toMatchObject({ name: 'Mine' });
    expect(c.basePayload).toMatchObject({ name: 'P' });
  });

  it('edit-vs-delete: a remote tombstone over a local edit conflicts and deletes locally', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 2, null)], s.ctx);
    expect(listRecords(s.store.db, 'pipeline')).toHaveLength(0);
    expect(listOutbox(s.store.db, 10)).toHaveLength(0);
    expect(listConflicts(s.store.db)[0]).toMatchObject({ kind: 'edit-delete', remoteDeleted: true, localDeleted: false });
  });

  it('delete-vs-edit: a remote edit over a local delete conflicts and applies the Hub version', () => {
    const s = setup();
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 1, pipe('p1'))], s.ctx);
    commitEntity(s.store.db, s.commit, { entityType: 'pipeline', entityId: 'p1', op: 'delete' });
    expect(listOutbox(s.store.db, 10)[0].opKind).toBe('delete');
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 2, pipe('p1', { name: 'Theirs' }))], s.ctx);
    expect(listConflicts(s.store.db)[0]).toMatchObject({ kind: 'delete-edit', localDeleted: true, remoteDeleted: false });
    expect(listRecords(s.store.db, 'pipeline')[0].payload).toMatchObject({ name: 'Theirs' });
    expect(listOutbox(s.store.db, 10)).toHaveLength(0);
  });
});

describe('push', () => {
  const allOn = { ...defaultCategoryMap(), usage: true, 'workspace-layout': true, scratchpad: true };

  it('builds nothing before the first sync or for a disabled category, and respects the op and byte limits', () => {
    const { store, commit } = setup();
    for (const id of ['a', 'b', 'c']) commitEntity(store.db, commit, upsert('favorite', `tool:${id}`, fav(id)));
    expect(buildPushBatch(store.db, allOn, false).ops).toHaveLength(0);
    expect(buildPushBatch(store.db, { ...allOn, favorites: false }, true).ops).toHaveLength(0);
    expect(buildPushBatch(store.db, allOn, true, undefined, { maxPushOps: 2, maxPushBytes: 1e6, maxRecordBytes: 1e6 }).ops).toHaveLength(2);
    expect(buildPushBatch(store.db, allOn, true, undefined, { maxPushOps: 10, maxPushBytes: 120, maxRecordBytes: 1e6 }).ops).toHaveLength(2);
  });

  it('quarantines an op over maxRecordBytes as too-large without sending it', () => {
    const { store, commit } = setup();
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a')));
    const batch = buildPushBatch(store.db, allOn, true, undefined, { maxPushOps: 10, maxPushBytes: 1e6, maxRecordBytes: 10 });
    expect(batch.ops).toHaveLength(0);
    expect(batch.quarantined).toBe(1);
    expect(listOutbox(store.db, 10)[0].status).toBe('quarantined');
    expect(exportQuarantined(store.db)[0]).toMatchObject({ reason: 'too-large', entityId: 'tool:a' });
  });

  it('applied sets the base and deletes the op; duplicate is idempotent', () => {
    const { store, ctx, commit } = setup();
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a')));
    const batch = buildPushBatch(store.db, allOn, true);
    expect(store.db.prepare('SELECT attempts FROM outbox').get()).toEqual({ attempts: 1 });
    const opId = batch.ops[0].opId;
    const r = applyPushResults(store.db, batch.sent, [{ opId, status: 'applied', revision: 7 }], ctx);
    expect(r).toEqual({ applied: [], conflicts: 0, quarantined: 0 });
    expect(listOutbox(store.db, 10)).toHaveLength(0);
    expect(readLocal(store.db, 'favorite', 'tool:a')).toMatchObject({ hubRevision: 7, base: fav('a') });
    applyPushResults(store.db, batch.sent, [{ opId, status: 'duplicate', revision: 7 }], ctx);
    expect(readLocal(store.db, 'favorite', 'tool:a')).toMatchObject({ hubRevision: 7 });
    expect(listOutbox(store.db, 10)).toHaveLength(0);
  });

  it('keeps an op edited after the send and rebases it onto the new revision', () => {
    const { store, ctx, commit } = setup();
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a', 0)));
    const batch = buildPushBatch(store.db, allOn, true);
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a', 3)));
    applyPushResults(store.db, batch.sent, [{ opId: batch.ops[0].opId, status: 'applied', revision: 5 }], ctx);
    const [op] = listOutbox(store.db, 10);
    expect(op.payload).toEqual(fav('a', 3));
    expect(op.basedOnRevision).toBe(5);
    expect(readLocal(store.db, 'favorite', 'tool:a').base).toEqual(fav('a', 0));
  });

  it('a conflict result merges disjoint edits and re-bases the op', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    const batch = buildPushBatch(s.store.db, allOn, true);
    const current = rec('pipeline', 'p1', 3, pipe('p1', { description: 'Theirs' }));
    const r = applyPushResults(s.store.db, batch.sent, [{ opId: batch.ops[0].opId, status: 'conflict', current }], s.ctx);
    expect(r.conflicts).toBe(0);
    expect(r.applied[0].payload).toEqual(pipe('p1', { name: 'Mine', description: 'Theirs' }));
    expect(listOutbox(s.store.db, 10)[0]).toMatchObject({ basedOnRevision: 3, payload: pipe('p1', { name: 'Mine', description: 'Theirs' }) });
  });

  it('a conflict result on overlapping edits fills the inbox and applies the Hub version', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    const batch = buildPushBatch(s.store.db, allOn, true);
    const current = rec('pipeline', 'p1', 3, pipe('p1', { name: 'Theirs' }));
    const r = applyPushResults(s.store.db, batch.sent, [{ opId: batch.ops[0].opId, status: 'conflict', current }], s.ctx);
    expect(r.conflicts).toBe(1);
    expect(listOutbox(s.store.db, 10)).toHaveLength(0);
    expect(listConflicts(s.store.db)).toHaveLength(1);
  });

  it('rejected quarantines with the reason; retry and discard work', () => {
    const { store, ctx, commit } = setup();
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a')));
    commitEntity(store.db, commit, upsert('favorite', 'tool:b', fav('b')));
    const batch = buildPushBatch(store.db, allOn, true);
    const r = applyPushResults(store.db, batch.sent, batch.ops.map((o) => ({ opId: o.opId, status: 'rejected' as const, reason: 'invalid-payload' as const })), ctx);
    expect(r.quarantined).toBe(2);
    expect(computeSyncStatus(store.db, { phase: 'idle', lastError: null, headRevision: null }).quarantined).toBe(2);
    expect(retryQuarantined(store.db, [batch.ops[0].opId])).toBe(1);
    expect(listOutbox(store.db, 10).filter((o) => o.status === 'pending')).toHaveLength(1);
    expect(discardQuarantined(store.db, batch.ops[1].opId)).toBe(true);
    expect(discardQuarantined(store.db, batch.ops[0].opId)).toBe(false);
    expect(retryQuarantined(store.db)).toBe(0);
  });
});

describe('snapshot', () => {
  it('applies live records, deletes synced-but-missing rows and keeps never-synced creates', () => {
    const { store, ctx, commit } = setup();
    applyRemoteChanges(store.db, [rec('favorite', 'tool:gone', 1, fav('gone')), rec('favorite', 'tool:kept', 2, fav('kept'))], ctx);
    applyRemoteChanges(store.db, [rec('setting', 'base64:wrap', 3, { namespace: 'base64', key: 'wrap', value: true })], ctx);
    commitEntity(store.db, commit, upsert('favorite', 'tool:new', fav('new')));
    const collector = beginSnapshot();
    applySnapshotPage(store.db, collector, [rec('favorite', 'tool:kept', 2, fav('kept'))], ctx);
    applySnapshotPage(store.db, collector, [rec('favorite', 'tool:fresh', 9, fav('fresh'))], ctx);
    const r = finishSnapshot(store.db, collector, ctx);
    expect(r.deletedLocally).toBe(2);
    expect(listRecords(store.db, 'favorite').map((x) => x.entityId).sort()).toEqual(['tool:fresh', 'tool:kept', 'tool:new']);
    expect(readLocal(store.db, 'setting', 'base64:wrap')).toMatchObject({ exists: false, hubRevision: null });
    expect(listOutbox(store.db, 10).map((o) => o.entityId)).toEqual(['tool:new']);
    expect(r.applied.filter((c) => c.deleted).map((c) => c.entityId).sort()).toEqual(['base64:wrap', 'tool:gone']);
  });

  it('a synced row with a pending edit that the Hub no longer has is an edit-delete conflict', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    const r = applySnapshot(s.store.db, [], s.ctx);
    expect(r.conflicts).toBe(1);
    expect(listRecords(s.store.db, 'pipeline')).toHaveLength(0);
    expect(listOutbox(s.store.db, 10)).toHaveLength(0);
    expect(listConflicts(s.store.db)[0]).toMatchObject({ kind: 'edit-delete', remoteDeleted: true });
  });

  it('keeps deferred (newer-schema) records and reports them', () => {
    const { store, ctx } = setup();
    const r = applySnapshot(store.db, [rec('pipeline', 'p1', 1, pipe('p1'), { schemaVersion: 50 })], ctx);
    expect(r.deferred).toHaveLength(1);
    expect(listRecords(store.db)).toHaveLength(0);
  });
});

describe('conflict resolution', () => {
  const conflicted = (localOver: Record<string, unknown>) => {
    const s = setup();
    pipelineWithLocalEdit(s, localOver);
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 2, pipe('p1', { name: 'Theirs' }))], s.ctx);
    return s;
  };

  it('lists views with category, name and keep-both availability', () => {
    const s = conflicted({ name: 'Mine' });
    expect(listConflictViews(s.store.db)[0]).toMatchObject({ category: 'pipelines', name: 'Mine', canKeepBoth: true });
  });

  it('hub drops the row and leaves the Hub version', () => {
    const s = conflicted({ name: 'Mine' });
    const [c] = listConflicts(s.store.db);
    expect(resolveConflict(s.store.db, c.id, 'hub', s.commit)).toEqual({ ok: true, changes: [] });
    expect(listConflicts(s.store.db)).toHaveLength(0);
    expect(listOutbox(s.store.db, 10)).toHaveLength(0);
    expect(listRecords(s.store.db, 'pipeline')[0].payload).toMatchObject({ name: 'Theirs' });
  });

  it('mine re-journals the local version based on the current Hub revision', () => {
    const s = conflicted({ name: 'Mine' });
    const [c] = listConflicts(s.store.db);
    const r = resolveConflict(s.store.db, c.id, 'mine', s.commit);
    expect(r).toMatchObject({ ok: true });
    expect(listRecords(s.store.db, 'pipeline')[0].payload).toMatchObject({ name: 'Mine' });
    expect(listOutbox(s.store.db, 10)[0]).toMatchObject({ opKind: 'upsert', basedOnRevision: 2, status: 'pending' });
    expect(listConflicts(s.store.db)).toHaveLength(0);
  });

  it('mine after edit-delete recreates the record based on the tombstone revision', () => {
    const s = setup();
    pipelineWithLocalEdit(s, { name: 'Mine' });
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 4, null)], s.ctx);
    const [c] = listConflicts(s.store.db);
    resolveConflict(s.store.db, c.id, 'mine', s.commit);
    expect(listRecords(s.store.db, 'pipeline')).toHaveLength(1);
    expect(listOutbox(s.store.db, 10)[0].basedOnRevision).toBe(4);
  });

  it('mine over a delete-edit deletes locally through the journal', () => {
    const s = setup();
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 1, pipe('p1'))], s.ctx);
    commitEntity(s.store.db, s.commit, { entityType: 'pipeline', entityId: 'p1', op: 'delete' });
    applyRemoteChanges(s.store.db, [rec('pipeline', 'p1', 2, pipe('p1', { name: 'T' }))], s.ctx);
    const [c] = listConflicts(s.store.db);
    resolveConflict(s.store.db, c.id, 'mine', s.commit);
    expect(listRecords(s.store.db, 'pipeline')).toHaveLength(0);
    expect(listOutbox(s.store.db, 10)[0]).toMatchObject({ opKind: 'delete', basedOnRevision: 2 });
  });

  it('both forks the local version under a new id with a name suffix', () => {
    const s = conflicted({ name: 'Mine' });
    const [c] = listConflicts(s.store.db);
    const r = resolveConflict(s.store.db, c.id, 'both', { ...s.commit, newEntityId: () => 'fork-1' });
    expect(r).toMatchObject({ ok: true, changes: [{ entityId: 'fork-1' }] });
    const records = listRecords(s.store.db, 'pipeline');
    expect(records.map((x) => x.entityId).sort()).toEqual(['fork-1', 'p1']);
    expect(records.find((x) => x.entityId === 'fork-1')?.payload).toMatchObject({ id: 'fork-1', name: 'Mine (conflict copy)' });
    expect(listOutbox(s.store.db, 10)).toMatchObject([{ entityId: 'fork-1', basedOnRevision: null }]);
  });

  it('both is rejected for singletons and keeps the conflict', () => {
    const s = setup();
    const base = { schemaVersion: 1, snippets: [], drawerExpanded: false };
    applyRemoteChanges(s.store.db, [rec('scratchpad', 'default', 1, base)], s.ctx);
    commitKvBatch(s.store.db, [{ namespace: '__workspace__', key: 'scratchpad', value: { ...base, drawerExpanded: true }, policy: 'local' }], undefined, undefined, s.commit);
    expect(listOutbox(s.store.db, 10)[0]).toMatchObject({ entityType: 'scratchpad', basedOnRevision: 1 });
    applyRemoteChanges(s.store.db, [rec('scratchpad', 'default', 2, { ...base, drawerExpanded: false, snippets: [{ id: 'x' }] })], s.ctx);
    // drawerExpanded: local changed true, remote left it; snippets changed remote only -> merged, no conflict.
    expect(listConflicts(s.store.db)).toHaveLength(0);
    expect(readLocal(s.store.db, 'scratchpad', 'default').payload).toMatchObject({ drawerExpanded: true, snippets: [{ id: 'x' }] });
    // Force an overlapping edit.
    commitKvBatch(s.store.db, [{ namespace: '__workspace__', key: 'scratchpad', value: { ...base, snippets: [{ id: 'mine' }] }, policy: 'local' }], undefined, undefined, s.commit);
    applyRemoteChanges(s.store.db, [rec('scratchpad', 'default', 3, { ...base, snippets: [{ id: 'theirs' }] })], s.ctx);
    const [c] = listConflicts(s.store.db);
    expect(listConflictViews(s.store.db)[0].canKeepBoth).toBe(false);
    expect(resolveConflict(s.store.db, c.id, 'both', s.commit)).toMatchObject({ ok: false });
    expect(listConflicts(s.store.db)).toHaveLength(1);
    const mine = resolveConflict(s.store.db, c.id, 'mine', s.commit);
    expect(mine).toMatchObject({ ok: true });
    expect(listOutbox(s.store.db, 10)[0]).toMatchObject({ entityType: 'scratchpad', basedOnRevision: 3 });
  });
});

describe('status and base bookkeeping', () => {
  it('computes counts, categories and the live error', () => {
    const { store, commit } = setup();
    commitEntity(store.db, commit, upsert('favorite', 'tool:a', fav('a')));
    commitEntity(store.db, commit, upsert('pipeline', 'p1', pipe('p1')));
    updateSyncState(store.db, { categories: { pipelines: false }, lastError: 'old' });
    const held = computeSyncStatus(store.db, { phase: 'needs-first-sync', lastError: null, headRevision: 12 });
    expect(held).toMatchObject({ phase: 'needs-first-sync', pending: 0, held: 2, conflicts: 0, headRevision: 12, lastError: 'old' });
    updateSyncState(store.db, { firstSyncState: 'done', cursor: 5 });
    const live = computeSyncStatus(store.db, { phase: 'idle', lastError: 'now', headRevision: 12 });
    expect(live).toMatchObject({ pending: 1, held: 1, cursor: 5, lastError: 'now' });
    expect(live.categories.pipelines).toBe(false);
  });

  it('setBase is a no-op for a missing record row and writes kv_sync for kv entities', () => {
    const { store } = setup();
    setBase(store.db, 'favorite', 'tool:none', 3, fav('none'));
    expect(readLocal(store.db, 'favorite', 'tool:none').hubRevision).toBeNull();
    setBase(store.db, 'setting', 'a:b', 3, { namespace: 'a', key: 'b', value: 1 });
    expect(readLocal(store.db, 'setting', 'a:b')).toMatchObject({ exists: false, hubRevision: 3, base: { namespace: 'a', key: 'b', value: 1 } });
  });
});
