import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HUB_REALTIME_PATH, SYNC_CURSOR_EXPIRED } from '@dude/contracts/hub';
import { SYNC_LIMITS } from '@dude/sync';
import { startAuthHub } from '../auth-test-helpers.js';
import type { AuthHub, Signed } from '../auth-test-helpers.js';
import { deviceToken, enrolled } from '../device-test-helpers.js';
import type { SimDevice } from '../device-test-helpers.js';
import { listAudit } from '../../security/audit.js';

const DAY = 24 * 3600_000;
let n = 0;
const op = (over: Record<string, unknown> = {}) => ({
  opId: `op-${++n}-${Math.random().toString(36).slice(2)}`, entityType: 'favorite', entityId: 'tool:a', opKind: 'upsert', schemaVersion: 1,
  basedOnRevision: null, payload: { id: 'tool:a', kind: 'tool', targetId: 'a', order: 0 }, ...over,
});
const fav = (id: string, over: Record<string, unknown> = {}) => op({ entityId: `tool:${id}`, payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order: 0 }, ...over });
const setting = (value: unknown, over: Record<string, unknown> = {}) => op({
  entityType: 'setting', entityId: 'settings:appearance', payload: { namespace: 'settings', key: 'appearance', value }, ...over,
});
const scratch = (over: Record<string, unknown> = {}) => op({
  entityType: 'scratchpad', entityId: 'default', payload: { schemaVersion: 1, snippets: [], drawerExpanded: false }, ...over,
});

interface Sock { ws: WebSocket; events: Array<Record<string, any>>; close(): void }

describe('sync routes', () => {
  let h: AuthHub;
  let owner: Signed;
  let a: { device: SimDevice; token: string };
  let b: { device: SimDevice; token: string };
  beforeAll(async () => {
    h = await startAuthHub({ sync: { compactionIntervalMs: 0, retentionDays: 1 } });
    owner = await h.signIn();
    a = await enrolled(h, owner);
    b = await enrolled(h, owner);
  });
  afterAll(async () => { await h.close(); });

  const push = (token: string, ops: unknown[]) => h.call('POST', '/sync/push', { bearer: token, body: { ops } });
  const changes = (token: string, after: number, limit?: number) => h.call('GET', `/sync/changes?after=${after}${limit ? `&limit=${limit}` : ''}`, { bearer: token });
  const ownerAuth = () => ({ cookie: owner.cookie, csrf: owner.csrf });

  function connect(token: string): Promise<Sock> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers: { authorization: `Bearer ${token}` } });
      const events: Array<Record<string, any>> = [];
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'welcome') resolve({ ws, events, close: () => ws.close() });
        if (m.type === 'event') events.push(m);
      });
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 })));
    });
  }
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  async function waitFor(predicate: () => boolean, ms = 2000): Promise<boolean> {
    const until = Date.now() + ms;
    while (Date.now() < until) { if (predicate()) return true; await sleep(20); }
    return predicate();
  }

  it('two devices converge through push and changes, and the origin socket is not nudged', async () => {
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const res = await push(a.token, [fav('one'), fav('two')]);
    expect(res.status).toBe(200);
    expect(res.json.results.map((r: any) => r.status)).toEqual(['applied', 'applied']);
    expect(res.json.headRevision).toBe(res.json.results[1].revision);

    expect(await waitFor(() => sb.events.length > 0)).toBe(true);
    expect(sb.events[0]).toMatchObject({ event: 'changes-available', data: { revision: res.json.headRevision } });
    await sleep(100);
    expect(sa.events.filter((e) => e.event === 'changes-available')).toEqual([]);

    const pulled = await changes(b.token, 0);
    expect(pulled.status).toBe(200);
    expect(pulled.json.changes.map((c: any) => c.entityId)).toEqual(['tool:one', 'tool:two']);
    expect(pulled.json.cursor).toBe(res.json.headRevision);
    expect(pulled.json.hasMore).toBe(false);
    expect(pulled.json.changes[0]).toMatchObject({ updatedByDeviceId: a.device.deviceId, deleted: false });

    // b changes one, a deletes two; both see the other's change; paging works
    await push(b.token, [fav('one', { payload: { id: 'tool:one', kind: 'tool', targetId: 'one', order: 9 } }), fav('two', { opKind: 'delete', payload: null })]);
    const back = await changes(a.token, pulled.json.cursor);
    expect(back.json.changes.map((c: any) => [c.entityId, c.deleted])).toEqual([['tool:one', false], ['tool:two', true]]);
    const paged = await changes(a.token, 0, 1);
    expect(paged.json.hasMore).toBe(true);
    expect(paged.json.changes).toHaveLength(1);
    expect(paged.json.cursor).toBe(paged.json.changes[0].revision);
    sa.close(); sb.close();
  });

  it('a duplicate opId after a dropped ack returns duplicate and writes a single change', async () => {
    const o = fav('dup');
    const first = await push(a.token, [o]);
    const before = h.hub.hub.db.prepare('SELECT COUNT(*) AS c FROM change_feed').get() as { c: number };
    const again = await push(a.token, [o]);
    expect(again.json.results[0]).toEqual({ opId: o.opId, status: 'duplicate', revision: first.json.results[0].revision });
    expect((h.hub.hub.db.prepare('SELECT COUNT(*) AS c FROM change_feed').get() as { c: number }).c).toBe(before.c);
  });

  it('a stale base on a merge3 entity conflicts and returns the current record', async () => {
    const first = await push(a.token, [scratch()]);
    const rev = first.json.results[0].revision;
    const second = await push(b.token, [scratch({ basedOnRevision: rev, payload: { schemaVersion: 1, snippets: [], drawerExpanded: true } })]);
    expect(second.json.results[0].status).toBe('applied');
    const stale = await push(a.token, [scratch({ basedOnRevision: rev })]);
    expect(stale.json.results[0]).toMatchObject({ status: 'conflict', current: { entityType: 'scratchpad', revision: second.json.results[0].revision, payload: { drawerExpanded: true } } });
    // last-writer-wins entities never conflict
    const l1 = await push(a.token, [setting('dark')]);
    const l2 = await push(b.token, [setting('light', { basedOnRevision: null })]);
    expect([l1.json.results[0].status, l2.json.results[0].status]).toEqual(['applied', 'applied']);
  });

  it('rejects per-op without rolling back the rest', async () => {
    const big = fav('big', { payload: { id: 'tool:big', kind: 'tool', targetId: 'x'.repeat(SYNC_LIMITS.maxRecordBytes + 10), order: 0 } });
    const res = await push(a.token, [
      fav('ok1'),
      op({ entityType: 'setting', entityId: 'settings:nope', payload: { namespace: 'settings', key: 'nope', value: 1 } }),
      op({ entityType: 'setting', entityId: 'settings.ai:baseUrl', payload: { namespace: 'settings.ai', key: 'baseUrl', value: 'x' } }),
      big,
      op({ entityType: 'usage', entityId: b.device.deviceId, payload: {} }),
      op({ entityType: 'bogus', entityId: 'x', payload: {} }),
      fav('ok2'),
    ]);
    expect(res.status).toBe(200);
    expect(res.json.results.map((r: any) => r.status === 'rejected' ? r.reason : r.status)).toEqual([
      'applied', 'unknown-setting', 'unknown-setting', 'too-large', 'not-owner-device', 'unknown-entity', 'applied',
    ]);
    const audit = listAudit(h.hub.hub.db, { limit: 5 }).find((r) => r.event === 'sync.pushed')!;
    expect(audit.detail).toEqual({ applied: 2, duplicate: 0, conflict: 0, rejected: 5 });
    expect(JSON.stringify(audit)).not.toContain('xxxx');
  });

  it('bad bodies are refused: empty ops, too many ops, oversized body', async () => {
    expect((await push(a.token, [])).status).toBe(400);
    expect((await push(a.token, Array.from({ length: 101 }, () => fav('many')))).status).toBe(400);
    // the server may answer 413 or drop the connection before the client finishes writing; either way nothing is applied
    const huge = await h.call('POST', '/sync/push', { bearer: a.token, body: { ops: [fav('h', { payload: { pad: 'x'.repeat(SYNC_LIMITS.maxPushBytes) } })] } }).catch(() => ({ status: 413 }));
    expect(huge.status).toBe(413);
  });

  it('keeps device and owner credentials apart', async () => {
    expect((await h.call('POST', '/sync/push', { ...ownerAuth(), body: { ops: [fav('x')] } })).status).toBe(403);
    expect((await h.call('GET', '/sync/changes?after=0', ownerAuth())).status).toBe(403);
    expect((await h.call('GET', '/sync/changes?after=0', { noOrigin: true })).status).toBe(401);
    expect((await h.call('GET', '/sync/summary', { bearer: a.token })).status).toBeGreaterThanOrEqual(401);
    expect((await h.call('POST', '/sync/environment/clear/preview', { bearer: a.token })).status).toBeGreaterThanOrEqual(401);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: a.token, body: { password: 'a very long password' } })).json.accessToken as string;
    expect((await h.call('GET', '/sync/changes?after=0', { bearer })).status).toBe(403);
    expect((await h.call('GET', '/sync/summary', { bearer })).status).toBe(200);
  });

  it('a revoked device gets 401 mid-sequence', async () => {
    const c = await enrolled(h, owner);
    expect((await push(c.token, [fav('c1')])).status).toBe(200);
    const p = await h.call('POST', `/devices/${c.device.deviceId}/revoke/preview`, ownerAuth());
    await h.call('POST', `/devices/${c.device.deviceId}/revoke`, { ...ownerAuth(), body: { confirmToken: p.json.confirmToken } });
    expect((await push(c.token, [fav('c2')])).status).toBe(401);
    expect((await changes(c.token, 0)).status).toBe(401);
  });

  it('snapshot pages live records and changes from asOfRevision converge', async () => {
    const s1 = await h.call('GET', '/sync/snapshot?limit=2', { bearer: b.token });
    expect(s1.status).toBe(200);
    expect(s1.json.records).toHaveLength(2);
    expect(s1.json.next).not.toBeNull();
    const asOf = s1.json.asOfRevision as number;
    // a write lands between pages
    await push(a.token, [fav('late')]);
    const seen = new Map<string, any>(s1.json.records.map((r: any) => [`${r.entityType}/${r.entityId}`, r]));
    let next = s1.json.next;
    while (next) {
      const page = await h.call('GET', `/sync/snapshot?limit=2&afterType=${encodeURIComponent(next.afterType)}&afterId=${encodeURIComponent(next.afterId)}`, { bearer: b.token });
      for (const r of page.json.records) seen.set(`${r.entityType}/${r.entityId}`, r);
      next = page.json.next;
    }
    const tail = await changes(b.token, asOf);
    for (const r of tail.json.changes) { if (r.deleted) seen.delete(`${r.entityType}/${r.entityId}`); else seen.set(`${r.entityType}/${r.entityId}`, r); }
    const full = await h.call('GET', '/sync/snapshot?limit=1000', { bearer: a.token });
    expect([...seen.keys()].sort()).toEqual(full.json.records.map((r: any) => `${r.entityType}/${r.entityId}`).sort());
    expect(full.json.records.every((r: any) => !r.deleted)).toBe(true);
    expect((await h.call('GET', '/sync/snapshot?afterType=zzz&afterId=', { bearer: a.token })).status).toBe(400);
  });

  it('state reports feed the owner summary with per-device lag', async () => {
    const head = (await changes(a.token, 0)).json.headRevision as number;
    const flags = Object.fromEntries(['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad'].map((k) => [k, true]));
    const rep = await h.call('PUT', '/sync/state', { bearer: b.token, body: { cursor: 1, pending: 2, quarantined: 1, conflicts: 3, stranded: 0, categories: flags, lastSyncAt: null } });
    expect(rep.status).toBe(200);
    expect(rep.json).toMatchObject({ headRevision: head, floor: 0, retentionDays: 90 });
    const sum = await h.call('GET', '/sync/summary', ownerAuth());
    expect(sum.status).toBe(200);
    expect(sum.json.counts.favorites).toBeGreaterThan(0);
    const row = sum.json.devices.find((d: any) => d.deviceId === b.device.deviceId);
    expect(row).toMatchObject({ cursor: 1, lag: head - 1, quarantined: 1, conflicts: 3, pending: 2 });
    expect(row.lastPushAt).not.toBeNull();
    expect((await h.call('PUT', '/sync/state', { bearer: b.token, body: { cursor: 1 } })).status).toBe(400);
  });

  it('environment clear is a two-step action that tombstones everything for the devices', async () => {
    const pre = await h.call('POST', '/sync/environment/clear/preview', ownerAuth());
    expect(pre.status).toBe(200);
    expect(pre.json.recordCount).toBeGreaterThan(0);
    expect(pre.json.deviceCount).toBeGreaterThanOrEqual(2);
    const live = () => (h.hub.hub.db.prepare('SELECT COUNT(*) AS c FROM records WHERE deleted = 0').get() as { c: number }).c;
    const before = live();
    expect(before).toBe(pre.json.recordCount);
    const head = (await changes(a.token, 0)).json.headRevision as number;
    const sb = await connect(b.token);
    // a changed-since-preview digest is refused with 409 (and burns the token)
    await push(a.token, [fav('after-preview')]);
    expect((await h.call('POST', '/sync/environment/clear', { ...ownerAuth(), body: { confirmationId: pre.json.confirmationId } })).status).toBe(409);
    expect(live()).toBe(before + 1);

    const pre2 = await h.call('POST', '/sync/environment/clear/preview', ownerAuth());
    const done = await h.call('POST', '/sync/environment/clear', { ...ownerAuth(), body: { confirmationId: pre2.json.confirmationId } });
    expect(done.status).toBe(200);
    expect(done.json.deleted).toBe(before + 1);
    expect(live()).toBe(0);
    expect(await waitFor(() => sb.events.some((e) => e.event === 'changes-available'))).toBe(true);
    const tail = await changes(b.token, head);
    expect(tail.json.changes.length).toBe(before + 1);
    expect(tail.json.changes.every((c: any) => c.deleted === true)).toBe(true);
    const events = listAudit(h.hub.hub.db, { limit: 10 }).map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(['sync.environment-cleared', 'sync.environment-clear-previewed']));
    // replay is refused
    expect((await h.call('POST', '/sync/environment/clear', { ...ownerAuth(), body: { confirmationId: pre2.json.confirmationId } })).status).toBe(403);
    sb.close();
  });

  it('a cursor below the floor answers 410 cursor-expired after compaction; a fresh snapshot recovers', async () => {
    await push(a.token, [fav('keep')]);
    await push(a.token, [fav('gone')]);
    await push(a.token, [fav('gone', { opKind: 'delete', payload: null })]);
    h.clock.t += 2 * DAY;
    a.token = (await deviceToken(h, a.device)).token;
    b.token = (await deviceToken(h, b.device)).token;
    const late = await push(a.token, [fav('late2')]);
    expect(late.status).toBe(200);
    const result = h.hub.app.syncCompaction.run();
    expect(result?.floor).toBeGreaterThan(0);
    expect(result?.tombstones).toBeGreaterThan(0);
    expect(h.hub.app.syncCompaction.run()).toBeNull();
    expect(listAudit(h.hub.hub.db, { limit: 5 }).some((r) => r.event === 'sync.compacted')).toBe(true);

    const expired = await changes(b.token, 0);
    expect(expired.status).toBe(410);
    expect(expired.json.error.code).toBe(SYNC_CURSOR_EXPIRED);
    const ok = await changes(b.token, result!.floor);
    expect(ok.status).toBe(200);
    expect(ok.json.floor).toBe(result!.floor);
    expect(ok.json.changes.map((c: any) => c.entityId)).toContain('tool:late2');
    const snap = await h.call('GET', '/sync/snapshot', { bearer: b.token });
    expect(snap.json.floor).toBe(result!.floor);
    expect(snap.json.records.map((r: any) => r.entityId)).toEqual(expect.arrayContaining(['tool:keep', 'tool:late2']));
  });
});
