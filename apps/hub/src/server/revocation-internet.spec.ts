import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HUB_REALTIME_PATH, REALTIME_CLOSE_CODES, deviceAuthMessage } from '@dude/contracts/hub';
import { DeviceInactiveError, commitCanonical, currentRevision } from '../db/canonical-repository.js';
import { parseHubConfig } from '../config/hub-config.js';
import { resolveDeviceToken } from '../devices/device-tokens.js';
import { REVOKED_ATTEMPT_INTERVAL_MS } from '../devices/revoked-attempts.js';
import { deactivateDevice } from '../devices/registry.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { ApiResult, AuthHub, Signed } from './auth-test-helpers.js';
import { createPairingCode, enroll, enrolled, newDevice } from './device-test-helpers.js';
import type { SimDevice } from './device-test-helpers.js';

const PUBLIC = 'https://hub.example.com';
const PEER = '203.0.113.77';
let n = 0;
const fav = (id: string) => ({
  opId: `rv-${++n}-${Math.random().toString(36).slice(2)}`, entityType: 'favorite', entityId: `tool:${id}`, opKind: 'upsert', schemaVersion: 1, basedOnRevision: null,
  payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order: 0 },
});

describe('revoked devices over the Internet (proxy mode, non-loopback peer)', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub({ config: parseHubConfig({ exposure: { names: ['hub.example.com'], proxy: { trusted: ['127.0.0.1'], publicOrigin: PUBLIC } } }) });
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  const db = () => h.hub.hub.db;
  const via = (ip = PEER) => ({ origin: PUBLIC, host: `localhost:${h.hub.port}`, 'x-forwarded-for': ip, 'x-forwarded-host': 'hub.example.com', 'x-forwarded-proto': 'https' });
  const asDevice = (token: string, ip = PEER) => ({ bearer: token, noOrigin: true, headers: via(ip) });
  const asOwner = (s: Signed = owner, ip = PEER) => ({ cookie: s.cookie, csrf: s.csrf, headers: via(ip) });
  const one = (sql: string, ...args: Array<string | number>) => db().prepare(sql).get(...args) as any;
  const count = (sql: string, ...args: Array<string | number>): number => (one(sql, ...args) as { c: number }).c;

  async function revoke(deviceId: string): Promise<void> {
    const p = await h.call('POST', `/devices/${deviceId}/revoke/preview`, asOwner());
    const r = await h.call('POST', `/devices/${deviceId}/revoke`, { ...asOwner(), body: { confirmToken: p.json.confirmToken } });
    expect(r.status).toBe(200);
  }
  const push = (token: string, ops: unknown[]) => h.call('POST', '/sync/push', { ...asDevice(token), body: { ops } });
  const state = () => ({
    head: currentRevision(db()), records: count('SELECT COUNT(*) AS c FROM records'), feed: count('SELECT COUNT(*) AS c FROM change_feed'), applied: count('SELECT COUNT(*) AS c FROM applied_ops'),
  });
  const revokedAudits = (deviceId?: string) => db().prepare("SELECT actor_id, outcome, actor_kind, ip, detail_json FROM audit_events WHERE event = 'device.revoked-attempt'" + (deviceId ? ' AND actor_id = ?' : '') + ' ORDER BY seq')
    .all(...(deviceId ? [deviceId] : [])) as Array<{ actor_id: string; outcome: string; actor_kind: string; ip: string; detail_json: string }>;
  const shape = (r: ApiResult) => ({ status: r.status, body: r.raw.body, cache: r.raw.headers['cache-control'] });

  const wsUrl = () => `wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`;
  const refused = (token: string, ip = PEER): Promise<number> => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(), { ca: h.hub.tls.certPem, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip } });
    ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode ?? 0); });
    ws.on('open', () => { ws.close(); reject(new Error('upgrade was accepted')); });
    ws.on('error', () => { /* unexpected-response also fires */ });
  });
  const openSocket = (token: string): Promise<{ ws: WebSocket; closed: Promise<number> }> => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(), { ca: h.hub.tls.certPem, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': PEER } });
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    ws.on('message', (data) => { if (JSON.parse(data.toString()).type === 'welcome') resolve({ ws, closed }); });
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 })));
  });

  it('(i) the next sync/changes, push, snapshot and reachability echo return 401 and nothing changes', async () => {
    const a = await enrolled(h, owner);
    expect((await push(a.token, [fav('before')])).status).toBe(200);
    expect((await h.call('GET', '/sync/changes?after=0', asDevice(a.token))).status).toBe(200);
    await revoke(a.device.deviceId);
    const before = state();

    const unknown = 'ddt_' + 'x'.repeat(43);
    const calls: Array<[string, string, unknown?]> = [
      ['GET', '/sync/changes?after=0'], ['POST', '/sync/push', { ops: [fav('after')] }], ['GET', '/sync/snapshot'], ['GET', '/reachability/echo'],
    ];
    for (const [method, path, body] of calls) {
      const revoked = await h.call(method, path, { ...asDevice(a.token), ...(body ? { body } : {}) });
      const stranger = await h.call(method, path, { ...asDevice(unknown), ...(body ? { body } : {}) });
      expect(revoked.status, path).toBe(401);
      expect(shape(revoked), path).toEqual(shape(stranger));
    }
    expect(state()).toEqual(before);
    expect(one("SELECT COUNT(*) AS c FROM records WHERE entity_id = 'tool:after'").c).toBe(0);
  });

  it('(ii) refreshing a token after revocation fails exactly like an unknown device id', async () => {
    const a = await enrolled(h, owner);
    await revoke(a.device.deviceId);
    const ghost = newDevice();
    const attempt = async (device: SimDevice) => {
      const challenge = await h.call('POST', '/auth/device/challenge', { noOrigin: true, headers: via(), body: { deviceId: device.deviceId } });
      const nonce = challenge.json.nonce as string;
      const signature = device.sign(deviceAuthMessage({ hubInstanceId: h.hub.hub.hubInstanceId, nonce, deviceId: device.deviceId }));
      const redeemed = await h.call('POST', '/auth/device/token', { noOrigin: true, headers: via(), body: { deviceId: device.deviceId, nonce, signature } });
      return { challenge, redeemed };
    };
    const challenges = count('SELECT COUNT(*) AS c FROM challenges');
    const revoked = await attempt(a.device);
    const unknown = await attempt(ghost);
    expect(revoked.challenge.status).toBe(200);
    expect(Object.keys(revoked.challenge.json).sort()).toEqual(Object.keys(unknown.challenge.json).sort());
    expect(count('SELECT COUNT(*) AS c FROM challenges')).toBe(challenges); // never stored for an inactive id
    expect(revoked.redeemed.status).toBe(401);
    expect(shape(revoked.redeemed)).toEqual(shape(unknown.redeemed));
    expect(revokedAudits(ghost.deviceId)).toHaveLength(0);
    expect(revokedAudits(a.device.deviceId).map((r) => JSON.parse(r.detail_json).via).sort()).toEqual(['challenge', 'redeem']);
  });

  it('(iii) an open realtime socket closes 4003 at once and a new upgrade with the old token gets 401', async () => {
    const a = await enrolled(h, owner);
    const socket = await openSocket(a.token);
    await revoke(a.device.deviceId);
    expect(await Promise.race([socket.closed, new Promise<number>((r) => setTimeout(() => r(-1), 3000))])).toBe(REALTIME_CLOSE_CODES.revoked);
    expect(await refused(a.token)).toBe(401);
    expect(revokedAudits(a.device.deviceId).map((r) => JSON.parse(r.detail_json).via)).toEqual(['realtime']);
  });

  it('(iv) a push that races revocation is rejected inside the commit transaction and writes nothing', async () => {
    const a = await enrolled(h, owner);
    const preflight = resolveDeviceToken(db(), a.token, h.clock.t);
    expect(preflight).not.toBeNull();
    const environmentId = (one('SELECT environment_id FROM environment LIMIT 1') as { environment_id: string }).environment_id;
    const commit = (id: string) => commitCanonical(db(), {
      environmentId, entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert', payload: fav(id).payload, opId: `race-${id}`, deviceId: a.device.deviceId,
      now: new Date(h.clock.t).toISOString(), enforcePolicy: true, basedOnRevision: null, actingDeviceId: a.device.deviceId, schemaVersion: 1,
      actor: { kind: 'device', deviceId: a.device.deviceId, keyId: preflight!.keyId },
    });
    expect(commit('ok').status).toBe('applied');
    deactivateDevice(db(), a.device.deviceId, 'revoked', h.clock.t); // revocation commits after the preflight check
    const before = state();
    expect(() => commit('late')).toThrow(DeviceInactiveError);
    expect(() => commit('ok')).toThrow(DeviceInactiveError); // not even a duplicate replay is acknowledged
    expect(state()).toEqual(before);
    expect(one("SELECT COUNT(*) AS c FROM applied_ops WHERE op_id = 'race-late'").c).toBe(0);
  });

  it('(v) a revoked device key can never enroll again', async () => {
    const a = await enrolled(h, owner);
    await revoke(a.device.deviceId);
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    const again = await enroll(h, a.device, { code });
    expect(again.status).toBe(409);
    expect(one('SELECT revoked_at FROM devices WHERE device_id = ?', a.device.deviceId).revoked_at).not.toBeNull();
    const fresh = await enroll(h, newDevice(), { code });
    expect(fresh.status).toBe(200); // the pairing code was not burned by the rejected re-enrollment
  });

  it('(vi) removing a browser device kills its sessions and a later /web/push is rejected', async () => {
    const web = await h.signIn();
    const attach = await h.call('POST', '/web/attach', { ...asOwner(web), body: { installationId: 'rv-install-0001', label: 'Chrome on Mac' } });
    expect(attach.status).toBe(200);
    const browserId = attach.json.deviceId as string;
    const wpush = (ops: unknown[]) => h.call('POST', '/web/push', { ...asOwner(web), body: { ops } });
    expect((await wpush([fav('web1')])).status).toBe(200);
    await revoke(browserId);
    const before = state();
    expect([401, 403]).toContain((await wpush([fav('web2')])).status); // the killed session is refused (a stale cookie also fails CSRF)
    expect((await h.call('GET', '/web/changes?after=0', asOwner(web))).status).toBe(401);
    expect(state()).toEqual(before);

    // The in-transaction recheck covers a session killed after the route's attach lookup.
    const live = await h.signIn();
    const attached = await h.call('POST', '/web/attach', { ...asOwner(live), body: { installationId: 'rv-install-0002', label: 'Firefox' } });
    const id = attached.json.deviceId as string;
    const hash = createHash('sha256').update(live.cookie).digest('hex');
    const environmentId = (one('SELECT environment_id FROM environment LIMIT 1') as { environment_id: string }).environment_id;
    const commit = () => commitCanonical(db(), {
      environmentId, entityType: 'favorite', entityId: 'tool:web3', op: 'upsert', payload: fav('web3').payload, opId: 'race-web3', deviceId: id,
      now: new Date(h.clock.t).toISOString(), enforcePolicy: true, basedOnRevision: null, actingDeviceId: id, schemaVersion: 1,
      actor: { kind: 'browser', deviceId: id, sessionHash: hash },
    });
    deactivateDevice(db(), id, 'unenrolled', h.clock.t);
    expect(() => commit()).toThrow(DeviceInactiveError);
    expect(one("SELECT COUNT(*) AS c FROM records WHERE entity_id = 'tool:web3'").c).toBe(0);
  });

  it('(vii) revoked-attempt is audited once per hour per device and via, credential-free, listed as an alert', async () => {
    const a = await enrolled(h, owner, newDevice(), { displayName: 'Lost laptop' });
    await revoke(a.device.deviceId);
    const unknown = 'ddt_' + 'y'.repeat(43);
    const audited = revokedAudits().length;
    const noise = (await h.call('GET', '/sync/changes?after=0', asDevice(unknown))).status;
    expect(noise).toBe(401);
    expect(revokedAudits()).toHaveLength(audited); // an unknown token is never audited as a revoked device
    const mine = () => revokedAudits(a.device.deviceId);
    const first = await h.call('GET', '/sync/changes?after=0', asDevice(a.token));
    for (let i = 0; i < 4; i++) expect((await h.call('GET', '/sync/snapshot', asDevice(a.token))).status).toBe(401);
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({ outcome: 'denied', actor_kind: 'device', ip: PEER });
    expect(JSON.parse(mine()[0]!.detail_json)).toEqual({ via: 'token' });
    expect(mine()[0]!.detail_json).not.toContain('ddt_');
    expect(shape(first)).toEqual(shape(await h.call('GET', '/sync/changes?after=0', asDevice(unknown))));

    h.clock.t += REVOKED_ATTEMPT_INTERVAL_MS - 1000;
    await h.call('GET', '/sync/changes?after=0', asDevice(a.token));
    expect(mine()).toHaveLength(1);
    h.clock.t += 2000;
    await h.call('GET', '/sync/changes?after=0', asDevice(a.token));
    expect(mine()).toHaveLength(2);

    const fresh = await h.signIn();
    const alerts = await h.call('GET', '/security/alerts', asOwner(fresh));
    expect(alerts.status).toBe(200);
    const alert = (alerts.json.alerts as Array<{ event: string; summary: string }>).find((x) => x.event === 'device.revoked-attempt');
    expect(alert?.summary).toBe('A revoked device tried to connect. (Lost laptop)');
    expect(alerts.raw.body).not.toContain('ddt_');
  });

  it('(viii) other devices keep syncing normally', async () => {
    owner = await h.signIn(); // the clock moved past the step-up window in (vii)
    const a = await enrolled(h, owner);
    const b = await enrolled(h, owner);
    expect((await push(b.token, [fav('b1')])).status).toBe(200);
    await revoke(a.device.deviceId);
    expect((await push(a.token, [fav('a-late')])).status).toBe(401);
    expect((await push(b.token, [fav('b2')])).status).toBe(200);
    const changes = await h.call('GET', '/sync/changes?after=0', asDevice(b.token));
    expect(changes.status).toBe(200);
    expect(changes.json.changes.map((c: { entityId: string }) => c.entityId)).toEqual(expect.arrayContaining(['tool:b1', 'tool:b2']));
    expect(changes.json.changes.map((c: { entityId: string }) => c.entityId)).not.toContain('tool:a-late');
    expect((await h.call('GET', '/reachability/echo', asDevice(b.token))).status).toBe(200);
  });
});
