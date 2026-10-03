import { X509Certificate } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import type { Server as TlsServer } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HUB_PROTOCOL_VERSION, HUB_REALTIME_PATH, REALTIME_CLOSE_CODES, REALTIME_MAX_MESSAGE_BYTES, ownerRecoveryMessage } from '@dude/contracts/hub';
import { startAuthHub } from '../server/auth-test-helpers.js';
import type { AuthHub, Signed } from '../server/auth-test-helpers.js';
import { enrolled } from '../server/device-test-helpers.js';
import { request } from '../server/test-helpers.js';
import { createTlsRotation } from '../tls/rotation.js';
import { spkiSha256 } from '../tls/self-signed.js';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { runTls } from '../cli/tls.js';
import { listAudit } from '../security/audit.js';


type Msg = Record<string, any>;
interface Client {
  ws: WebSocket;
  messages: Msg[];
  closed: Promise<number>;
  send(message: unknown): void;
  next(predicate: (m: Msg) => boolean, ms?: number): Promise<Msg>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const HELLO = { type: 'hello', protocolVersion: 1, minHubProtocol: 1 };

function url(h: AuthHub): string { return `wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`; }

/** Resolves with the HTTP status when the upgrade is refused (never a WebSocket). */
function refused(h: AuthHub, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url(h), { ca: h.hub.tls.certPem, headers });
    ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode ?? 0); });
    ws.on('open', () => { ws.close(); reject(new Error('upgrade was accepted')); });
    ws.on('error', () => { /* unexpected-response also fires */ });
  });
}

function connect(h: AuthHub, headers: Record<string, string>, ca = h.hub.tls.certPem): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url(h), { ca, headers });
    const messages: Msg[] = [];
    let closeResolve!: (code: number) => void;
    const closed = new Promise<number>((r) => { closeResolve = r; });
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('close', (code) => closeResolve(code));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)));
    ws.on('open', () => resolve({
      ws, messages, closed,
      send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
      async next(predicate, ms = 3000) {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          const found = messages.find(predicate);
          if (found) return found;
          await sleep(10);
        }
        throw new Error(`timed out waiting for message; got ${JSON.stringify(messages)}`);
      },
    }));
  });
}

async function welcomed(h: AuthHub, headers: Record<string, string>): Promise<{ client: Client; welcome: Msg }> {
  const client = await connect(h, headers);
  client.send(HELLO);
  return { client, welcome: await client.next((m) => m.type === 'welcome') };
}

const withClose = async (client: Client, ms = 3000): Promise<number> => Promise.race([client.closed, sleep(ms).then(() => -1)]);

const ownerHeaders = (h: AuthHub, owner: Signed): Record<string, string> => ({
  cookie: `__Host-dude_session=${owner.cookie}`, origin: `https://127.0.0.1:${h.hub.port}`,
});

async function waitUntil(predicate: () => Promise<boolean> | boolean, ms = 3000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await predicate()) return true; await sleep(20); }
  return false;
}

describe('realtime socket', () => {
  let h: AuthHub;
  let owner: Signed;
  const clients: Client[] = [];
  const track = <T extends Client>(c: T): T => { clients.push(c); return c; };
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => {
    for (const c of clients) c.ws.terminate();
    await h.close();
  });

  const listDevices = async (): Promise<Msg[]> => (await h.call('GET', '/devices', { cookie: owner.cookie, csrf: owner.csrf })).json;
  const online = async (deviceId: string): Promise<boolean> => (await listDevices()).find((d) => d.deviceId === deviceId)?.online === true;

  it('refuses an unauthenticated upgrade before any WebSocket exists', async () => {
    expect(await refused(h, {})).toBe(401);
    expect(await refused(h, { authorization: 'Bearer nonsense' })).toBe(401);
    expect(await refused(h, { authorization: `Bearer ddt_${'A'.repeat(43)}` })).toBe(401);
    expect(await refused(h, { authorization: `Bearer dob_${'A'.repeat(43)}` })).toBe(401);
  });

  it('protects cookie upgrades against cross-site WebSocket hijacking', async () => {
    const cookie = `__Host-dude_session=${owner.cookie}`;
    expect(await refused(h, { cookie })).toBe(401);
    expect(await refused(h, { cookie, origin: 'https://evil.example' })).toBe(401);
    expect(await refused(h, { cookie, origin: `http://127.0.0.1:${h.hub.port}` })).toBe(401);
    const { client, welcome } = await welcomed(h, ownerHeaders(h, owner));
    track(client);
    expect(welcome).toMatchObject({
      type: 'welcome', protocolVersion: HUB_PROTOCOL_VERSION, sessionKind: 'owner-cookie', deviceId: null, heartbeatIntervalMs: 25_000,
      tls: { spkiSha256: h.hub.tls.spkiSha256, nextSpkiSha256: null },
    });
    client.ws.close();
  });

  it('welcomes a device, reports it online while connected and offline after', async () => {
    const { device, token } = await enrolled(h, owner);
    expect(await online(device.deviceId)).toBe(false);
    const events = track(await connect(h, ownerHeaders(h, owner)));
    events.send(HELLO);
    await events.next((m) => m.type === 'welcome');

    const { client, welcome } = await welcomed(h, { authorization: `Bearer ${token}` });
    track(client);
    expect(welcome).toMatchObject({ sessionKind: 'device', deviceId: device.deviceId });
    expect(await online(device.deviceId)).toBe(true);
    // presence flips are pushed to owner sockets
    await events.next((m) => m.type === 'event' && m.event === 'device-registry-changed' && m.data.deviceId === device.deviceId && m.data.change === 'presence');
    const lastSeen = h.hub.hub.db.prepare('SELECT last_seen_at FROM devices WHERE device_id = ?').get(device.deviceId) as { last_seen_at: string | null };
    expect(lastSeen.last_seen_at).not.toBeNull();

    // two connections count once and stay online until both are gone
    const second = track((await welcomed(h, { authorization: `Bearer ${token}` })).client);
    client.ws.close();
    await client.closed;
    await sleep(50);
    expect(await online(device.deviceId)).toBe(true);
    second.ws.close();
    await second.closed;
    expect(await waitUntil(async () => !(await online(device.deviceId)))).toBe(true);
    events.ws.close();
  });

  it('accepts an owner bearer session', async () => {
    const { token } = await enrolled(h, owner);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: 'a very long password' } })).json.accessToken as string;
    const { client, welcome } = await welcomed(h, { authorization: `Bearer ${bearer}` });
    track(client);
    expect(welcome).toMatchObject({ sessionKind: 'owner-bearer', deviceId: null });
    client.ws.close();
  });

  it('delivers device-registry-changed to owner sockets on enroll and rename, but not to devices', async () => {
    const events = track((await welcomed(h, ownerHeaders(h, owner))).client);
    const first = await enrolled(h, owner);
    const deviceSocket = track((await welcomed(h, { authorization: `Bearer ${first.token}` })).client);
    const second = await enrolled(h, owner);
    await events.next((m) => m.event === 'device-registry-changed' && m.data.change === 'enrolled' && m.data.deviceId === second.device.deviceId);
    expect((await h.call('PATCH', `/devices/${second.device.deviceId}`, { cookie: owner.cookie, csrf: owner.csrf, body: { displayName: 'Desk' } })).status).toBe(200);
    await events.next((m) => m.event === 'device-registry-changed' && m.data.change === 'renamed' && m.data.deviceId === second.device.deviceId);
    expect(deviceSocket.messages.filter((m) => m.event === 'device-registry-changed')).toEqual([]);
    events.ws.close();
    deviceSocket.ws.close();
  });

  it('closes a revoked device and its bound owner bearer sockets with 4003', async () => {
    const { device, token } = await enrolled(h, owner);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: 'a very long password' } })).json.accessToken as string;
    const deviceSocket = track((await welcomed(h, { authorization: `Bearer ${token}` })).client);
    const bearerSocket = track((await welcomed(h, { authorization: `Bearer ${bearer}` })).client);
    const other = track((await welcomed(h, ownerHeaders(h, owner))).client);

    const preview = await h.call('POST', `/devices/${device.deviceId}/revoke/preview`, { cookie: owner.cookie, csrf: owner.csrf });
    expect((await h.call('POST', `/devices/${device.deviceId}/revoke`, { cookie: owner.cookie, csrf: owner.csrf, body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);
    expect(await withClose(deviceSocket)).toBe(REALTIME_CLOSE_CODES.revoked);
    expect(await withClose(bearerSocket)).toBe(REALTIME_CLOSE_CODES.revoked);
    expect(deviceSocket.messages.some((m) => m.event === 'device-revoked')).toBe(true);
    expect(bearerSocket.messages.some((m) => m.event === 'session-revoked')).toBe(true);
    expect(other.ws.readyState).toBe(WebSocket.OPEN); // the owner's own cookie session is untouched
    other.ws.close();
    expect(await refused(h, { authorization: `Bearer ${token}` })).toBe(401);
  });

  it('closes owner sockets and notifies the remaining connections after a device-assisted owner recovery', async () => {
    const trusted = await enrolled(h, owner);
    expect((await h.call('PUT', `/devices/${trusted.device.deviceId}/recovery-trust`, { cookie: owner.cookie, csrf: owner.csrf, body: { password: 'a very long password', trusted: true } })).status).toBe(200);
    const bystander = await enrolled(h, owner);
    const ownerSocket = track((await welcomed(h, ownerHeaders(h, owner))).client);
    const bystanderSocket = track((await welcomed(h, { authorization: `Bearer ${bystander.token}` })).client);
    const challenge = await h.call('POST', '/auth/device-recovery/challenge', { bearer: trusted.token });
    const signature = trusted.device.sign(ownerRecoveryMessage({ hubInstanceId: h.hub.hub.hubInstanceId, nonce: challenge.json.nonce, deviceId: trusted.device.deviceId }));
    expect((await h.call('POST', '/auth/device-recovery', { bearer: trusted.token, body: { nonce: challenge.json.nonce, signature, newPassword: 'a very long password' } })).status).toBe(200);
    expect(await withClose(ownerSocket)).toBe(REALTIME_CLOSE_CODES.revoked);
    expect(ownerSocket.messages.some((m) => m.event === 'session-revoked')).toBe(true);
    const notice = await bystanderSocket.next((m) => m.event === 'owner-recovered');
    expect(notice.data).toMatchObject({ deviceId: trusted.device.deviceId });
    expect(bystanderSocket.ws.readyState).toBe(WebSocket.OPEN);
    owner = await h.signIn();
  });

  it('closes the sockets of a revoked session with 4003', async () => {
    const second = await h.signIn();
    const client = track((await welcomed(h, ownerHeaders(h, second))).client);
    expect((await h.call('POST', '/auth/sign-out', { cookie: second.cookie, csrf: second.csrf })).status).toBe(200);
    expect(await withClose(client)).toBe(REALTIME_CLOSE_CODES.revoked);
    expect(client.messages.some((m) => m.event === 'session-revoked')).toBe(true);
  });

  it('closes a socket whose credential silently stopped being valid when re-validated', async () => {
    const short = await startAuthHub({ realtime: { revalidateIntervalMs: 100 } });
    try {
      const signed = await short.signIn();
      const client = await connect(short, ownerHeaders(short, signed));
      client.send(HELLO);
      await client.next((m) => m.type === 'welcome');
      short.hub.hub.db.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(new Date(short.clock.t).toISOString());
      expect(await withClose(client)).toBe(REALTIME_CLOSE_CODES.unauthorized);
    } finally { await short.close(); }
  });

  describe('protocol and limits', () => {
    it('rejects an incompatible hello with 4008', async () => {
      const client = track(await connect(h, ownerHeaders(h, owner)));
      client.send({ type: 'hello', protocolVersion: 1, minHubProtocol: 99 });
      expect(await withClose(client)).toBe(REALTIME_CLOSE_CODES.unsupportedProtocol);
      const old = track(await connect(h, ownerHeaders(h, owner)));
      old.send({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 });
      await old.next((m) => m.type === 'welcome');
      old.send(HELLO); // a second hello
      expect(await withClose(old)).toBe(REALTIME_CLOSE_CODES.protocolError);
    });

    it('closes 4010 on oversized, malformed, schema-invalid, binary or pre-hello messages', async () => {
      const bad: Array<(c: Client) => void> = [
        (c) => c.send('{not json'),
        (c) => c.send({ type: 'unknown' }),
        (c) => c.send({ type: 'hello', protocolVersion: 'x', minHubProtocol: 1 }),
        (c) => c.send({ type: 'heartbeat' }), // before hello
        (c) => c.send({ ...HELLO, extra: 'x'.repeat(REALTIME_MAX_MESSAGE_BYTES + 10) }),
        (c) => c.ws.send(Buffer.from([1, 2, 3])),
      ];
      for (const send of bad) {
        const client = track(await connect(h, ownerHeaders(h, owner)));
        send(client);
        expect(await withClose(client)).toBe(REALTIME_CLOSE_CODES.protocolError);
      }
      const afterHello = track((await welcomed(h, ownerHeaders(h, owner))).client);
      afterHello.send({ type: 'tls-pin-ack' });
      expect(await withClose(afterHello)).toBe(REALTIME_CLOSE_CODES.protocolError);
    });

    it('enforces hello, idle and rate limits with short injected timings', async () => {
      const short = await startAuthHub({ realtime: { helloTimeoutMs: 150, idleTimeoutMs: 300, rateLimit: { max: 5, windowMs: 60_000 } } });
      try {
        const signed = await short.signIn();
        const headers = ownerHeaders(short, signed);
        const silent = await connect(short, headers);
        expect(await withClose(silent)).toBe(REALTIME_CLOSE_CODES.protocolError); // no hello in time

        const idle = await connect(short, headers);
        idle.send(HELLO);
        await idle.next((m) => m.type === 'welcome');
        expect(await withClose(idle)).toBe(REALTIME_CLOSE_CODES.heartbeatTimeout);

        const alive = await connect(short, headers);
        alive.send(HELLO);
        await alive.next((m) => m.type === 'welcome');
        for (let i = 0; i < 3; i++) { await sleep(150); alive.send({ type: 'heartbeat' }); }
        expect(alive.ws.readyState).toBe(WebSocket.OPEN); // heartbeats reset the idle timer
        alive.ws.close();

        const flood = await connect(short, headers);
        flood.send(HELLO);
        for (let i = 0; i < 8; i++) flood.send({ type: 'heartbeat' });
        expect(await withClose(flood)).toBe(REALTIME_CLOSE_CODES.rateLimited);
      } finally { await short.close(); }
    });
  });

  describe('TLS rotation', () => {
    it('stages a next pin, collects acks, refuses activation while pending and swaps the certificate', async () => {
      const rotation = createTlsRotation({
        db: h.hub.hub.db, tlsDir: h.hub.paths.tlsDir, hubInstanceId: h.hub.hub.hubInstanceId,
        applySecureContext: (context) => (h.hub.app.server as unknown as TlsServer).setSecureContext(context),
        announceNext: (spkiSha256) => h.hub.app.hubEvents.emit('tls-next-pin', { spkiSha256 }),
      });
      const methods = buildAdminMethods({
        db: h.hub.hub.db, hubVersion: 't', hubInstanceId: h.hub.hub.hubInstanceId, bind: 'loopback', getPort: () => h.hub.port, startedAt: 0,
        configDir: h.hub.paths.configDir, spkiSha256: h.hub.tls.spkiSha256, tls: rotation,
      });
      const call = async (method: string, params: unknown = {}): Promise<any> => methods[method]!(params);

      // every currently active device must ack before a safe activation
      const active = h.hub.hub.db.prepare('SELECT device_id, display_name FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL').all() as Array<{ device_id: string; display_name: string }>;
      const a = await enrolled(h, owner);
      const b = await enrolled(h, owner);
      const connectedA = track((await welcomed(h, { authorization: `Bearer ${a.token}` })).client);
      const connectedB = track((await welcomed(h, { authorization: `Bearer ${b.token}` })).client);

      expect(await call('tls.activate.preview').catch((e: Error) => e.message)).toMatch(/No next certificate/);
      const staged = await call('tls.stage');
      expect(staged.spkiSha256).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(staged.spkiSha256).not.toBe(h.hub.tls.spkiSha256);
      const tlsDir = h.hub.paths.tlsDir;
      expect(existsSync(path.join(tlsDir, 'next-key.pem'))).toBe(true);
      expect(existsSync(path.join(tlsDir, 'next-cert.pem'))).toBe(true);
      expect(spkiSha256(readFileSync(path.join(tlsDir, 'next-cert.pem'), 'utf8'))).toBe(staged.spkiSha256);
      expect(await call('tls.stage').catch((e: Error) => e.message)).toMatch(/already staged/);
      expect(listAudit(h.hub.hub.db, { limit: 50 }).some((r) => r.event === 'tls.rotation-staged')).toBe(true);

      // hello reflects the next pin; connected devices are told
      const hello = (await request(h.hub.port, h.hub.tls.certPem, '/api/v1/hello')).body;
      expect(JSON.parse(hello).tls).toMatchObject({ spkiSha256: h.hub.tls.spkiSha256, nextSpkiSha256: staged.spkiSha256 });
      await connectedA.next((m) => m.event === 'tls-next-pin' && m.data.spkiSha256 === staged.spkiSha256);
      await connectedB.next((m) => m.event === 'tls-next-pin');
      const late = track((await welcomed(h, { authorization: `Bearer ${a.token}` })).client);
      expect((await late.next((m) => m.type === 'welcome')).tls.nextSpkiSha256).toBe(staged.spkiSha256);
      late.ws.close();

      // acks: only the current next pin, only from devices
      connectedA.send({ type: 'tls-pin-ack', spkiSha256: h.hub.tls.spkiSha256 });
      connectedA.send({ type: 'tls-pin-ack', spkiSha256: staged.spkiSha256 });
      await sleep(100);
      let status = await call('tls.status');
      expect(status.acked).toEqual([a.device.deviceId]);
      const pendingIds = status.pending.map((d: Msg) => d.deviceId);
      expect(pendingIds).toContain(b.device.deviceId);
      expect(pendingIds).not.toContain(a.device.deviceId);
      expect(status.pending.find((d: Msg) => d.deviceId === b.device.deviceId).displayName).toBe('Test laptop');
      for (const row of active) expect(pendingIds).toContain(row.device_id);

      // activation is refused while devices are pending
      expect(await call('tls.activate.preview').catch((e: Error) => e.message)).toMatch(/have not acknowledged/);

      // --force lists the devices that must re-pair; the token is not reusable and is bound to the force flag
      const previewForce = await call('tls.activate.preview', { force: true });
      expect(previewForce.summary.requirePairing.map((d: Msg) => d.deviceId)).toContain(b.device.deviceId);
      expect(await call('tls.activate.apply', { confirmToken: previewForce.confirmToken }).catch((e: Error) => e.message)).toMatch(/changed since the preview/);
      expect(await call('tls.activate.apply', { confirmToken: previewForce.confirmToken, force: true }).catch((e: Error) => e.message)).toMatch(/missing, expired or already used/);

      // everyone acks -> safe activation
      connectedB.send({ type: 'tls-pin-ack', spkiSha256: staged.spkiSha256 });
      for (const row of active) h.hub.hub.db.prepare('INSERT OR IGNORE INTO tls_pin_acks(spki_sha256, device_id, acked_at) VALUES(?, ?, ?)').run(staged.spkiSha256, row.device_id, new Date().toISOString());
      expect(await waitUntil(async () => (await call('tls.status')).pending.length === 0)).toBe(true);
      const preview = await call('tls.activate.preview');
      expect(preview.summary).toMatchObject({ nextSpkiSha256: staged.spkiSha256, force: false, requirePairing: [] });
      const oldCert = h.hub.tls.certPem;
      const done = await call('tls.activate.apply', { confirmToken: preview.confirmToken });
      expect(done).toMatchObject({ activated: true, spkiSha256: staged.spkiSha256, previousSpkiSha256: h.hub.tls.spkiSha256, requirePairing: [] });
      expect(await call('tls.activate.apply', { confirmToken: preview.confirmToken }).catch((e: Error) => e.message)).toMatch(/No next certificate/); // replay: nothing left to activate

      // files moved, pins updated, audited
      expect(readdirSync(tlsDir).filter((f) => f.startsWith('retired-')).length).toBe(2);
      expect(existsSync(path.join(tlsDir, 'next-key.pem'))).toBe(false);
      expect(spkiSha256(readFileSync(path.join(tlsDir, 'cert.pem'), 'utf8'))).toBe(staged.spkiSha256);
      const pins = h.hub.hub.db.prepare('SELECT spki_sha256, state FROM tls_pins ORDER BY created_at').all() as Array<{ spki_sha256: string; state: string }>;
      expect(pins.find((p) => p.spki_sha256 === staged.spkiSha256)?.state).toBe('active');
      expect(pins.find((p) => p.spki_sha256 === h.hub.tls.spkiSha256)?.state).toBe('retired');
      expect(listAudit(h.hub.hub.db, { limit: 50 }).some((r) => r.event === 'tls.rotation-activated')).toBe(true);

      // a new connection presents the new SPKI; a client pinned (trusting only) the old cert fails; one trusting the new cert works
      const presented = await new Promise<string>((resolve, reject) => {
        const socket = tls.connect({ host: '127.0.0.1', port: h.hub.port, rejectUnauthorized: false }, () => {
          const cert = new X509Certificate(socket.getPeerCertificate().raw);
          socket.destroy();
          resolve(spkiSha256(cert));
        });
        socket.on('error', reject);
      });
      expect(presented).toBe(staged.spkiSha256);
      const trusting = (ca: string): Promise<Error | null> => new Promise((resolve) => {
        const socket = tls.connect({ host: '127.0.0.1', port: h.hub.port, ca }, () => { socket.destroy(); resolve(null); });
        socket.on('error', (error) => resolve(error));
      });
      expect((await trusting(oldCert))?.message).toMatch(/self[- ]signed|unable to verify|certificate/i);
      expect(await trusting(readFileSync(path.join(tlsDir, 'cert.pem'), 'utf8'))).toBeNull();
      const newCert = readFileSync(path.join(tlsDir, 'cert.pem'), 'utf8');
      const ok = await request(h.hub.port, newCert, '/api/v1/hello');
      expect(JSON.parse(ok.body).tls).toMatchObject({ spkiSha256: staged.spkiSha256, nextSpkiSha256: null });
      await expect(connect(h, ownerHeaders(h, owner), oldCert)).rejects.toThrow();
      track(await connect(h, ownerHeaders(h, owner), newCert)).ws.close();

      // the status afterwards: no staged pin
      expect((await call('tls.status')).next).toBeNull();
    });

    it('force-activates with unacknowledged devices and restages over an existing next pin', async () => {
      const short = await startAuthHub();
      try {
        const signed = await short.signIn();
        const pending = await enrolled(short, signed);
        const rotation = createTlsRotation({
          db: short.hub.hub.db, tlsDir: short.hub.paths.tlsDir, hubInstanceId: short.hub.hub.hubInstanceId,
          applySecureContext: (context) => (short.hub.app.server as unknown as TlsServer).setSecureContext(context),
        });
        const first = rotation.stage();
        expect(() => rotation.stage()).toThrow(/already staged/);
        const second = rotation.stage({ restage: true });
        expect(second.spkiSha256).not.toBe(first.spkiSha256);
        expect(short.hub.hub.db.prepare("SELECT COUNT(*) AS n FROM tls_pins WHERE state = 'next'").get()).toMatchObject({ n: 1 });
        expect(() => rotation.previewActivate()).toThrow(/have not acknowledged/);
        const preview = rotation.previewActivate({ force: true });
        expect(preview.summary.requirePairing).toEqual([{ deviceId: pending.device.deviceId, displayName: 'Test laptop' }]);
        const applied = rotation.applyActivate({ confirmToken: preview.confirmToken, force: true });
        expect(applied.requirePairing).toEqual(preview.summary.requirePairing);
        expect(JSON.parse((await request(short.hub.port, readFileSync(path.join(short.hub.paths.tlsDir, 'cert.pem'), 'utf8'), '/api/v1/hello')).body).tls.spkiSha256).toBe(second.spkiSha256);
        // (pairing strings advertise the active pin; covered by the shared lookup in create-server)
      } finally { await short.close(); }
    });
  });

  describe('tls CLI', () => {
    it('parses the tls commands and runs them in two phases', async () => {
      expect(parseArgs(['tls', 'status'])).toEqual({ command: 'tls', action: 'status' });
      expect(parseArgs(['tls', 'rotate', '--restage', '--data-dir', 'x'])).toEqual({ command: 'tls', action: 'rotate', restage: true, dataDir: 'x' });
      expect(parseArgs(['tls', 'activate', '--force', '--confirm', 'tok'])).toEqual({ command: 'tls', action: 'activate', force: true, confirm: 'tok' });
      expect(() => parseArgs(['tls', 'rotate', '--force'])).toThrow();
      expect(() => parseArgs(['tls', 'bogus'])).toThrow();

      const calls: Array<[string, unknown]> = [];
      let out = '';
      const deps = { stdout: (t: string) => { out += t; }, stderr: () => undefined, call: async (_d: string, method: string, params: unknown) => { calls.push([method, params]); return { ok: method }; } };
      expect(await runTls({ action: 'status', dataDir: 'x' }, deps)).toBe(0);
      expect(await runTls({ action: 'rotate', dataDir: 'x', restage: true }, deps)).toBe(0);
      expect(await runTls({ action: 'activate', dataDir: 'x', force: true }, deps)).toBe(0);
      expect(await runTls({ action: 'activate', dataDir: 'x', force: true, confirm: 'tok' }, deps)).toBe(0);
      expect(calls.map(([m]) => m)).toEqual(['tls.status', 'tls.stage', 'tls.activate.preview', 'tls.activate.apply']);
      expect(calls[3]![1]).toEqual({ confirmToken: 'tok', force: true });
      expect(out).toContain('tls.stage');
    });
  });
});
