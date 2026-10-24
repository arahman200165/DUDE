import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Value } from 'typebox/value';
import { HUB_PROTOCOL_VERSION, HUB_REALTIME_PATH, HubNotificationsResponse } from '@dude/contracts/hub';
import { PASSWORD, cookieValueOf, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { STEP_UP_WINDOW_MS } from '../auth/sessions.js';
import { deactivateDevice } from '../devices/registry.js';
import { listAudit } from '../security/audit.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Msg = Record<string, any>;
interface Client { ws: WebSocket; messages: Msg[]; next(predicate: (m: Msg) => boolean, ms?: number): Promise<Msg> }

function connect(h: AuthHub, headers: Record<string, string>, protocolVersion: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers });
    const messages: Msg[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)));
    ws.on('open', () => {
      const client: Client = {
        ws, messages,
        async next(predicate, ms = 3000) {
          const until = Date.now() + ms;
          while (Date.now() < until) {
            const found = messages.find(predicate);
            if (found) return found;
            await sleep(10);
          }
          throw new Error(`timed out waiting for message; got ${JSON.stringify(messages)}`);
        },
      };
      ws.send(JSON.stringify({ type: 'hello', protocolVersion, minHubProtocol: 1 }));
      void client.next((m) => m.type === 'welcome').then(() => resolve(client), reject);
    });
  });
}

describe('notifications routes and the reader grant', () => {
  let h: AuthHub;
  let owner: Signed;
  const sockets: Client[] = [];
  const auth = (s: { cookie: string; csrf: string }) => ({ cookie: s.cookie, csrf: s.csrf });
  const audits = (event: string) => listAudit(h.hub.hub.db, { limit: 500 }).filter((r) => r.event === event);
  const notify = (key: string, title = `Title ${key}`) =>
    h.hub.app.hubNotifications.notify({ sourceKey: key, kind: 'backup-failed', severity: 'error', title, body: 'Body.' })!;
  const grant = (s: { cookie: string; csrf: string }, deviceId: string, enabled: boolean) =>
    h.call('PUT', `/devices/${deviceId}/notifications-access`, { ...auth(s), body: { enabled } });

  beforeAll(async () => {
    h = await startAuthHub({ realtime: { ownerViewDelayMs: 20 }, sync: { compactionIntervalMs: 0 } });
    owner = await h.signIn();
  });
  afterAll(async () => {
    for (const c of sockets) c.ws.close();
    await h.close();
  });

  it('lets the owner list, mark read and dismiss, uncached, matching the contract', async () => {
    const a = notify('route-a');
    const b = notify('route-b');
    const list = await h.call('GET', '/notifications', { cookie: owner.cookie });
    expect(list.status).toBe(200);
    expect(list.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(HubNotificationsResponse, list.json)).toBe(true);
    expect(list.json.notifications.map((n: { id: string }) => n.id)).toEqual([b.id, a.id]);
    expect(list.json.unread).toBe(2);

    expect((await h.call('POST', '/notifications/read', { cookie: owner.cookie, body: { ids: [a.id] } })).status).toBe(403);
    const read = await h.call('POST', '/notifications/read', { ...auth(owner), body: { ids: [a.id] } });
    expect(read.status).toBe(200);
    expect((await h.call('GET', '/notifications', { cookie: owner.cookie })).json.unread).toBe(1);
    expect((await h.call('POST', '/notifications/read', { ...auth(owner), body: { ids: [] } })).status).toBe(400);
    expect((await h.call('POST', '/notifications/read', { ...auth(owner), body: { all: true, ids: [a.id] } })).status).toBe(400);

    expect((await h.call('POST', `/notifications/${b.id}/dismiss`, { cookie: owner.cookie })).status).toBe(403);
    expect((await h.call('POST', `/notifications/${b.id}/dismiss`, auth(owner))).status).toBe(200);
    expect((await h.call('POST', '/notifications/nope/dismiss', auth(owner))).status).toBe(404);
    const after = await h.call('GET', '/notifications', { cookie: owner.cookie });
    expect(after.json.notifications.map((n: { id: string }) => n.id)).toEqual([a.id]);
    expect(after.json.unread).toBe(0);
    const withDismissed = await h.call('GET', '/notifications?includeDismissed=true', { cookie: owner.cookie });
    expect(withDismissed.json.notifications.find((n: { id: string }) => n.id === b.id)).toMatchObject({ dismissedAt: expect.any(String), readAt: expect.any(String) });
    expect((await h.call('GET', '/notifications?includeDismissed=maybe', { cookie: owner.cookie })).status).toBe(400);
    await h.call('POST', '/notifications/read', { ...auth(owner), body: { all: true } });
  });

  it('writes no audit event for reading, marking read or dismissing', async () => {
    const fresh = notify('route-unaudited');
    const count = () => Number((h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n);
    const before = count();
    await h.call('GET', '/notifications', { cookie: owner.cookie });
    await h.call('POST', '/notifications/read', { ...auth(owner), body: { ids: [fresh.id] } });
    await h.call('POST', `/notifications/${fresh.id}/dismiss`, auth(owner));
    expect(count()).toBe(before);
  });

  it('refuses anonymous and unknown credentials, and accepts an owner bearer session', async () => {
    expect((await h.call('GET', '/notifications')).status).toBe(401);
    expect((await h.call('GET', '/notifications', { cookie: 'not-a-session' })).status).toBe(401);
    expect((await h.call('GET', '/notifications', { bearer: 'ddt_unknown', noOrigin: true })).status).toBe(401);
    expect((await h.call('GET', '/notifications', { bearer: 'xyz_unknown', noOrigin: true })).status).toBe(401);
    const { token } = await enrolled(h, owner);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, noOrigin: true, body: { password: PASSWORD } })).json.accessToken as string;
    expect((await h.call('GET', '/notifications', { bearer, noOrigin: true })).status).toBe(200);
    expect((await h.call('POST', '/notifications/read', { bearer, noOrigin: true, body: { all: true } })).status).toBe(200);
  });

  it('refuses a device without the grant, and with it allows only these three routes', async () => {
    const { device, token } = await enrolled(h, owner);
    const target = notify('grant-route');
    const device403 = async () => {
      expect((await h.call('GET', '/notifications', { bearer: token, noOrigin: true })).status).toBe(403);
      expect((await h.call('POST', '/notifications/read', { bearer: token, noOrigin: true, body: { all: true } })).status).toBe(403);
      expect((await h.call('POST', `/notifications/${target.id}/dismiss`, { bearer: token, noOrigin: true })).status).toBe(403);
    };
    await device403();

    const granted = await grant(owner, device.deviceId, true);
    expect(granted.status).toBe(200);
    expect(granted.json).toMatchObject({ deviceId: device.deviceId, notificationsAccess: true });

    const list = await h.call('GET', '/notifications', { bearer: token, noOrigin: true });
    expect(list.status).toBe(200);
    expect(list.raw.headers['cache-control']).toBe('no-store');
    expect(list.json.notifications.some((n: { id: string }) => n.id === target.id)).toBe(true);
    expect((await h.call('POST', '/notifications/read', { bearer: token, noOrigin: true, body: { ids: [target.id] } })).status).toBe(200);
    expect((await h.call('POST', `/notifications/${target.id}/dismiss`, { bearer: token, noOrigin: true })).status).toBe(200);
    expect((await h.call('GET', '/notifications', { bearer: token, noOrigin: true })).json.notifications.some((n: { id: string }) => n.id === target.id)).toBe(false);

    // The grant gives no other owner right: every sampled owner route still refuses the device credential.
    const rights: Array<[string, string, unknown?]> = [
      ['GET', '/devices'], ['GET', '/sessions'], ['GET', '/jobs'], ['GET', '/security/alerts'], ['GET', '/backup/status'], ['GET', '/diagnostics'], ['GET', '/audit'],
      ['GET', '/presence'], ['GET', '/sync/summary'], ['POST', '/pairing-codes', {}], ['POST', '/security/alerts/seen', { upToSeq: 1 }],
      ['PUT', `/devices/${device.deviceId}/notifications-access`, { enabled: true }],
    ];
    for (const [method, path, body] of rights) {
      const res = await h.call(method, path, { bearer: token, noOrigin: true, ...(body !== undefined ? { body } : {}) });
      expect([path, res.status]).toEqual([path, 403]);
    }

    expect((await grant(owner, device.deviceId, false)).json).toMatchObject({ notificationsAccess: false });
    await device403();
  });

  it('stops a granted device when it is revoked or its token is unknown', async () => {
    const { device, token } = await enrolled(h, owner);
    expect((await grant(owner, device.deviceId, true)).status).toBe(200);
    expect((await h.call('GET', '/notifications', { bearer: token, noOrigin: true })).status).toBe(200);
    expect(deactivateDevice(h.hub.hub.db, device.deviceId, 'revoked', h.clock.t)).not.toBeNull();
    expect((await h.call('GET', '/notifications', { bearer: token, noOrigin: true })).status).toBe(401);
    expect((await grant(owner, device.deviceId, true)).status).toBe(409);
    expect((await grant(owner, device.deviceId, false)).status).toBe(409);
  });

  it('needs step-up to set the grant, audits it without credentials, and shows it on the device list', async () => {
    const s = await h.signIn();
    const { device } = await enrolled(h, owner);
    h.clock.t += STEP_UP_WINDOW_MS + 1;
    const lapsed = await grant(s, device.deviceId, true);
    expect(lapsed.status).toBe(403);
    expect(lapsed.json.error.code).toBe('step-up-required');
    expect((await h.call('GET', '/devices', { cookie: s.cookie })).json.find((d: { deviceId: string }) => d.deviceId === device.deviceId).notificationsAccess).toBe(false);

    const stepped = await h.call('POST', '/auth/step-up', { ...auth(s), body: { password: PASSWORD } });
    const fresh = { cookie: cookieValueOf(stepped.setCookie), csrf: stepped.json.csrfToken as string };
    const before = audits('device.notifications-access-changed').length;
    const ok = await grant(fresh, device.deviceId, true);
    expect(ok.status).toBe(200);
    expect(ok.raw.headers['cache-control']).toBe('no-store');
    const rows = audits('device.notifications-access-changed');
    expect(rows).toHaveLength(before + 1);
    expect(rows[0]).toMatchObject({ actorKind: 'owner', outcome: 'success', detail: { deviceId: device.deviceId, enabled: true } });
    expect(JSON.stringify(rows[0])).not.toMatch(/ddt_|dob_|password/i);
    expect((await h.call('GET', '/devices', { cookie: fresh.cookie })).json.find((d: { deviceId: string }) => d.deviceId === device.deviceId).notificationsAccess).toBe(true);
    expect((await grant(fresh, device.deviceId, false)).status).toBe(200);
    expect(audits('device.notifications-access-changed')[0]).toMatchObject({ detail: { deviceId: device.deviceId, enabled: false } });
    owner = await h.signIn();
  });

  it('cannot be granted to a browser row, an unknown id, or without CSRF', async () => {
    const browser = await h.signIn();
    const row = (await h.call('POST', '/web/attach', { ...auth(browser), body: { installationId: 'install-notify-0001', label: 'Notify browser' } })).json.deviceId as string;
    const refused = await grant(owner, row, true);
    expect(refused.status).toBe(400);
    expect((await h.call('GET', '/devices', { cookie: owner.cookie })).json.find((d: { deviceId: string }) => d.deviceId === row).notificationsAccess).toBe(false);
    expect((await grant(owner, '00000000-0000-4000-8000-000000000000', true)).status).toBe(404);
    const { device } = await enrolled(h, owner);
    expect((await h.call('PUT', `/devices/${device.deviceId}/notifications-access`, { cookie: owner.cookie, body: { enabled: true } })).status).toBe(403);
    expect((await h.call('PUT', `/devices/${device.deviceId}/notifications-access`, { ...auth(owner), body: { enabled: 'yes' } })).status).toBe(400);
    // The browser's own cookie session reads through the owner path, never as a device.
    expect((await h.call('GET', '/notifications', { cookie: browser.cookie })).status).toBe(200);
    expect((await h.call('GET', '/notifications', { bearer: browser.cookie, noOrigin: true })).status).toBe(401);
  });

  it('pushes notification events to protocol-3 owner and granted device sockets only', async () => {
    const ownerHeaders = { cookie: `__Host-dude_session=${owner.cookie}`, origin: `https://127.0.0.1:${h.hub.port}` };
    const granted = await enrolled(h, owner);
    const ungranted = await enrolled(h, owner);
    const legacy = await enrolled(h, owner);
    for (const d of [granted, legacy]) expect((await grant(owner, d.device.deviceId, true)).status).toBe(200);
    const ownerSocket = await connect(h, ownerHeaders, HUB_PROTOCOL_VERSION);
    const grantedSocket = await connect(h, { authorization: `Bearer ${granted.token}` }, HUB_PROTOCOL_VERSION);
    const ungrantedSocket = await connect(h, { authorization: `Bearer ${ungranted.token}` }, HUB_PROTOCOL_VERSION);
    const legacySocket = await connect(h, { authorization: `Bearer ${legacy.token}` }, 1);
    const legacyOwner = await connect(h, ownerHeaders, 1);
    sockets.push(ownerSocket, grantedSocket, ungrantedSocket, legacySocket, legacyOwner);
    await sleep(100);

    const made = notify('realtime-1', 'Realtime one');
    const isIt = (m: Msg) => m.event === 'notification' && m.data.id === made.id;
    await ownerSocket.next(isIt);
    const event = await grantedSocket.next(isIt);
    expect(event.data).toEqual({ id: made.id, kind: 'backup-failed', severity: 'error', title: 'Realtime one' });
    await ownerSocket.next((m) => m.event === 'owner-view-changed' && m.data.topic === 'notifications');
    await grantedSocket.next((m) => m.event === 'owner-view-changed' && m.data.topic === 'notifications');
    await sleep(150);
    for (const c of [ungrantedSocket, legacySocket, legacyOwner]) {
      expect(c.messages.some((m) => m.event === 'notification' || (m.event === 'owner-view-changed' && m.data.topic === 'notifications'))).toBe(false);
    }

    // Reading changes the view for readers (contentless topic only); revoking the grant ends delivery at once.
    await h.call('POST', `/notifications/${made.id}/dismiss`, auth(owner));
    await grantedSocket.next((m) => m.event === 'owner-view-changed' && m.data.topic === 'notifications' && m !== event);
    expect((await grant(owner, granted.device.deviceId, false)).status).toBe(200);
    const second = notify('realtime-2', 'Realtime two');
    await ownerSocket.next((m) => m.event === 'notification' && m.data.id === second.id);
    await sleep(150);
    expect(grantedSocket.messages.some((m) => m.event === 'notification' && m.data.id === second.id)).toBe(false);
    // A duplicate source key makes no second event.
    expect(h.hub.app.hubNotifications.notify({ sourceKey: 'realtime-2', kind: 'backup-failed', severity: 'error', title: 'again', body: 'B' })).toBeNull();
    await sleep(100);
    expect(ownerSocket.messages.filter((m) => m.event === 'notification' && m.data.id === second.id)).toHaveLength(1);
  });

  it('turns an audited alert into a pushed notification through the real observer', async () => {
    const before = (h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number }).n;
    const s = await h.signIn();
    const { device } = await enrolled(h, s);
    // Revoking a device is both audited and an alert: exactly one notification.
    const preview = await h.call('POST', `/devices/${device.deviceId}/revoke/preview`, auth(s));
    expect((await h.call('POST', `/devices/${device.deviceId}/revoke`, { ...auth(s), body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);
    const list = await h.call('GET', '/notifications', { cookie: s.cookie });
    expect(list.json.notifications[0]).toMatchObject({ kind: 'security-alert', body: 'A device was revoked.' });
    const after = (h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number }).n;
    // Enrolling the device was an alert too (device.enrolled), so the revoke adds exactly one more.
    expect(after - before).toBeGreaterThanOrEqual(2);
    expect(list.json.notifications.filter((n: { body: string }) => n.body === 'A device was revoked.')).toHaveLength(1);
  });
});
