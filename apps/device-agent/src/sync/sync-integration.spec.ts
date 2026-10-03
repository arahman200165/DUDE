import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentSyncStatus, SyncConflictView } from '@dude/contracts';
import { HubApiError } from '@dude/api-client';
import { isSyncableSettingKey } from '@dude/persistence';
import { SYNC_ENTITY_TYPES } from '@dude/sync';
import { createPinnedTransport } from '../hub/pinned-transport.js';
import { fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { cleanupTemp } from '../testing/test-utils.js';
import { listRecords } from '../store/repos/records.repo.js';

/**
 * Phase 31D exit gate: one real Hub process (the compiled bundle) and real Device Agents (store + Hub runtime + sync runtime +
 * RPC server) converging over the real wire protocol. The cases share one Hub and run in a deliberate order: later cases rely on
 * state the earlier ones left. Rate limits are relaxed through the Hub's test-only env knob; the retention case restarts the
 * Hub with a tiny retention window.
 */

const PASSWORD = 'correct horse battery staple';
const T0 = '2026-01-01T00:00:00.000Z';
const MARKER = 'SYNC-PAYLOAD-MARKER-7f3a91';
const DEVICE_ONLY_MARKER = 'DEVICE-ONLY-MARKER-c42d88';

let hub: HubHandle;
const dpapiA = fakeDpapi();
const dpapiB = fakeDpapi();
const dpapiC = fakeDpapi();
let a: Agent;
let b: Agent;
let c: Agent;

/** Fault injection on the device side of the wire: the Hub applies the push, the response never arrives. */
const faults = { dropNextPush: false, dropped: 0, pushes: 0 };
const createTransport = (target: Parameters<typeof createPinnedTransport>[0]): ReturnType<typeof createPinnedTransport> => {
  const real = createPinnedTransport(target);
  return {
    async request(req) {
      const isPush = req.method === 'POST' && req.path.endsWith('/sync/push');
      if (isPush) faults.pushes += 1;
      const response = await real.request(req);
      if (isPush && faults.dropNextPush) {
        faults.dropNextPush = false;
        faults.dropped += 1;
        throw new Error('simulated connection reset after the Hub applied the push');
      }
      return response;
    },
  };
};

// --- Helpers -------------------------------------------------------------------------------------------------------------

const pipeline = (id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ schemaVersion: 1, id, name, steps: [], createdAt: T0, updatedAt: T0, ...extra });
const project = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ id, name: `Project ${id}`, description: 'd', createdAt: T0, panelTree: null, openTabs: [], pinnedPipelineIds: [], ...extra });
const usage = (deviceId: string, count: number): Record<string, unknown> =>
  ({ schemaVersion: 2, counts: { base64: { count, lastUsedAt: T0 } }, recentLog: [], dailyBuckets: [], trackingStartedOn: null, deviceId });

const upsert = (agent: Agent, entityType: string, entityId: string, payload: unknown) => agent.rpc('entity.commit', { entityType, entityId, op: 'upsert', payload });
const remove = (agent: Agent, entityType: string, entityId: string) => agent.rpc('entity.commit', { entityType, entityId, op: 'delete' });
const kvSet = (agent: Agent, namespace: string, key: string, value: unknown, scope: 'environment' | 'device' = 'environment') =>
  agent.rpc('kv.commit', { mutations: [{ namespace, key, value, policy: 'local', scope }] });
const kvRemove = (agent: Agent, namespace: string, key: string) =>
  agent.rpc('kv.commit', { mutations: [{ namespace, key, remove: true, policy: 'local', scope: 'environment' }] });

const rec = (agent: Agent, entityType: string, entityId: string): Record<string, unknown> | undefined =>
  listRecords(agent.store.db, entityType).find((r) => r.entityId === entityId)?.payload as Record<string, unknown> | undefined;
const kv = (agent: Agent, namespace: string, key: string): unknown => {
  const row = agent.store.db.prepare('SELECT value_json FROM kv WHERE namespace = ? AND key = ?').get(namespace, key) as { value_json: string } | undefined;
  return row ? JSON.parse(row.value_json) : undefined;
};
const status = (agent: Agent): Promise<AgentSyncStatus> => agent.rpc('sync.status', {});
const conflictsOf = (agent: Agent): Promise<SyncConflictView[]> => agent.rpc('sync.conflicts.list', {});

/** A few full cycles on each device, so a change made on one lands on the others. */
async function settle(...agents: Agent[]): Promise<void> {
  for (let round = 0; round < 2; round++) for (const agent of agents) await agent.rpc('sync.now', {});
}
const quiet = (agent: Agent): Promise<AgentSyncStatus> =>
  waitFor('no pending ops', async () => { const s = await agent.rpc('sync.now', {}); return s.pending === 0 ? s : undefined; }, 30_000);

function hubRows<T>(sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(path.join(hub.dir, 'data', 'dude.db'), { readOnly: true });
  try { return db.prepare(sql).all(...params) as T[]; } finally { db.close(); }
}
const feedCount = (entityType: string, entityId: string): number =>
  hubRows<{ n: number }>('SELECT COUNT(*) AS n FROM change_feed WHERE entity_type = ? AND entity_id = ?', entityType, entityId)[0]!.n;
const hubRecord = (entityType: string, entityId: string): { deleted: number; revision: number; payload_json: string | null } | undefined =>
  hubRows<{ deleted: number; revision: number; payload_json: string | null }>('SELECT deleted, revision, payload_json FROM records WHERE entity_type = ? AND entity_id = ?', entityType, entityId)[0];
const hubHead = (): number => hubRows<{ r: number | null }>('SELECT MAX(revision) AS r FROM change_feed')[0]!.r ?? 0;

async function firstSync(agent: Agent, extra: Record<string, 'merge' | 'use-hub' | 'keep-local'> = {}): Promise<AgentSyncStatus> {
  const preview = await agent.rpc('sync.firstSync.preview', {});
  return agent.rpc('sync.firstSync.apply', { choices: { 'workspace-layout': 'merge', scratchpad: 'merge', usage: 'merge', ...extra }, digest: preview.digest, ...(preview.confirmToken ? { confirmToken: preview.confirmToken } : {}) });
}

async function enroll(agent: Agent): Promise<void> {
  await agent.rpc('hub.enroll', { pairingString: await hub.pairingString(PASSWORD) });
  await waitFor('online', () => agent.hub.manager.status().state === 'online');
}

beforeAll(async () => {
  hub = await startHub({ bootstrap: { password: PASSWORD } });
  a = startAgent(dpapiA, { createTransport });
  b = startAgent(dpapiB);
  c = startAgent(dpapiC);
  // Device C used DUDE standalone first; the first-sync collision case joins it later.
  await upsert(c, 'pipeline', 'p-shared', pipeline('p-shared', 'Shared (local copy)', { description: 'only on C' }));
  await upsert(c, 'pipeline', 'c-named', pipeline('c-named', 'Same name'));
  await upsert(c, 'favorite', 'tool:c-only', { id: 'tool:c-only', kind: 'tool', targetId: 'c-only', order: 9 });
  await enroll(a);
  await enroll(b);
  await a.rpc('hub.owner.signIn', { password: PASSWORD });
  await firstSync(a);
  await firstSync(b);
}, 90_000);

afterAll(async () => {
  stopAgents();
  await hub?.dispose();
  cleanupTemp();
}, 30_000);

describe('two device agents against one real Hub (Phase 31D exit gate)', () => {
  it('converges every category in both directions and propagates deletes', async () => {
    await waitFor('A idle', async () => (await status(a)).phase === 'idle');
    expect((await status(a)).categories).toMatchObject({ usage: true, 'workspace-layout': true, scratchpad: true });
    const idA = a.store.device.deviceId;
    const idB = b.store.device.deviceId;

    // setting: a `local` tool preference resolved to environment scope, and the appearance core key.
    await kvSet(a, 'base64', 'wrap', true);
    await kvSet(a, 'settings', 'appearance', { theme: 'dark', accent: 'teal' });
    // favorite, pipeline, user-script, project, workspace-template
    await upsert(a, 'favorite', 'tool:base64', { id: 'tool:base64', kind: 'tool', targetId: 'base64', order: 0 });
    await upsert(a, 'pipeline', 'p-one', pipeline('p-one', 'One', { steps: [{ kind: 'tool', stepId: 's1', toolId: 'base64' }] }));
    await upsert(a, 'user-script', 'us-one', { id: 'us-one', name: 'Script', body: 'return 1;', accepts: ['text'], produces: ['text'], timeoutMs: 3000, createdAt: T0, updatedAt: T0 });
    await upsert(a, 'project', 'proj-one', project('proj-one'));
    await upsert(a, 'workspace-template', 'wt-one', { id: 'wt-one', name: 'Template', builtIn: false, panelTree: null, openTabs: ['base64'] });
    // home-layout, workspace-layout and scratchpad (the opt-in categories, enabled by the first sync)
    await upsert(a, 'home-layout', 'default', { schemaVersion: 1, customized: true, narrowCustomized: false, instances: [], wide: [], narrow: [], content: {} });
    await kvSet(a, '__workspace__', 'layout', { schemaVersion: 1, openTabs: ['base64', 'hash'], panelTree: null, focusedNodeId: null });
    await kvSet(a, '__workspace__', 'scratchpad', { schemaVersion: 1, snippets: [{ id: 'sn1', title: 'Snippet', body: `note ${MARKER}`, createdAt: T0 }], drawerExpanded: false });
    // usage is per device: each device owns its own record and the totals are summed.
    await upsert(a, 'usage', idA, usage(idA, 3));
    await upsert(b, 'usage', idB, usage(idB, 4));
    // B originates a few too.
    await upsert(b, 'pipeline', 'p-from-b', pipeline('p-from-b', 'From B', { description: MARKER }));
    await upsert(b, 'project', 'proj-from-b', project('proj-from-b'));

    await waitFor('B has everything from A', async () => {
      await settle(a, b);
      return kv(b, 'base64', 'wrap') === true && rec(b, 'favorite', 'tool:base64') && rec(b, 'pipeline', 'p-one') && rec(b, 'user-script', 'us-one')
        && rec(b, 'project', 'proj-one') && rec(b, 'workspace-template', 'wt-one') && rec(b, 'home-layout', 'default') && kv(b, '__workspace__', 'layout')
        && kv(b, '__workspace__', 'scratchpad') && rec(b, 'usage', idA) && kv(b, 'settings', 'appearance');
    }, 45_000);
    expect(kv(b, 'settings', 'appearance')).toEqual({ theme: 'dark', accent: 'teal' });
    expect(rec(b, 'pipeline', 'p-one')).toMatchObject({ name: 'One', steps: [{ kind: 'tool', stepId: 's1', toolId: 'base64' }] });
    expect(rec(b, 'user-script', 'us-one')).toMatchObject({ body: 'return 1;' });
    expect(rec(b, 'workspace-template', 'wt-one')).toMatchObject({ openTabs: ['base64'] });
    expect(rec(b, 'home-layout', 'default')).toMatchObject({ customized: true });
    expect(kv(b, '__workspace__', 'layout')).toMatchObject({ openTabs: ['base64', 'hash'] });
    expect(kv(b, '__workspace__', 'scratchpad')).toMatchObject({ snippets: [{ id: 'sn1', body: `note ${MARKER}` }] });
    // ...and A has what B originated.
    await waitFor('A has B\'s items', async () => { await settle(a, b); return rec(a, 'pipeline', 'p-from-b') && rec(a, 'project', 'proj-from-b') && rec(a, 'usage', idB); }, 30_000);

    const total = (agent: Agent): number => listRecords(agent.store.db, 'usage').reduce((sum, r) => sum + Object.values((r.payload as { counts: Record<string, { count: number }> }).counts).reduce((s, e) => s + e.count, 0), 0);
    expect(listRecords(a.store.db, 'usage').map((r) => r.entityId).sort()).toEqual([idA, idB].sort());
    expect(total(a)).toBe(7);
    expect(total(b)).toBe(7);

    // Deletes propagate (records, a kv setting, and a bound kv singleton's edit stays).
    await remove(a, 'pipeline', 'p-one');
    await remove(a, 'favorite', 'tool:base64');
    await remove(a, 'user-script', 'us-one');
    await remove(a, 'workspace-template', 'wt-one');
    await remove(a, 'project', 'proj-one');
    await kvRemove(a, 'base64', 'wrap');
    await waitFor('B converges on the deletes', async () => {
      await settle(a, b);
      return !rec(b, 'pipeline', 'p-one') && !rec(b, 'favorite', 'tool:base64') && !rec(b, 'user-script', 'us-one') && !rec(b, 'workspace-template', 'wt-one')
        && !rec(b, 'project', 'proj-one') && kv(b, 'base64', 'wrap') === undefined;
    }, 45_000);
    expect(hubRecord('pipeline', 'p-one')).toMatchObject({ deleted: 1, payload_json: null });
    expect(await status(a)).toMatchObject({ pending: 0, quarantined: 0, conflicts: 0 });
    expect(await status(b)).toMatchObject({ pending: 0, quarantined: 0, conflicts: 0 });
  }, 120_000);

  it('keeps offline edits across an agent kill and Hub downtime, applying each op exactly once', async () => {
    await upsert(a, 'pipeline', 'p-seed', pipeline('p-seed', 'Seed'));
    await waitFor('B has the seed', async () => { await settle(a, b); return rec(b, 'pipeline', 'p-seed'); });

    await hub.stop();
    await upsert(a, 'pipeline', 'p-offline', pipeline('p-offline', 'Made offline'));
    await upsert(a, 'pipeline', 'p-seed', pipeline('p-seed', 'Seed (edited offline)'));
    await upsert(a, 'favorite', 'tool:offline', { id: 'tool:offline', kind: 'tool', targetId: 'offline', order: 5 });
    await waitFor('A holds the edits as pending', async () => (await status(a)).pending >= 3, 10_000);
    const dir = a.dir;
    a.kill();

    // The same store directory, a new process-equivalent: the journaled ops replay once the Hub is back.
    a = startAgent(dpapiA, { dir, createTransport });
    expect((await status(a)).pending).toBeGreaterThanOrEqual(3);
    await hub.restart();
    await waitFor('A online again', () => a.hub.manager.status().state === 'online', 30_000);
    await waitFor('B converges on A\'s offline edits', async () => {
      await settle(a, b);
      return rec(b, 'pipeline', 'p-offline') && rec(b, 'favorite', 'tool:offline') && rec(b, 'pipeline', 'p-seed')?.['name'] === 'Seed (edited offline)';
    }, 45_000);
    await quiet(a);
    expect(await status(a)).toMatchObject({ pending: 0, conflicts: 0, quarantined: 0 });
    // Not duplicated: one create (+ for the seed: its create and one edit), one create for the favorite.
    expect(feedCount('pipeline', 'p-offline')).toBe(1);
    expect(feedCount('favorite', 'tool:offline')).toBe(1);
    expect(feedCount('pipeline', 'p-seed')).toBe(2);
    expect(hubRows<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE entity_id = ?', 'p-offline')[0]!.n).toBe(1);
    await a.rpc('hub.owner.signIn', { password: PASSWORD });
  }, 120_000);

  it('applies a replayed push once when the acknowledgement is dropped', async () => {
    faults.dropNextPush = true;
    const pushesBefore = faults.pushes;
    await upsert(a, 'pipeline', 'p-dup', pipeline('p-dup', 'Dup'));
    await waitFor('the Hub applied the push whose ack was dropped', () => faults.dropped === 1 && hubRecord('pipeline', 'p-dup'), 20_000);
    // The device retries the same op id; the Hub answers duplicate and the op is cleared.
    await quiet(a);
    await waitFor('B has it', async () => { await settle(a, b); return rec(b, 'pipeline', 'p-dup'); });
    expect(faults.pushes - pushesBefore).toBeGreaterThanOrEqual(2);
    expect(feedCount('pipeline', 'p-dup')).toBe(1);
    expect(hubRows<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE entity_id = ?', 'p-dup')[0]!.n).toBe(1);
    expect(await status(a)).toMatchObject({ pending: 0, quarantined: 0, conflicts: 0 });
  }, 60_000);

  it('turns a concurrent pipeline edit into an inbox conflict and resolves it with "mine" and "both"', async () => {
    await upsert(a, 'pipeline', 'p-conf', pipeline('p-conf', 'Base'));
    await upsert(a, 'pipeline', 'p-conf2', pipeline('p-conf2', 'Base 2'));
    await waitFor('B has the seeds', async () => { await settle(a, b); return rec(b, 'pipeline', 'p-conf') && rec(b, 'pipeline', 'p-conf2'); });

    await b.rpc('sync.setPaused', { paused: true });
    await upsert(a, 'pipeline', 'p-conf', pipeline('p-conf', 'Edited on A'));
    await upsert(a, 'pipeline', 'p-conf2', pipeline('p-conf2', 'Edited on A 2'));
    await upsert(b, 'pipeline', 'p-conf', pipeline('p-conf', 'Edited on B'));
    await upsert(b, 'pipeline', 'p-conf2', pipeline('p-conf2', 'Edited on B 2'));
    await quiet(a);
    await b.rpc('sync.setPaused', { paused: false });

    await waitFor('B reports both conflicts', async () => { await b.rpc('sync.now', {}); return (await conflictsOf(b)).length === 2; }, 30_000);
    // The Hub version applied locally, the local version preserved in the inbox, nothing sent for it.
    expect(rec(b, 'pipeline', 'p-conf')).toMatchObject({ name: 'Edited on A' });
    const views = await conflictsOf(b);
    const first = views.find((v) => v.entityId === 'p-conf')!;
    const second = views.find((v) => v.entityId === 'p-conf2')!;
    expect(first).toMatchObject({ kind: 'edit-edit', localPayload: { name: 'Edited on B' }, remotePayload: { name: 'Edited on A' } });
    expect(first.canKeepBoth).toBe(true);
    expect(await conflictsOf(a)).toHaveLength(0);
    expect(hubRecord('pipeline', 'p-conf')?.payload_json).toContain('Edited on A');

    // Resolve "mine": the local version is re-journaled on top of the Hub revision and converges everywhere.
    expect(await b.rpc('sync.conflicts.resolve', { id: first.id, choice: 'mine' })).toMatchObject({ ok: true });
    await waitFor('A converges on mine', async () => { await settle(b, a); return rec(a, 'pipeline', 'p-conf')?.['name'] === 'Edited on B'; }, 30_000);
    expect(rec(b, 'pipeline', 'p-conf')).toMatchObject({ name: 'Edited on B' });

    // Resolve "both": the local version is forked into a copy, the Hub's stays on the original.
    expect(await b.rpc('sync.conflicts.resolve', { id: second.id, choice: 'both' })).toMatchObject({ ok: true });
    const copyOn = (agent: Agent) => listRecords(agent.store.db, 'pipeline').find((r) => r.entityId !== 'p-conf2' && String((r.payload as { name: string }).name).startsWith('Edited on B 2'));
    await waitFor('both devices have the renamed copy', async () => { await settle(b, a); return copyOn(a) && copyOn(b); }, 30_000);
    expect((copyOn(a)!.payload as { name: string }).name).toContain('(conflict copy)');
    expect(rec(a, 'pipeline', 'p-conf2')).toMatchObject({ name: 'Edited on A 2' });
    expect(rec(b, 'pipeline', 'p-conf2')).toMatchObject({ name: 'Edited on A 2' });
    expect(await conflictsOf(b)).toHaveLength(0);
    expect(await status(b)).toMatchObject({ pending: 0, conflicts: 0 });
  }, 120_000);

  it('auto-merges concurrent project edits to different fields and takes the later lastActivatedAt', async () => {
    const t1 = '2026-03-01T10:00:00.000Z';
    const t2 = '2026-03-02T10:00:00.000Z';
    await upsert(a, 'project', 'proj-merge', project('proj-merge', { name: 'Name', description: 'Desc', lastActivatedAt: T0 }));
    await waitFor('B has the project', async () => { await settle(a, b); return rec(b, 'project', 'proj-merge'); });

    await b.rpc('sync.setPaused', { paused: true });
    await upsert(a, 'project', 'proj-merge', project('proj-merge', { name: 'Renamed on A', description: 'Desc', lastActivatedAt: t1 }));
    await upsert(b, 'project', 'proj-merge', project('proj-merge', { name: 'Name', description: 'Described on B', lastActivatedAt: t2 }));
    await quiet(a);
    await b.rpc('sync.setPaused', { paused: false });

    const merged = { name: 'Renamed on A', description: 'Described on B', lastActivatedAt: t2 };
    await waitFor('both devices hold the merge', async () => { await settle(b, a); return rec(a, 'project', 'proj-merge')?.['description'] === 'Described on B' && rec(b, 'project', 'proj-merge')?.['name'] === 'Renamed on A'; }, 30_000);
    expect(rec(a, 'project', 'proj-merge')).toMatchObject(merged);
    expect(rec(b, 'project', 'proj-merge')).toMatchObject(merged);
    expect(await conflictsOf(a)).toHaveLength(0);
    expect(await conflictsOf(b)).toHaveLength(0);
    expect(await status(b)).toMatchObject({ pending: 0, quarantined: 0 });
  }, 90_000);

  it('reports an edit-delete conflict instead of resurrecting a record deleted elsewhere', async () => {
    await upsert(a, 'pipeline', 'p-del', pipeline('p-del', 'To delete'));
    await waitFor('B has it', async () => { await settle(a, b); return rec(b, 'pipeline', 'p-del'); });

    await b.rpc('sync.setPaused', { paused: true });
    await remove(a, 'pipeline', 'p-del');
    await quiet(a);
    await upsert(b, 'pipeline', 'p-del', pipeline('p-del', 'Edited while deleted'));
    await b.rpc('sync.setPaused', { paused: false });

    await waitFor('B reports the conflict', async () => { await b.rpc('sync.now', {}); return (await conflictsOf(b)).some((v) => v.entityId === 'p-del'); }, 30_000);
    const view = (await conflictsOf(b)).find((v) => v.entityId === 'p-del')!;
    expect(view).toMatchObject({ kind: 'edit-delete', remoteDeleted: true, localPayload: { name: 'Edited while deleted' } });
    // The delete wins on the Hub and locally; the tombstone reached B; the record was not recreated anywhere.
    expect(rec(b, 'pipeline', 'p-del')).toBeUndefined();
    expect(rec(a, 'pipeline', 'p-del')).toBeUndefined();
    expect(hubRecord('pipeline', 'p-del')).toMatchObject({ deleted: 1, payload_json: null });
    await settle(a, b);
    expect(hubRecord('pipeline', 'p-del')).toMatchObject({ deleted: 1 });
    expect(await b.rpc('sync.conflicts.resolve', { id: view.id, choice: 'hub' })).toMatchObject({ ok: true });
    expect(await conflictsOf(b)).toHaveLength(0);
  }, 90_000);

  it('reports first-sync collisions and merges them into the inbox and a renamed copy', async () => {
    // A seeded Hub item with the same name as C's "c-named", and a Hub pipeline with C's id but different content.
    await upsert(a, 'pipeline', 'p-shared', pipeline('p-shared', 'Shared'));
    await upsert(a, 'pipeline', 'p-hub-named', pipeline('p-hub-named', 'Same name'));
    await quiet(a);
    await enroll(c);
    expect((await status(c)).phase).toBe('needs-first-sync');
    const preview = await c.rpc('sync.firstSync.preview', {});
    const pipelines = preview.categories.find((cat) => cat.category === 'pipelines')!;
    expect(pipelines.sameIdDifferent.map((e) => e.entityId)).toContain('p-shared');
    expect(pipelines.sameNameDifferentId).toContainEqual({ entityType: 'pipeline', name: 'Same name', localId: 'c-named', hubId: 'p-hub-named' });
    expect(preview.categories.find((cat) => cat.category === 'favorites')).toMatchObject({ localOnly: 1 });

    await c.rpc('sync.firstSync.apply', { choices: { 'workspace-layout': 'merge', scratchpad: 'merge', usage: 'merge' }, digest: preview.digest, ...(preview.confirmToken ? { confirmToken: preview.confirmToken } : {}) });
    const views = await conflictsOf(c);
    expect(views.find((v) => v.entityId === 'p-shared')).toMatchObject({ kind: 'first-sync', localPayload: { name: 'Shared (local copy)' }, remotePayload: { name: 'Shared' } });
    expect(rec(c, 'pipeline', 'p-shared')).toMatchObject({ name: 'Shared' });
    expect(rec(c, 'pipeline', 'c-named')).toMatchObject({ name: 'Same name (this device)' });
    await waitFor('the renamed copy and the favorite reach A', async () => { await settle(c, a); return rec(a, 'pipeline', 'c-named')?.['name'] === 'Same name (this device)' && rec(a, 'favorite', 'tool:c-only'); }, 30_000);
    expect(rec(a, 'pipeline', 'p-hub-named')).toMatchObject({ name: 'Same name' });
    await c.rpc('sync.conflicts.resolve', { id: views.find((v) => v.entityId === 'p-shared')!.id, choice: 'hub' });
    expect(await conflictsOf(c)).toHaveLength(0);
  }, 90_000);

  it('strands pending ops of a revoked device, stops its Hub writes and lets it continue standalone with its data', async () => {
    const idB = b.store.device.deviceId;
    await upsert(a, 'pipeline', 'p-keep', pipeline('p-keep', 'Keep me'));
    await waitFor('B has it', async () => { await settle(a, b); return rec(b, 'pipeline', 'p-keep'); });

    await b.rpc('sync.setPaused', { paused: true });
    await upsert(b, 'pipeline', 'p-b-pending', pipeline('p-b-pending', 'Pending on B'));
    expect((await status(b)).pending).toBeGreaterThanOrEqual(1);
    const headBefore = hubHead();

    const preview = await a.rpc('hub.owner.revokeDevicePreview', { deviceId: idB });
    await a.rpc('hub.owner.revokeDevice', { deviceId: idB, confirmToken: preview.confirmToken });
    await b.rpc('sync.setPaused', { paused: false });
    await waitFor('B is revoked with its ops stranded', async () => { const s = await b.rpc('sync.now', {}); return s.phase === 'revoked' && s.stranded >= 1 ? s : undefined; }, 30_000);
    // A new edit on a revoked device is stranded at write; nothing reaches the Hub.
    await upsert(b, 'pipeline', 'p-b-after', pipeline('p-b-after', 'After revoke'));
    const s = await b.rpc('sync.now', {});
    expect(s).toMatchObject({ phase: 'revoked', pending: 0 });
    expect(s.stranded).toBeGreaterThanOrEqual(2);
    await expect(b.hub.manager.deviceCall((api, token) => api.syncPush(token, [{
      opId: 'forged-after-revoke', entityType: 'pipeline', entityId: 'p-b-forged', opKind: 'upsert', schemaVersion: 1, basedOnRevision: null, payload: pipeline('p-b-forged', 'Forged'),
    }]))).rejects.toBeTruthy();
    expect(hubRecord('pipeline', 'p-b-pending')).toBeUndefined();
    expect(hubRecord('pipeline', 'p-b-after')).toBeUndefined();
    expect(hubRecord('pipeline', 'p-b-forged')).toBeUndefined();
    expect(hubHead()).toBe(headBefore);
    const raw = await hub.request('POST', '/api/v1/sync/push', { ops: [{ opId: 'no-credentials', entityType: 'pipeline', entityId: 'p-none', opKind: 'delete', schemaVersion: 1, basedOnRevision: null, payload: null }] });
    expect(raw.status).toBe(401);

    // Continue standalone: the data stays, the undelivered ops are dropped, sync stops.
    const standalone = await b.rpc('sync.standalone.preview', {});
    expect(standalone.strandedOps).toBeGreaterThanOrEqual(2);
    expect(await b.rpc('sync.standalone.apply', { confirmToken: standalone.confirmToken, digest: standalone.digest })).toMatchObject({ phase: 'standalone', stranded: 0, pending: 0 });
    expect(rec(b, 'pipeline', 'p-b-pending')).toMatchObject({ name: 'Pending on B' });
    expect(rec(b, 'pipeline', 'p-keep')).toMatchObject({ name: 'Keep me' });
    expect(HubApiError).toBeDefined();
  }, 90_000);

  it('rebases a device whose cursor fell below the compaction floor without losing or resurrecting anything', async () => {
    await upsert(a, 'pipeline', 'p-gone', pipeline('p-gone', 'Will be deleted'));
    await upsert(a, 'pipeline', 'p-gone-edit', pipeline('p-gone-edit', 'Deleted, but C edits it'));
    await waitFor('C has both', async () => { await settle(a, c); return rec(c, 'pipeline', 'p-gone') && rec(c, 'pipeline', 'p-gone-edit'); });
    await quiet(c);

    // C goes quiet with an old cursor; its pending edit targets a record that is deleted meanwhile.
    await c.rpc('sync.setPaused', { paused: true });
    await upsert(c, 'pipeline', 'p-gone-edit', pipeline('p-gone-edit', 'C edit of a deleted record'));
    await upsert(c, 'pipeline', 'p-c-offline', pipeline('p-c-offline', 'Created on C while stale'));
    const staleCursor = (await status(c)).cursor;
    await remove(a, 'pipeline', 'p-gone');
    await remove(a, 'pipeline', 'p-gone-edit');
    await upsert(a, 'pipeline', 'p-after', pipeline('p-after', 'After'));
    await quiet(a);

    // Compact: a tiny retention window applies at the Hub's startup, so everything above falls below the floor.
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    await hub.restart({ DUDE_HUB_TEST_SYNC_RETENTION_DAYS: '0.00003' });
    await waitFor('A online', () => a.hub.manager.status().state === 'online', 30_000);
    expect(hubRows<{ value: string }>("SELECT value FROM meta WHERE key = 'sync_floor'")[0]!.value).not.toBe('0');
    expect(hubRecord('pipeline', 'p-gone')).toBeUndefined();
    await expect(c.hub.manager.deviceCall((api, token) => api.syncChanges(token, staleCursor, 10))).rejects.toMatchObject({ status: 410, code: 'cursor-expired' });

    await c.rpc('sync.setPaused', { paused: false });
    await waitFor('C rebased and converged', async () => {
      const s = await c.rpc('sync.now', {});
      return s.cursor > staleCursor && s.pending === 0 && rec(c, 'pipeline', 'p-after') ? s : undefined;
    }, 20_000).catch(async (error: unknown) => { throw new Error(`${String(error)} ${JSON.stringify(await status(c))} ${JSON.stringify(await conflictsOf(c))}`); });
    await settle(a, c);
    // Deleted records are gone from C and were not re-uploaded; the pending create survived and reached the Hub.
    expect(rec(c, 'pipeline', 'p-gone')).toBeUndefined();
    expect(rec(a, 'pipeline', 'p-gone')).toBeUndefined();
    expect(hubRecord('pipeline', 'p-gone')).toBeUndefined();
    expect(hubRecord('pipeline', 'p-gone-edit')?.payload_json ?? null).toBeNull();
    expect(rec(c, 'pipeline', 'p-gone-edit')).toBeUndefined();
    expect(rec(a, 'pipeline', 'p-gone-edit')).toBeUndefined();
    expect(hubRecord('pipeline', 'p-c-offline')).toMatchObject({ deleted: 0 });
    expect(rec(a, 'pipeline', 'p-c-offline')).toMatchObject({ name: 'Created on C while stale' });
    // The edit of the deleted record is kept for the user in the inbox, not lost.
    expect((await conflictsOf(c)).find((v) => v.entityId === 'p-gone-edit')).toMatchObject({ kind: 'edit-delete', localPayload: { name: 'C edit of a deleted record' } });
  }, 120_000);

  it('keeps the Hub free of device-only data, secrets and payload text in its audit log', async () => {
    // Device-local state on A that must never leave it.
    await kvSet(a, 'settings.ai', 'baseUrl', `https://${DEVICE_ONLY_MARKER}.example`, 'device');
    await kvSet(a, 'settings.ai', 'model', DEVICE_ONLY_MARKER, 'device');
    await kvSet(a, 'some-app-namespace', 'draft', DEVICE_ONLY_MARKER);
    await a.rpc('history.add', { entry: { id: 'h1', toolId: 'base64', createdAt: Date.now(), sizeBytes: 10, payload: { input: DEVICE_ONLY_MARKER } } });
    await a.rpc('network.add', { run: { id: 'n1', createdAt: Date.now(), sizeBytes: 10, payload: { url: DEVICE_ONLY_MARKER } } });
    await a.rpc('journal.append', { engine: 'fs', entry: { planId: '11111111-1111-4111-8111-111111111111', appliedAt: T0, note: DEVICE_ONLY_MARKER } });
    await upsert(a, 'native-recents', 'default', { schemaVersion: 1, entries: [{ path: `C:\\${DEVICE_ONLY_MARKER}`, name: 'f', extension: 'txt', openedAt: T0 }] }).catch(() => undefined);
    await settle(a, c);

    const types = hubRows<{ entity_type: string }>('SELECT DISTINCT entity_type FROM records').map((r) => r.entity_type);
    for (const type of types) expect(SYNC_ENTITY_TYPES as readonly string[]).toContain(type);
    for (const type of hubRows<{ entity_type: string }>('SELECT DISTINCT entity_type FROM change_feed').map((r) => r.entity_type)) expect(SYNC_ENTITY_TYPES as readonly string[]).toContain(type);
    expect(types).toEqual(expect.arrayContaining(['pipeline', 'project', 'usage', 'scratchpad']));

    // Every setting row is an environment-scope tool preference or core key, never a device or local-only one.
    for (const row of hubRows<{ entity_id: string }>("SELECT entity_id FROM records WHERE entity_type = 'setting'")) {
      const [namespace, key] = [row.entity_id.slice(0, row.entity_id.indexOf(':')), row.entity_id.slice(row.entity_id.indexOf(':') + 1)];
      expect(namespace).not.toBe('settings.ai');
      expect(namespace).not.toBe('some-app-namespace');
      expect(isSyncableSettingKey(namespace, key, [{ id: 'base64', persistence: { preferences: 'local' } }])).toBe(true);
    }

    // Scan every text column of every table: device-only markers appear nowhere; the sync marker only in record payloads.
    const db = new DatabaseSync(path.join(hub.dir, 'data', 'dude.db'), { readOnly: true });
    try {
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((t) => t.name);
      expect(tables).not.toEqual(expect.arrayContaining(['history', 'network_runs', 'journal', 'secrets']));
      for (const table of tables) {
        const rows = db.prepare(`SELECT * FROM "${table}"`).all();
        const text = JSON.stringify(rows, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v));
        expect(text, `${table} must not hold device-only data`).not.toContain(DEVICE_ONLY_MARKER);
        if (table !== 'records') expect(text, `${table} must not hold payload text`).not.toContain(MARKER);
      }
      const auditText = JSON.stringify(db.prepare('SELECT * FROM audit_events').all());
      expect(auditText).not.toContain('Pending on B');
      expect(auditText).not.toContain('Edited on A');
      expect(db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE event LIKE ?').get('sync.%')).toMatchObject({ n: expect.any(Number) });
    } finally { db.close(); }
    expect(hubRows<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE payload_json LIKE ?', `%${MARKER}%`)[0]!.n).toBeGreaterThan(0);
  }, 60_000);

  it('clears the environment from the Hub through an owner-signed-in agent: records are tombstoned and other devices delete them', async () => {
    await a.rpc('hub.owner.signIn', { password: PASSWORD }).catch(() => undefined);
    expect((await a.rpc('hub.owner.status', {})).signedIn).toBe(true);
    await settle(a, c);
    expect(listRecords(c.store.db, 'pipeline').length).toBeGreaterThan(0);
    const liveBefore = hubRows<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE deleted = 0')[0]!.n;
    expect(liveBefore).toBeGreaterThan(0);

    const preview = await a.rpc('reset.preview', { kind: 'clear-data', deleteFromHub: true });
    expect(preview.hub?.recordCount).toBe(liveBefore);
    const applied = await a.rpc('reset.apply', { kind: 'clear-data', digest: preview.digest, deleteFromHub: true });
    expect(applied).toMatchObject({ ok: true, hubDeleted: liveBefore });
    expect(hubRows<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE deleted = 0')[0]!.n).toBe(0);
    expect(hubRows<{ n: number }>("SELECT COUNT(*) AS n FROM records WHERE deleted = 1 AND payload_json IS NOT NULL")[0]!.n).toBe(0);

    await waitFor('C deletes everything the Hub deleted', async () => {
      await c.rpc('sync.now', {});
      return ['pipeline', 'project', 'favorite', 'user-script', 'workspace-template', 'home-layout', 'usage'].every((t) => listRecords(c.store.db, t).length === 0)
        && kv(c, 'settings', 'appearance') === undefined && kv(c, '__workspace__', 'scratchpad') === undefined;
    }, 45_000);
    // The audit log of the whole run still carries no payload text.
    const audit = JSON.stringify(hubRows('SELECT * FROM audit_events'));
    expect(audit).not.toContain(MARKER);
  }, 90_000);
});
