import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYNC_POLICIES, categoryOf } from '@dude/sync';
import { getRow } from '@dude/sqlite-store';
import { commitCanonical, currentRevision } from '../../db/canonical-repository.js';
import { startAuthHub, type AuthHub } from '../auth-test-helpers.js';
import { enrolled } from '../device-test-helpers.js';

describe('device sync category-filtered reads', () => {
  let h: AuthHub;
  let token: string;
  const write = (entityType: string, entityId: string, op: 'upsert' | 'delete' = 'upsert') => {
    const now = new Date(h.clock.t).toISOString();
    const payload = entityType === 'setting' ? { namespace: 'settings', key: entityId.split(':')[1], value: 1 }
      : entityType === 'favorite' ? { id: entityId, kind: 'tool', targetId: entityId.split(':')[1], order: 0 }
        : { id: entityId, name: entityId, steps: [], createdAt: now, updatedAt: now };
    return commitCanonical(h.hub.hub.db, {
      environmentId: getRow<{ environment_id: string }>(h.hub.hub.db.prepare('SELECT environment_id FROM environment'))!.environment_id,
      entityType, entityId, op, payload, now,
    });
  };
  const read = (path: string) => h.call('GET', path, { bearer: token });
  beforeAll(async () => {
    h = await startAuthHub({ sync: { compactionIntervalMs: 0 } });
    token = (await enrolled(h, await h.signIn(), undefined, { platform: 'android', capabilities: ['secure-storage'], protocolVersion: 2 })).token;
    write('setting', 'settings:old'); // 1
    write('favorite', 'tool:a'); // 2, replaced by tombstone 6
    write('pipeline', 'p1'); // 3
    write('favorite', 'tool:b'); // 4
    write('setting', 'settings:middle'); // 5
    write('favorite', 'tool:a', 'delete'); // 6
    write('setting', 'settings:tail'); // 7
  });
  afterAll(async () => { await h?.close(); });

  it('pages matching revisions through gaps and tombstones, then advances to the global head', async () => {
    const first = await read('/sync/changes?after=0&limit=1&categories=favorites');
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ cursor: 4, hasMore: true, headRevision: 7 });
    expect(first.json.changes).toMatchObject([{ entityId: 'tool:b', revision: 4, deleted: false }]);
    const last = await read(`/sync/changes?after=${first.json.cursor}&limit=1&categories=favorites`);
    expect(last.json).toMatchObject({ cursor: 7, hasMore: false, headRevision: 7 });
    expect(last.json.changes).toMatchObject([{ entityId: 'tool:a', revision: 6, deleted: true, payload: null }]);
    expect((await read('/sync/changes?after=7&categories=favorites')).json).toMatchObject({ changes: [], cursor: 7, hasMore: false });
    const mixed = await read('/sync/changes?after=0&categories=favorites%2Csettings');
    expect(mixed.json.changes.map((r: { revision: number }) => r.revision)).toEqual([1, 4, 5, 6, 7]);
    const legacy = await read('/sync/changes?after=0');
    expect(legacy.json.changes.map((r: { revision: number }) => r.revision)).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it('empty matching pages reach head and do not skip a future matching write', async () => {
    const empty = await read('/sync/changes?after=0&categories=projects');
    expect(empty.json).toMatchObject({ changes: [], cursor: 7, headRevision: 7, hasMore: false });
    write('project', 'new-project');
    const future = await read(`/sync/changes?after=${empty.json.cursor}&categories=projects`);
    expect(future.json).toMatchObject({ cursor: 8, headRevision: 8, hasMore: false });
    expect(future.json.changes).toMatchObject([{ entityType: 'project', entityId: 'new-project', revision: 8 }]);
  });

  it('keyset-pages live matching records and a newly enabled filter snapshots older revisions', async () => {
    const seen: Array<{ entityType: string; entityId: string; revision: number }> = [];
    let next: { afterType: string; afterId: string } | null = null;
    do {
      const query = new URLSearchParams({ limit: '1', categories: 'favorites,settings', ...(next ?? {}) });
      const page = await read(`/sync/snapshot?${query}`);
      expect(page.status).toBe(200);
      expect(page.json.records).toHaveLength(1);
      seen.push(...page.json.records);
      next = page.json.next;
    } while (next);
    expect(seen.map(r => `${r.entityType}/${r.entityId}`)).toEqual([
      'favorite/tool:b', 'setting/settings:middle', 'setting/settings:old', 'setting/settings:tail',
    ]);
    const enabled = await read('/sync/snapshot?categories=settings');
    expect(enabled.json.records.map((r: { revision: number }) => r.revision).sort()).toEqual([1, 5, 7]);
    expect(enabled.json).toMatchObject({ asOfRevision: currentRevision(h.hub.hub.db), next: null });
    const legacy = await read('/sync/snapshot');
    expect(legacy.json.records).toHaveLength(6);
    expect((await read('/sync/snapshot?categories=home')).json).toMatchObject({ records: [], next: null });
  });

  it('derives all requested types from shared policy categories', async () => {
    for (const category of new Set(Object.values(SYNC_POLICIES).map(policy => policy.category))) {
      const result = await read(`/sync/changes?after=0&categories=${category}`);
      expect(result.status).toBe(200);
      expect(result.json.changes.every((r: { entityType: string }) => categoryOf(r.entityType) === category)).toBe(true);
    }
  });

  it('rejects malformed filters and repeated query keys instead of broadening the read', async () => {
    for (const categories of ['', ',', 'favorites,', ',settings', 'favorites,,settings', 'favorites,favorites',
      'settings,favorites,settings', 'unknown', 'settings,unknown', ' settings']) {
      for (const path of ['/sync/changes?after=0&', '/sync/snapshot?']) {
        expect((await read(`${path}categories=${encodeURIComponent(categories)}`)).status).toBe(400);
      }
    }
    for (const path of [
      '/sync/changes?after=0&categories=favorites&categories=settings', '/sync/snapshot?categories=favorites&categories=favorites',
      '/sync/changes?after=0&after=1', '/sync/changes?after=0&limit=1&limit=2',
      '/sync/snapshot?afterType=setting&afterType=favorite', '/sync/snapshot?afterId=a&afterId=b', '/sync/snapshot?limit=1&limit=2',
    ]) expect((await read(path)).status).toBe(400);
  });
});
