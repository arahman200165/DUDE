import { describe, expect, it } from 'vitest';
import type { SyncRecord } from '@dude/contracts/hub';
import { favoriteCodec, pipelineCodec, usageCodec, type FavoriteItem } from '@dude/persistence';
import type { Pipeline } from '@dude/domain/core/pipeline/pipeline.model';
import { createHubEntityCollection } from './hub-entity-store';
import { apiError, makeRig } from './testing/fake-hub';

const pipeline = (id: string, name: string, extra: Partial<Pipeline> = {}): Pipeline => ({
  schemaVersion: 1, id, name, steps: [], createdAt: '2024-01-01', updatedAt: '2024-01-01', ...extra,
});
const fav = (id: string, order = 0): FavoriteItem => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });
const record = (entityType: string, entityId: string, revision: number, payload: unknown): SyncRecord => ({
  entityType, entityId, revision, deleted: false, payload, schemaVersion: 1, updatedAt: '', updatedByDeviceId: null,
});
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(seed: Pipeline[] = []) {
  const rig = makeRig();
  for (const p of seed) rig.book.noteRecord(rig.hub.external('pipeline', p.id, pipelineCodec.encode(p)));
  const collection = createHubEntityCollection({ codec: pipelineCodec, engine: rig.engine, records: [...rig.hub.records.values()] });
  return { rig, collection };
}

describe('createHubEntityCollection', () => {
  it('seeds from the boot snapshot, ignoring other types and tombstones', () => {
    const rig = makeRig();
    const records = [
      record('pipeline', 'a', 1, pipelineCodec.encode(pipeline('a', 'A'))),
      record('favorite', 'x', 2, {}),
      { ...record('pipeline', 'b', 3, pipelineCodec.encode(pipeline('b', 'B'))), deleted: true },
      record('pipeline', 'bad', 4, { nope: true }),
    ];
    const collection = createHubEntityCollection({ codec: pipelineCodec, engine: rig.engine, records });
    expect(collection.items().map((p) => p.id)).toEqual(['a']);
  });

  it('upserts optimistically, pushes the encoded payload on the known revision and tracks the new one', async () => {
    const { rig, collection } = setup([pipeline('a', 'A')]);
    const next = pipeline('a', 'A2');
    const pending = collection.upsert(next);
    expect(collection.get('a')?.name).toBe('A2');
    await expect(pending).resolves.toEqual({ ok: true });
    const op = rig.hub.pushes[0]![0]!;
    expect(op).toMatchObject({ entityType: 'pipeline', entityId: 'a', opKind: 'upsert', basedOnRevision: 1, schemaVersion: 1, payload: next });
    expect(rig.book.get('pipeline', 'a').revision).toBe(2);
  });

  it('creates a new record with a null base', async () => {
    const { rig, collection } = setup();
    await collection.upsert(pipeline('n', 'New'));
    expect(rig.hub.pushes[0]![0]!.basedOnRevision).toBeNull();
  });

  it('rolls an upsert back and toasts when the Hub is unreachable', async () => {
    const { rig, collection } = setup([pipeline('a', 'A')]);
    rig.connection.set('unreachable');
    const result = await collection.upsert(pipeline('a', 'Changed'));
    expect(result.ok).toBe(false);
    expect(collection.get('a')?.name).toBe('A');
    expect(rig.hub.pushes).toHaveLength(0);
    expect(rig.feedback.toasts()[0]?.text).toBe('Hub unreachable — change not saved');
  });

  it('rolls a new record back when the push fails with a server error and marks the Hub unreachable', async () => {
    const { rig, collection } = setup();
    rig.hub.failWith = apiError(503);
    const result = await collection.upsert(pipeline('n', 'New'));
    expect(result.ok).toBe(false);
    expect(collection.items()).toEqual([]);
    expect(rig.connection.state()).toBe('unreachable');
  });

  it('rolls back and toasts the reason when the Hub rejects the write', async () => {
    const { rig, collection } = setup([pipeline('a', 'A')]);
    rig.hub.rejectReason = 'category-disabled';
    const result = await collection.upsert(pipeline('a', 'B'));
    expect(result.ok).toBe(false);
    expect(collection.get('a')?.name).toBe('A');
    expect(rig.feedback.toasts()[0]?.text).toContain('turned off');
  });

  it('locks to session-expired on a 401', async () => {
    const { rig, collection } = setup();
    rig.hub.failWith = apiError(401, 'unauthorized');
    expect((await collection.upsert(pipeline('n', 'N'))).ok).toBe(false);
    expect(rig.connection.state()).toBe('session-expired');
  });

  it('removes with a delete op, and rolls the removal back on failure', async () => {
    const { rig, collection } = setup([pipeline('a', 'A')]);
    await collection.remove('a');
    expect(rig.hub.pushes[0]![0]).toMatchObject({ opKind: 'delete', payload: null, basedOnRevision: 1 });
    expect(collection.items()).toEqual([]);

    const second = setup([pipeline('b', 'B')]);
    second.rig.connection.set('reconnecting');
    expect((await second.collection.remove('b')).ok).toBe(false);
    expect(second.collection.get('b')).toBeDefined();
    expect((await second.collection.remove('missing')).ok).toBe(true);
  });

  it('merges a conflict cleanly, adopts the merged value and re-pushes it on the new revision', async () => {
    const { rig, collection } = setup([pipeline('a', 'A', { description: 'd' })]);
    // Revision 2, unseen by the browser.
    rig.hub.external('pipeline', 'a', pipelineCodec.encode(pipeline('a', 'A', { description: 'from hub' })));
    const result = await collection.upsert(pipeline('a', 'Renamed', { description: 'd' }));
    expect(result).toEqual({ ok: true });
    expect(collection.get('a')).toMatchObject({ name: 'Renamed', description: 'from hub' });
    const second = rig.hub.pushes[1]![0]!;
    expect(second.basedOnRevision).toBe(2);
    expect(second.payload).toMatchObject({ name: 'Renamed', description: 'from hub' });
    expect(rig.book.get('pipeline', 'a').revision).toBe(3);
  });

  it('re-commits mine on the new revision for an lww entity', async () => {
    const rig = makeRig();
    rig.book.noteRecord(rig.hub.external('favorite', 'tool:x', favoriteCodec.encode(fav('x', 0))));
    const collection = createHubEntityCollection({ codec: favoriteCodec, engine: rig.engine, records: [...rig.hub.records.values()] });
    rig.hub.external('favorite', 'tool:x', favoriteCodec.encode(fav('x', 5)));
    await collection.upsert(fav('x', 2));
    expect(rig.hub.records.get('favorite\u0000tool:x')?.payload).toMatchObject({ order: 2 });
    expect(rig.feedback.conflicts()).toHaveLength(0);
  });

  describe('a real conflict', () => {
    async function conflicted() {
      const { rig, collection } = setup([pipeline('a', 'A')]);
      rig.hub.external('pipeline', 'a', pipelineCodec.encode(pipeline('a', 'Hub name')));
      const pending = collection.upsert(pipeline('a', 'My name'));
      await flush();
      expect(rig.feedback.conflicts()).toHaveLength(1);
      expect(rig.feedback.conflicts()[0]).toMatchObject({ entityType: 'pipeline', fields: ['name'], canKeepBoth: true });
      return { rig, collection, pending, request: rig.feedback.conflicts()[0]! };
    }

    it('Keep Hub adopts the Hub version and pushes nothing more', async () => {
      const { rig, collection, pending, request } = await conflicted();
      request.resolve('hub');
      await pending;
      expect(collection.get('a')?.name).toBe('Hub name');
      expect(rig.hub.pushes).toHaveLength(1);
    });

    it('Keep mine re-pushes on the Hub revision', async () => {
      const { rig, collection, pending, request } = await conflicted();
      request.resolve('mine');
      await pending;
      expect(collection.get('a')?.name).toBe('My name');
      expect(rig.hub.pushes[1]![0]).toMatchObject({ basedOnRevision: 2 });
      expect((rig.hub.records.get('pipeline\u0000a')?.payload as Pipeline).name).toBe('My name');
    });

    it('Keep both keeps the Hub version and saves mine as a copy with a new id and suffix', async () => {
      const { rig, collection, pending, request } = await conflicted();
      request.resolve('both');
      await pending;
      expect(collection.get('a')?.name).toBe('Hub name');
      const copy = collection.items().find((p) => p.id !== 'a');
      expect(copy).toMatchObject({ id: 'id-2', name: 'My name (conflict copy)' });
      expect(rig.hub.pushes[1]![0]).toMatchObject({ entityId: 'id-2', basedOnRevision: null });
    });
  });

  it('keeps a remote change for a record with a write in flight out of the way', async () => {
    const { rig, collection } = setup([pipeline('a', 'A')]);
    const pending = collection.upsert(pipeline('a', 'Mine'));
    collection.applyRemote([{ entityId: 'a', payload: pipelineCodec.encode(pipeline('a', 'Remote')) }], []);
    expect(collection.get('a')?.name).toBe('Mine');
    await pending;
    collection.applyRemote([{ entityId: 'a', payload: pipelineCodec.encode(pipeline('a', 'Remote')) }, { entityId: 'z', payload: pipelineCodec.encode(pipeline('z', 'Z')) }], []);
    expect(collection.get('a')?.name).toBe('Remote');
    collection.applyRemote([], ['z']);
    expect(collection.get('z')).toBeUndefined();
    expect(rig.hub.pushes).toHaveLength(1);
  });

  it('imports many in chunks of 100 and rolls failed ones back', async () => {
    const { rig, collection } = setup();
    const many = Array.from({ length: 150 }, (_, i) => pipeline(`p${i}`, `P${i}`));
    expect((await collection.importMany(many)).ok).toBe(true);
    expect(rig.hub.pushes.map((p) => p.length)).toEqual([100, 50]);
    expect(collection.items()).toHaveLength(150);

    const failing = setup();
    failing.rig.hub.rejectReason = 'too-large';
    const result = await failing.collection.importMany([pipeline('x', 'X')]);
    expect(result.ok).toBe(false);
    expect(failing.collection.items()).toEqual([]);
    expect((await failing.collection.importMany([])).ok).toBe(true);
  });

  it('does not toast failed usage writes', async () => {
    const rig = makeRig();
    const collection = createHubEntityCollection({ codec: usageCodec, engine: rig.engine, records: [] });
    rig.connection.set('unreachable');
    const store = usageCodec.decode({ deviceId: 'd' }, undefined);
    if (store) await collection.upsert(store);
    expect(rig.feedback.toasts()).toHaveLength(0);
  });
});
