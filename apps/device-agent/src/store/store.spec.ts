import { afterEach, describe, expect, it } from 'vitest';
import { entityCollectionContract, kvRepositoryContract } from '@dude/persistence/testing';
import type { EntityCollectionRepository } from '@dude/persistence';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity, importMany, listRecords } from './entity-commit.js';
import type { CommitContext } from './entity-commit.js';
import { commitKvBatch, SqliteKeyValueRepository } from './repos/kv.repo.js';
import { listOutbox, outboxSummary } from './repos/outbox.repo.js';
import type { DeviceStore } from './open-store.js';

afterEach(cleanupTemp);

const fav = (id: string, order = 0) => ({ entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert' as const, payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order } });
const del = (id: string) => ({ entityType: 'favorite', entityId: `tool:${id}`, op: 'delete' as const });
const harness = { describe, it, expect };

kvRepositoryContract('SQLite', () => new SqliteKeyValueRepository(openReady(tempDir()).db), harness);

/** Adapts commitEntity to the contract's { id, v } entity using 'favorite' (id -> tool:<id>, v -> order). The contract's revision is a collection-level counter. */
function favoriteCollection(store: DeviceStore, ctx: CommitContext): EntityCollectionRepository<{ id: string; v: number }> {
  let revision = 0;
  const get = async (id: string) => {
    const rec = listRecords(store.db, 'favorite').find((r) => r.entityId === `tool:${id}`);
    return rec ? { id, v: (rec.payload as { order: number }).order } : undefined;
  };
  return {
    list: async () => listRecords(store.db, 'favorite').map((r) => ({ id: (r.payload as { targetId: string }).targetId, v: (r.payload as { order: number }).order })),
    get,
    upsert: async (e) => { commitEntity(store.db, ctx, fav(e.id, e.v)); return { localRevision: ++revision }; },
    remove: async (id) => {
      if (await get(id)) { commitEntity(store.db, ctx, del(id)); revision++; }
      return { localRevision: revision };
    },
    importMany: async (values) => { importMany(store.db, ctx, values.map((e) => fav(e.id, e.v))); return { localRevision: ++revision }; },
  };
}

entityCollectionContract('SQLite favorites', () => {
  const store = openReady(tempDir());
  return favoriteCollection(store, commitContext(store));
}, harness);

describe('kv batch', () => {
  it('applies upserts with policy-derived scope', () => {
    const store = openReady(tempDir());
    commitKvBatch(store.db, [
      { namespace: 'n', key: 'a', value: 1, policy: 'local' },
      { namespace: 'n', key: 'b', value: 2, policy: 'session' },
    ]);
    expect(store.db.prepare('SELECT key, scope FROM kv ORDER BY key').all()).toEqual([{ key: 'a', scope: 'environment' }, { key: 'b', scope: 'local-only' }]);
  });

  it('is atomic: a failure midway leaves the earlier mutations unapplied', () => {
    const store = openReady(tempDir());
    commitKvBatch(store.db, [{ namespace: 'n', key: 'a', value: 1, policy: 'local' }]);
    expect(() => commitKvBatch(store.db, [
      { namespace: 'n', key: 'a', remove: true, policy: 'local' },
      { namespace: 'n', key: 'c', value: 3, policy: 'session' },
    ], (policy) => { if (policy === 'session') throw new Error('boom'); return 'environment'; })).toThrow('boom');
    expect(store.db.prepare('SELECT key FROM kv').all()).toEqual([{ key: 'a' }]);
  });
});

describe('journaled kv settings', () => {
  it('a journaled setting write produces a setting op with the value', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    commitKvBatch(store.db, [{ namespace: '__workspace__', key: 'reopenOnRestart', value: true, policy: 'local' }], undefined, undefined, ctx);
    expect(listOutbox(store.db, 10)).toMatchObject([{ entityType: 'setting', entityId: '__workspace__:reopenOnRestart', opKind: 'upsert', payload: true }]);
  });

  it('a non-journaled kv write produces no op', () => {
    const store = openReady(tempDir());
    commitKvBatch(store.db, [{ namespace: 'settings.ai', key: 'model', value: 'x', policy: 'local' }, { namespace: 'tool.a', key: 'k', value: 1, policy: 'local' }], undefined, undefined, commitContext(store));
    expect(listOutbox(store.db, 10)).toHaveLength(0);
  });

  it('two writes coalesce into one op with the latest value', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    const write = (value: unknown) => commitKvBatch(store.db, [{ namespace: 'settings', key: 'appearance', value, policy: 'local' }], undefined, undefined, ctx);
    write({ theme: 'dark' });
    write({ theme: 'light' });
    const ops = listOutbox(store.db, 10);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityId: 'settings:appearance', payload: { theme: 'light' } });
  });

  it('create then remove of a never-sent setting leaves no op', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    commitKvBatch(store.db, [{ namespace: 'settings', key: 'appearance', value: 1, policy: 'local' }], undefined, undefined, ctx);
    commitKvBatch(store.db, [{ namespace: 'settings', key: 'appearance', remove: true, policy: 'local' }], undefined, undefined, ctx);
    expect(listOutbox(store.db, 10)).toEqual([]);
  });
});

describe('entity commit and outbox', () => {
  it('pinning a favorite writes the record and one op', () => {
    const store = openReady(tempDir());
    const r = commitEntity(store.db, commitContext(store), fav('base64'));
    expect(r).toMatchObject({ ok: true, localRevision: 1 });
    expect(listRecords(store.db, 'favorite')).toHaveLength(1);
    const ops = listOutbox(store.db, 10);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ opKind: 'upsert', basedOnRevision: null, status: 'unsent-standalone', environmentId: 'env-1' });
    expect(ops[0].opId).toBe((r as { outboxOpId: string }).outboxOpId);
  });

  it('coalesces two edits into one op with the latest payload and original createdAt', () => {
    const store = openReady(tempDir());
    let t = 1000;
    const ctx = commitContext(store, { now: () => new Date(t) });
    commitEntity(store.db, ctx, fav('a', 1));
    t = 2000;
    commitEntity(store.db, ctx, fav('a', 2));
    const ops = listOutbox(store.db, 10);
    expect(ops).toHaveLength(1);
    expect((ops[0].payload as { order: number }).order).toBe(2);
    expect(ops[0].localRevision).toBe(2);
    expect(ops[0].createdAt).toBe(new Date(1000).toISOString());
    expect(ops[0].updatedAt).toBe(new Date(2000).toISOString());
  });

  it('create then delete of a never-sent entity leaves no op', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    commitEntity(store.db, ctx, fav('a'));
    commitEntity(store.db, ctx, del('a'));
    expect(listRecords(store.db)).toHaveLength(0);
    expect(listOutbox(store.db, 10)).toHaveLength(0);
  });

  it('a delete of a Hub-known entity keeps a delete op', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    commitEntity(store.db, ctx, fav('a'));
    store.db.exec('UPDATE records SET hub_revision = 7');
    store.db.exec('DELETE FROM outbox');
    commitEntity(store.db, ctx, del('a'));
    const ops = listOutbox(store.db, 10);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ opKind: 'delete', basedOnRevision: 7, payload: null });
  });

  it('rejects unknown types and undecodable payloads without writing', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    expect(commitEntity(store.db, ctx, { entityType: 'nope', entityId: 'x', op: 'upsert', payload: {} })).toMatchObject({ ok: false });
    expect(commitEntity(store.db, ctx, { entityType: 'favorite', entityId: 'tool:a', op: 'upsert', payload: { junk: true } })).toMatchObject({ ok: false });
    expect(commitEntity(store.db, ctx, { ...fav('a'), entityId: 'tool:other' })).toMatchObject({ ok: false });
    expect(listRecords(store.db)).toHaveLength(0);
  });

  it('is atomic: a failing outbox insert leaves neither row nor op', () => {
    const store = openReady(tempDir());
    store.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(() => commitEntity(store.db, commitContext(store), fav('a'))).toThrow(/boom/);
    expect(listRecords(store.db)).toHaveLength(0);
    expect(listOutbox(store.db, 10)).toHaveLength(0);
    store.db.exec('DROP TRIGGER fail_outbox');
    expect(commitEntity(store.db, commitContext(store), fav('a'))).toMatchObject({ ok: true });
  });

  it('importMany is all-or-nothing', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    expect(importMany(store.db, ctx, [fav('a'), { entityType: 'nope', entityId: 'x', op: 'upsert', payload: {} }])).toMatchObject({ ok: false });
    expect(listRecords(store.db)).toHaveLength(0);
    expect(importMany(store.db, ctx, [fav('a'), fav('b')])).toMatchObject({ ok: true, count: 2 });
    expect(listOutbox(store.db, 10)).toHaveLength(2);
  });

  it('reports backpressure but never drops edits', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store, { maxOutboxRows: 2 });
    expect(commitEntity(store.db, ctx, fav('a'))).toMatchObject({ ok: true, backpressure: false });
    expect(commitEntity(store.db, ctx, fav('b'))).toMatchObject({ ok: true, backpressure: true });
    expect(commitEntity(store.db, ctx, fav('c'))).toMatchObject({ ok: true, backpressure: true });
    expect(outboxSummary(store.db, 2)).toEqual({ pending: 3, maxRows: 2, backpressure: true });
  });
});
