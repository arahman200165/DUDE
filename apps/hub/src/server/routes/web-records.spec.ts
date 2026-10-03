import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HUB_REALTIME_PATH } from '@dude/contracts/hub';
import { startAuthHub } from '../auth-test-helpers.js';
import type { AuthHub, Signed } from '../auth-test-helpers.js';
import { deviceToken, enroll, enrolled, newDevice } from '../device-test-helpers.js';
import type { SimDevice } from '../device-test-helpers.js';
import { listAudit } from '../../security/audit.js';
import { isDeviceActive, pruneBrowserDevices } from '../../devices/registry.js';

const DAY = 24 * 3600_000;
let n = 0;
const op = (over: Record<string, unknown> = {}) => ({
  opId: `wop-${++n}-${Math.random().toString(36).slice(2)}`, entityType: 'favorite', entityId: 'tool:a', opKind: 'upsert', schemaVersion: 1,
  basedOnRevision: null, payload: { id: 'tool:a', kind: 'tool', targetId: 'a', order: 0 }, ...over,
});
const fav = (id: string, over: Record<string, unknown> = {}) => op({ entityId: `tool:${id}`, payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order: 0 }, ...over });
const scratch = (over: Record<string, unknown> = {}) => op({
  entityType: 'scratchpad', entityId: 'default', payload: { schemaVersion: 1, snippets: [], drawerExpanded: false }, ...over,
});
const usage = (deviceId: string, over: Record<string, unknown> = {}) => op({
  entityType: 'usage', entityId: deviceId,
  payload: { schemaVersion: 2, counts: {}, recentLog: [], dailyBuckets: [], trackingStartedOn: null, deviceId }, ...over,
});
const FLAGS = Object.fromEntries(['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad'].map((k) => [k, true]));

interface Sock { ws: WebSocket; events: Array<Record<string, any>>; close(): void }
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const sessionHash = (s: Signed): string => createHash('sha256').update(s.cookie).digest('hex');

describe('web record routes', () => {
  let h: AuthHub;
  let owner: Signed;
  let desktop: { device: SimDevice; token: string };
  beforeAll(async () => {
    h = await startAuthHub({ sync: { compactionIntervalMs: 0, retentionDays: 1 } });
    owner = await h.signIn();
    desktop = await enrolled(h, owner);
  });
  afterAll(async () => { await h.close(); });

  const auth = (s: Signed = owner) => ({ cookie: s.cookie, csrf: s.csrf });
  const attach = (s: Signed = owner, installationId = 'install-main-0001', label = 'Chrome on Mac') =>
    h.call('POST', '/web/attach', { ...auth(s), body: { installationId, label } });
  const wpush = (s: Signed, ops: unknown[]) => h.call('POST', '/web/push', { ...auth(s), body: { ops } });
  const wchanges = (s: Signed, after = 0, limit?: number) => h.call('GET', `/web/changes?after=${after}${limit ? `&limit=${limit}` : ''}`, auth(s));
  const dpush = (ops: unknown[]) => h.call('POST', '/sync/push', { bearer: desktop.token, body: { ops } });
  const setAccess = (category: string, enabled: boolean) => h.call('PUT', '/web/access', { ...auth(), body: { category, enabled } });
  const row = (sql: string, ...args: Array<string | number>) => h.hub.hub.db.prepare(sql).get(...args) as any;

  function connect(s: Signed): Promise<Sock> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, {
        ca: h.hub.tls.certPem, headers: { cookie: `__Host-dude_session=${s.cookie}`, origin: `https://127.0.0.1:${h.hub.port}` },
      });
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
  async function waitFor(predicate: () => boolean, ms = 2000): Promise<boolean> {
    const until = Date.now() + ms;
    while (Date.now() < until) { if (predicate()) return true; await sleep(20); }
    return predicate();
  }

  it('attaches, reuses the row for the same installation and rebinds on another', async () => {
    const first = await attach();
    expect(first.status).toBe(200);
    expect(first.raw.headers['cache-control']).toBe('no-store');
    expect(first.json).toMatchObject({ label: 'Chrome on Mac', floor: 0, retentionDays: 90 });
    expect(first.json.access).toMatchObject({ settings: true, favorites: true, usage: false, 'workspace-layout': false, scratchpad: false });
    const id = first.json.deviceId as string;
    expect(row('SELECT browser_device_id FROM sessions WHERE session_hash = ?', sessionHash(owner)).browser_device_id).toBe(id);

    const again = await attach(owner, 'install-main-0001', 'Renamed browser');
    expect(again.json.deviceId).toBe(id);
    expect(again.json.label).toBe('Renamed browser');
    expect(row("SELECT COUNT(*) AS c FROM devices WHERE kind = 'browser'").c).toBe(1);

    const other = await attach(owner, 'install-other-0002', 'Firefox');
    expect(other.json.deviceId).not.toBe(id);
    expect(row('SELECT browser_device_id FROM sessions WHERE session_hash = ?', sessionHash(owner)).browser_device_id).toBe(other.json.deviceId);
    expect((await attach(owner, 'install-main-0001', 'Chrome on Mac')).json.deviceId).toBe(id);

    const audits = listAudit(h.hub.hub.db, { limit: 10 }).filter((r) => r.event === 'web.attached');
    expect(audits.length).toBeGreaterThanOrEqual(4);
    expect(audits[0]!.detail).toEqual({ deviceId: id });

    const list = await h.call('GET', '/devices', auth());
    const browsers = list.json.filter((d: any) => d.kind === 'browser');
    expect(browsers).toHaveLength(2);
    expect(browsers[0]).toMatchObject({ platform: 'web', capabilities: [], recoveryTrusted: false });
    expect(list.json.find((d: any) => d.deviceId === desktop.device.deviceId).kind).toBe('desktop');
  });

  it('rejects bad attach bodies', async () => {
    expect((await h.call('POST', '/web/attach', { ...auth(), body: { installationId: 'short', label: 'x' } })).status).toBe(400);
    expect((await h.call('POST', '/web/attach', { ...auth(), body: { installationId: 'install-main-0001', label: '' } })).status).toBe(400);
    expect((await h.call('POST', '/web/attach', { ...auth(), body: { installationId: 'install-main-0001', label: '   ' } })).status).toBe(400);
    expect((await h.call('POST', '/web/attach', { ...auth(), body: { installationId: 'bad id with spaces!', label: 'x' } })).status).toBe(400);
  });

  it('is cookie only, and CSRF is required on mutations', async () => {
    const noCsrf = { cookie: owner.cookie };
    expect((await h.call('POST', '/web/attach', { ...noCsrf, body: { installationId: 'install-main-0001', label: 'x' } })).status).toBe(403);
    expect((await h.call('PUT', '/web/access', { ...noCsrf, body: { category: 'usage', enabled: true } })).status).toBe(403);
    expect((await h.call('POST', '/web/push', { ...noCsrf, body: { ops: [fav('c')] } })).status).toBe(403);
    expect((await h.call('PUT', '/web/state', { ...noCsrf, body: {} })).status).toBe(403);
    expect((await h.call('GET', '/web/changes?after=0', { noOrigin: true })).status).toBe(401);
    // an owner bearer session and a device token never reach these routes
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: desktop.token, body: { password: 'a very long password' } })).json.accessToken as string;
    for (const credential of [bearer, desktop.token]) {
      for (const [method, path, body] of [['GET', '/web/changes?after=0'], ['GET', '/web/snapshot'], ['GET', '/web/access'], ['POST', '/web/attach', { installationId: 'install-main-0001', label: 'x' }], ['POST', '/web/push', { ops: [fav('c')] }]] as const) {
        const res = await h.call(method, path, { bearer: credential, ...(body ? { body } : {}) });
        expect([401, 403], `${method} ${path}`).toContain(res.status);
      }
    }
  });

  it('answers 409 not-attached until the session attaches', async () => {
    const fresh = await h.signIn();
    for (const res of [await wchanges(fresh), await h.call('GET', '/web/snapshot', auth(fresh)), await wpush(fresh, [fav('na')]),
      await h.call('PUT', '/web/state', { ...auth(fresh), body: { cursor: 0, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories: FLAGS, lastSyncAt: null } })]) {
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe('not-attached');
    }
    expect((await attach(fresh, 'install-fresh-0003', 'Edge')).status).toBe(200);
    expect((await wchanges(fresh)).status).toBe(200);
  });

  it('filters snapshot and changes by web access and keeps cursor semantics', async () => {
    await attach();
    await dpush([fav('d1'), scratch()]);
    const changes = await wchanges(owner);
    expect(changes.status).toBe(200);
    const types = changes.json.changes.map((c: any) => c.entityType);
    expect(types).toContain('favorite');
    expect(types).not.toContain('scratchpad');
    expect(changes.json.cursor).toBe(changes.json.headRevision);
    const snap = await h.call('GET', '/web/snapshot?limit=1000', auth());
    expect(snap.status).toBe(200);
    expect(snap.json.records.map((r: any) => r.entityType)).not.toContain('scratchpad');
    expect(snap.json.records.map((r: any) => r.entityType)).toContain('favorite');

    // Paging: hidden categories never stall the cursor.
    const paged = await wchanges(owner, 0, 1);
    expect(paged.json.hasMore).toBe(true);
    expect(paged.json.cursor).toBeGreaterThan(0);

    expect((await setAccess('scratchpad', true)).status).toBe(200);
    expect((await wchanges(owner)).json.changes.map((c: any) => c.entityType)).toContain('scratchpad');
    expect((await h.call('GET', '/web/snapshot?limit=1000', auth())).json.records.map((r: any) => r.entityType)).toContain('scratchpad');
    expect((await h.call('GET', '/web/access', auth())).json.access.scratchpad).toBe(true);
    expect(listAudit(h.hub.hub.db, { limit: 3 }).find((r) => r.event === 'web.access-changed')!.detail).toEqual({ category: 'scratchpad', enabled: true });
    await setAccess('scratchpad', false);
    expect((await wchanges(owner)).json.changes.map((c: any) => c.entityType)).not.toContain('scratchpad');
    expect((await h.call('PUT', '/web/access', { ...auth(), body: { category: 'bogus', enabled: true } })).status).toBe(400);
  });

  it('returns 410 cursor-expired for a cursor older than the floor', async () => {
    const db = h.hub.hub.db;
    db.prepare("UPDATE meta SET value = '5' WHERE key = 'sync_floor'").run();
    const res = await wchanges(owner, 1);
    expect(res.status).toBe(410);
    expect(res.json.error.code).toBe('cursor-expired');
    db.prepare("UPDATE meta SET value = '0' WHERE key = 'sync_floor'").run();
  });

  it('applies pushes, shows them to desktops, and desktop pushes show up for the browser', async () => {
    const { deviceId } = (await attach()).json;
    const res = await wpush(owner, [fav('web1'), fav('web2')]);
    expect(res.status).toBe(200);
    expect(res.json.results.map((r: any) => r.status)).toEqual(['applied', 'applied']);
    const pulled = await h.call('GET', '/sync/changes?after=0', { bearer: desktop.token });
    const mine = pulled.json.changes.find((c: any) => c.entityId === 'tool:web1');
    expect(mine).toMatchObject({ updatedByDeviceId: deviceId, deleted: false });
    const push = listAudit(h.hub.hub.db, { limit: 5 }).find((r) => r.event === 'sync.pushed')!;
    expect(push).toMatchObject({ actorKind: 'owner', detail: { applied: 2, duplicate: 0, conflict: 0, rejected: 0, deviceId } });

    const before = (await wchanges(owner)).json.cursor as number;
    await dpush([fav('fromdesktop')]);
    const seen = await wchanges(owner, before);
    expect(seen.json.changes.map((c: any) => c.entityId)).toEqual(['tool:fromdesktop']);
    expect(seen.json.changes[0].updatedByDeviceId).toBe(desktop.device.deviceId);
  });

  it('commits conflicts, rejections and per-category rules', async () => {
    const { deviceId } = (await attach()).json;
    // category disabled
    const disabled = await wpush(owner, [scratch(), fav('ok-after')]);
    expect(disabled.json.results.map((r: any) => (r.status === 'rejected' ? r.reason : r.status))).toEqual(['category-disabled', 'applied']);
    // enable scratchpad: stale base conflicts and returns current
    await setAccess('scratchpad', true);
    const first = await wpush(owner, [scratch()]);
    const rev = (first.json.results[0].revision ?? first.json.results[0].current.revision) as number;
    await dpush([scratch({ basedOnRevision: rev, payload: { schemaVersion: 1, snippets: [], drawerExpanded: true } })]);
    const stale = await wpush(owner, [scratch({ basedOnRevision: rev })]);
    expect(stale.json.results[0]).toMatchObject({ status: 'conflict', current: { entityType: 'scratchpad', payload: { drawerExpanded: true } } });
    await setAccess('scratchpad', false);

    // usage: needs the category on; only the browser's own row is accepted
    expect((await wpush(owner, [usage(deviceId)])).json.results[0]).toEqual({ opId: expect.any(String), status: 'rejected', reason: 'category-disabled' });
    await setAccess('usage', true);
    const results = (await wpush(owner, [usage(desktop.device.deviceId), usage(deviceId)])).json.results;
    expect(results.map((r: any) => (r.status === 'rejected' ? r.reason : r.status))).toEqual(['not-owner-device', 'applied']);
    await setAccess('usage', false);
    // unknown entity types still reach the commit path and reject there
    expect((await wpush(owner, [op({ entityType: 'bogus', entityId: 'x', payload: {} })])).json.results[0]).toMatchObject({ status: 'rejected', reason: 'unknown-entity' });
    // duplicate op ids are idempotent
    const dup = fav('dup');
    const a1 = await wpush(owner, [dup]);
    expect((await wpush(owner, [dup])).json.results[0]).toEqual({ opId: dup.opId, status: 'duplicate', revision: a1.json.results[0].revision });
  });

  it('keeps browser rows out of every device credential path', async () => {
    const { deviceId } = (await attach()).json;
    expect(isDeviceActive(h.hub.hub.db, deviceId)).toBe(false);
    const challenge = await h.call('POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId } });
    expect(row('SELECT COUNT(*) AS c FROM challenges WHERE device_id = ?', deviceId).c).toBe(0);
    const signer = newDevice(deviceId);
    const bad = await h.call('POST', '/auth/device/token', { noOrigin: true, body: { deviceId, nonce: challenge.json.nonce, signature: signer.sign('x') } });
    expect(bad.status).toBe(401);
    expect((await deviceToken(h, signer)).token).toBe('');
    // enrolling a device under a browser row's id is refused
    const code = (await h.call('POST', '/pairing-codes', { ...auth(), body: {} })).json.pairingCode as string;
    expect((await enroll(h, signer, { code })).status).toBe(409);
    // recovery trust cannot be set on a browser row
    const trust = await h.call('PUT', `/devices/${deviceId}/recovery-trust`, { ...auth(), body: { password: 'a very long password', trusted: true } });
    expect(trust.status).toBe(404);
    expect(row('SELECT recovery_trusted FROM devices WHERE device_id = ?', deviceId).recovery_trusted).toBe(0);
    // an unenrolled-style TLS acknowledgement list never waits on browsers
    const tlsPending = h.hub.hub.db.prepare("SELECT COUNT(*) AS c FROM devices WHERE kind = 'desktop'").get() as { c: number };
    expect(tlsPending.c).toBeGreaterThan(0);
  });

  it('removing a browser row ends its bound sessions', async () => {
    const s = await h.signIn();
    const { deviceId } = (await attach(s, 'install-doomed-0009', 'Doomed')).json;
    expect((await wchanges(s)).status).toBe(200);
    const preview = await h.call('POST', `/devices/${deviceId}/revoke/preview`, auth());
    expect(preview.status).toBe(200);
    expect((await h.call('POST', `/devices/${deviceId}/revoke`, { ...auth(), body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);
    expect((await wchanges(s)).status).toBe(401);
    expect((await wchanges(owner)).status).toBe(200);
    // signing in again and attaching the same installation re-activates the row
    const again = await h.signIn();
    expect((await attach(again, 'install-doomed-0009', 'Doomed')).json.deviceId).toBe(deviceId);
    expect((await wchanges(again)).status).toBe(200);
  });

  it('prunes browser rows with no session for 90 days and no live session', async () => {
    const db = h.hub.hub.db;
    const old = new Date(h.clock.t - 100 * DAY).toISOString();
    const stale = (await attach(await h.signIn(), 'install-stale-0101', 'Stale')).json.deviceId as string;
    const live = (await attach(await h.signIn(), 'install-live-0102', 'Live')).json.deviceId as string;
    const fresh = (await attach(await h.signIn(), 'install-fresh-0103', 'Fresh')).json.deviceId as string;
    db.prepare('UPDATE devices SET last_session_at = ? WHERE device_id IN (?, ?)').run(old, stale, live);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE browser_device_id IN (?, ?)').run(old, stale, fresh);
    expect(pruneBrowserDevices(db, h.clock.t)).toBe(1);
    expect(row('SELECT COUNT(*) AS c FROM devices WHERE device_id = ?', stale).c).toBe(0);
    expect(row('SELECT COUNT(*) AS c FROM devices WHERE device_id = ?', live).c).toBe(1);
    expect(row('SELECT COUNT(*) AS c FROM devices WHERE device_id = ?', fresh).c).toBe(1);
    expect(row("SELECT COUNT(*) AS c FROM devices WHERE kind = 'desktop'").c).toBeGreaterThan(0);
  });

  it('summary lists browser rows with kind and desktops with paused', async () => {
    await attach();
    const report = { cursor: 3, pending: 1, quarantined: 0, conflicts: 0, stranded: 0, categories: FLAGS, lastSyncAt: null };
    expect((await h.call('PUT', '/web/state', { ...auth(), body: report })).status).toBe(200);
    expect((await h.call('PUT', '/sync/state', { bearer: desktop.token, body: { ...report, paused: true } })).status).toBe(200);
    const sum = await h.call('GET', '/sync/summary', auth());
    expect(sum.status).toBe(200);
    const browserRow = sum.json.devices.find((d: any) => d.deviceId === (row('SELECT browser_device_id FROM sessions WHERE session_hash = ?', sessionHash(owner)).browser_device_id));
    expect(browserRow).toMatchObject({ kind: 'browser', paused: false, cursor: 3, pending: 1 });
    expect(sum.json.devices.find((d: any) => d.deviceId === desktop.device.deviceId)).toMatchObject({ kind: 'desktop', paused: true });
  });

  it('nudges owner cookie sockets (not the originating browser) and announces access changes', async () => {
    const s1 = owner;
    const s2 = await h.signIn();
    await attach(s1, 'install-main-0001', 'Chrome on Mac');
    await attach(s2, 'install-sock-0201', 'Second browser');
    const sock1 = await connect(s1);
    const sock2 = await connect(s2);
    const nudges = (s: Sock) => s.events.filter((e) => e.event === 'changes-available');

    const res = await dpush([fav('rt1')]);
    expect(await waitFor(() => nudges(sock1).length > 0 && nudges(sock2).length > 0)).toBe(true);
    expect(nudges(sock1)[0]).toMatchObject({ data: { revision: res.json.headRevision } });

    const base1 = nudges(sock1).length;
    const base2 = nudges(sock2).length;
    await wpush(s1, [fav('rt2')]);
    expect(await waitFor(() => nudges(sock2).length > base2)).toBe(true);
    await sleep(100);
    expect(nudges(sock1).length).toBe(base1);

    await setAccess('home', false);
    expect(await waitFor(() => sock1.events.some((e) => e.event === 'web-access-changed') && sock2.events.some((e) => e.event === 'web-access-changed'))).toBe(true);
    await setAccess('home', true);
    sock1.close(); sock2.close();
  });
});
