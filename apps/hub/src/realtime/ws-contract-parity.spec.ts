import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Value from 'typebox/value';
import { WebSocket } from 'ws';
import {
  HUB_PROTOCOL_VERSION, HUB_REALTIME_DEPTH_PROTOCOL, HUB_REALTIME_PATH, REALTIME_DEPTH_EVENTS, REALTIME_EVENTS, RealtimeEventData, RealtimeServerMessage,
  realtimeEventAllowed,
} from '@dude/contracts/hub';
import type { RealtimeEvent } from '@dude/contracts/hub';
import { startAuthHub } from '../server/auth-test-helpers.js';
import type { AuthHub, Signed } from '../server/auth-test-helpers.js';
import { enrolled } from '../server/device-test-helpers.js';
import { audit } from '../security/audit.js';

type Msg = Record<string, any>;
interface Socket { name: string; protocol: number; ws: WebSocket; messages: Msg[]; closed: Promise<number> }

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const SPKI = 'A'.repeat(43);

/**
 * WebSocket contract parity for `/api/v1/realtime` (PD-100, PD-115). Every server-to-client event the Hub can emit is produced
 * here through its real trigger (or, for the events whose real trigger is a rotation or a recovery drill, the in-process Hub event
 * that trigger emits) on sockets of every principal kind at protocol 1 and protocol 3. Each frame must validate against
 * `RealtimeServerMessage`, each event payload must be exactly its `RealtimeEventData` shape, and the 31J events
 * (`REALTIME_DEPTH_EVENTS`) must be withheld from sockets below protocol 3, which shipped clients would otherwise drop the connection over.
 * The collaboration socket's `CollabServerControl` parity is proved in `collab/collab-socket.spec.ts` (every variant and doc-error code).
 */
describe('realtime WebSocket contract parity', () => {
  let h: AuthHub;
  let owner: Signed;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    h = await startAuthHub({ realtime: { ownerViewDelayMs: 20 } });
    owner = await h.signIn();
  });
  afterAll(async () => {
    for (const s of sockets) s.ws.terminate();
    await h.close();
  });

  const ownerHeaders = (s: Signed): Record<string, string> => ({ cookie: `__Host-dude_session=${s.cookie}`, origin: `https://127.0.0.1:${h.hub.port}` });
  const asOwner = { get cookie() { return owner.cookie; }, get csrf() { return owner.csrf; } };

  async function open(name: string, headers: Record<string, string>, protocol: number): Promise<Socket> {
    const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers });
    const messages: Msg[] = [];
    let resolveClosed!: (code: number) => void;
    const closed = new Promise<number>((resolve) => { resolveClosed = resolve; });
    ws.on('message', (data) => messages.push(JSON.parse(data.toString()) as Msg));
    ws.on('close', (code) => resolveClosed(code));
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      ws.on('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)));
    });
    ws.send(JSON.stringify({ type: 'hello', protocolVersion: protocol, minHubProtocol: 1 }));
    const socket: Socket = { name, protocol, ws, messages, closed };
    sockets.push(socket);
    await until(() => messages.some((m) => m.type === 'welcome'), `${name} welcome`);
    return socket;
  }

  async function until(predicate: () => boolean, what: string, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await sleep(10);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  const events = (s: Socket): string[] => s.messages.filter((m) => m.type === 'event').map((m) => m.event as string);
  const saw = (s: Socket, event: RealtimeEvent): boolean => events(s).includes(event);

  it('produces every realtime event on owner and device sockets of protocol 1 and 3', async () => {
    const ownerV3 = await open('owner v3', ownerHeaders(owner), HUB_PROTOCOL_VERSION);
    const ownerV1 = await open('owner v1', ownerHeaders(owner), 1);
    const deskV3 = await open('device v3', { authorization: `Bearer ${(await enrolled(h, owner)).token}` }, HUB_PROTOCOL_VERSION);
    const deskV1 = await open('device v1', { authorization: `Bearer ${(await enrolled(h, owner)).token}` }, 1);

    // device-registry-changed and presence-changed: a desktop enrolls and comes online.
    const watched = await enrolled(h, owner);
    const presenceSocket = await open('presence device', { authorization: `Bearer ${watched.token}` }, HUB_PROTOCOL_VERSION);
    await until(() => saw(ownerV3, 'presence-changed') && saw(ownerV1, 'device-registry-changed'), 'registry and presence events');

    // owner-view-changed: a rename changes the Devices view.
    expect((await h.call('PATCH', `/devices/${watched.device.deviceId}`, { ...asOwner, body: { displayName: 'Parity desk' } })).status).toBe(200);
    await until(() => saw(ownerV3, 'owner-view-changed') && saw(deskV3, 'owner-view-changed'), 'owner-view-changed');

    // tls-next-pin (both kinds) and owner-recovered: what a staged rotation, a proxy pin and a device-assisted recovery emit.
    h.hub.app.hubEvents.emit('tls-next-pin', { spkiSha256: SPKI });
    h.hub.app.hubEvents.emit('tls-next-pin', { spkiSha256: SPKI, kind: 'proxy' });
    h.hub.app.hubEvents.emit('owner-recovered', { deviceId: watched.device.deviceId, at: '2026-03-01T00:00:00.000Z' });

    // changes-available: canonical records changed (what a sync push or a web write emits).
    const environmentId = (h.hub.hub.db.prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string }).environment_id;
    h.hub.app.hubEvents.emit('records-changed', { environmentId, revision: 7, originDeviceId: null });

    // web-access-changed: the owner flips a web-access toggle (and back).
    expect((await h.call('PUT', '/web/access', { ...asOwner, body: { category: 'favorites', enabled: false } })).status).toBe(200);
    expect((await h.call('PUT', '/web/access', { ...asOwner, body: { category: 'favorites', enabled: true } })).status).toBe(200);

    // notification: an audited failed backup reaches the producers through the real audit observer.
    audit(h.hub.hub.db, { event: 'backup.failed', outcome: 'failure', actorKind: 'system', detail: { reason: 'disk-full', trigger: 'schedule' }, now: h.clock.t });

    // session-revoked: a second owner session signs out; device-revoked: a desktop is revoked through preview and confirm.
    const second = await h.signIn();
    const signedOut = await open('signed-out owner', ownerHeaders(second), HUB_PROTOCOL_VERSION);
    expect((await h.call('POST', '/auth/sign-out', { cookie: second.cookie, csrf: second.csrf })).status).toBe(200);
    const preview = await h.call('POST', `/devices/${watched.device.deviceId}/revoke/preview`, asOwner);
    expect((await h.call('POST', `/devices/${watched.device.deviceId}/revoke`, { ...asOwner, body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);

    await until(() => saw(signedOut, 'session-revoked') && saw(presenceSocket, 'device-revoked'), 'revocation events');
    await until(() => ['tls-next-pin', 'owner-recovered', 'changes-available', 'web-access-changed', 'notification'].every((e) => saw(ownerV3, e as RealtimeEvent)), 'owner v3 events');
    await until(() => saw(deskV1, 'tls-next-pin') && saw(deskV1, 'changes-available') && saw(ownerV1, 'web-access-changed'), 'legacy socket events');
    // Coalesced owner views and presence flips after the revocation settle before the frames are judged.
    await sleep(150);

    // Every event the contract lists was emitted at least once.
    const seen = new Set(sockets.flatMap(events));
    expect([...seen].sort()).toEqual([...REALTIME_EVENTS].sort());
  });

  it('every frame validates against RealtimeServerMessage and every event payload is exactly its RealtimeEventData shape', () => {
    const frames = sockets.flatMap((s) => s.messages.map((m) => ({ socket: s.name, m })));
    expect(frames.length).toBeGreaterThan(20);
    for (const { socket, m } of frames) {
      expect(Value.Check(RealtimeServerMessage, m), `${socket}: ${JSON.stringify(m)}`).toBe(true);
      if (m.type !== 'event') continue;
      const schema = RealtimeEventData[m.event as RealtimeEvent];
      expect(Value.Check(schema, m.data), `${socket}: ${JSON.stringify(m)}`).toBe(true);
      // The wire schema keeps `data` open for later fields; the Hub itself sends no field beyond the payload contract.
      expect(Value.Clean(schema, Value.Clone(m.data)), `${socket}: extra fields in ${JSON.stringify(m)}`).toEqual(m.data);
    }
  });

  it('withholds the 31J depth events below protocol 3 and delivers them at protocol 3', () => {
    const byName = (name: string): Socket => sockets.find((s) => s.name === name)!;
    for (const s of sockets.filter((x) => x.protocol < HUB_REALTIME_DEPTH_PROTOCOL)) {
      expect(events(s).filter((e) => REALTIME_DEPTH_EVENTS.includes(e as RealtimeEvent)), s.name).toEqual([]);
      // The socket was live: it received the pre-31J events in the same run.
      expect(saw(s, 'tls-next-pin'), s.name).toBe(true);
    }
    for (const event of REALTIME_DEPTH_EVENTS) expect(saw(byName('owner v3'), event), event).toBe(true);
    expect(saw(byName('device v3'), 'owner-view-changed')).toBe(true);
    // The gate the Hub applies is the contract's own predicate.
    for (const event of REALTIME_EVENTS) {
      for (const protocol of [1, 2, HUB_REALTIME_DEPTH_PROTOCOL, HUB_PROTOCOL_VERSION]) {
        expect(realtimeEventAllowed(event, protocol), `${event}@${protocol}`).toBe(protocol >= HUB_REALTIME_DEPTH_PROTOCOL || !REALTIME_DEPTH_EVENTS.includes(event));
      }
    }
  });
});
