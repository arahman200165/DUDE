import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HUB_REALTIME_PATH, REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import { getAuthorityEpoch, getAuthorityState, setAuthority } from '../hub/authority.js';
import { FLOOD_POLICY } from '../security/rate-limit.js';
import { isFencedWhenTransferred, HUB_TRANSFERRED_MESSAGE } from '../security/transfer-fence.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { makeWebRoot, request } from './test-helpers.js';

/** The fencing matrix of a transferred Hub (PD-071): everything but `hello` and the static web app answers 503 `hub-transferred`. */
const BURST = FLOOD_POLICY.burst;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSFERRED = { error: { code: 'hub-transferred', message: 'This Hub was transferred to another machine and is read-only.' } };

describe('transferred Hub fencing', () => {
  let h: AuthHub;
  let owner: Signed;
  let device: { token: string; deviceId: string };
  const db = () => h.hub.hub.db;
  const retire = (): void => setAuthority(db(), { epoch: getAuthorityEpoch(db()), state: 'transferred' });
  const reactivate = (): void => setAuthority(db(), { epoch: getAuthorityEpoch(db()) + 1, state: 'active' });
  const refill = (): void => { h.clock.t += 60_000; };

  beforeAll(async () => {
    h = await startAuthHub({ config: { webRoot: makeWebRoot() } });
    refill();
    owner = await h.signIn();
    refill();
    const enrolledDevice = await enrolled(h, owner);
    device = { token: enrolledDevice.token, deviceId: enrolledDevice.device.deviceId };
    refill();
  });
  const sockets: WebSocket[] = [];
  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await h.close();
  });

  const wsRefused = (headers: Record<string, string>): Promise<number> => new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers });
    ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode ?? 0); });
    ws.on('open', () => { ws.close(); reject(new Error('upgrade was accepted')); });
    ws.on('error', () => { /* unexpected-response also fires */ });
  });
  const ownerHeaders = (): Record<string, string> => ({ cookie: `__Host-dude_session=${owner.cookie}`, origin: `https://127.0.0.1:${h.hub.port}` });

  it('classifies what is fenced: every API path except GET|HEAD hello, including encoded and slash-doubled spellings', () => {
    expect(isFencedWhenTransferred('GET', '/api/v1/hello')).toBe(false);
    expect(isFencedWhenTransferred('HEAD', '/api/v1/hello?x=1')).toBe(false);
    expect(isFencedWhenTransferred('POST', '/api/v1/hello')).toBe(true);
    for (const url of ['/api/v1/sessions', '/api', '/api/', '/api/v1/realtime', '//api/v1/sessions', '/%61pi/v1/sessions', '/api%2Fv1/sessions', '/api\\v1\\sessions', '/API/v1/sessions', '/api/v1/hello/', '/api/v1/hello/../sessions']) {
      expect(isFencedWhenTransferred('GET', url), url).toBe(true);
    }
    for (const url of ['/', '/index.html', '/main-ABC12345.js', '/assets/vendor/pyodide/pyodide.js', '/sandbox/python.html', '/apiary', '/tools/api-tester']) {
      expect(isFencedWhenTransferred('GET', url), url).toBe(false);
    }
  });

  it('serves hello (reporting the state) and the web app, and 503s everything else, even with valid credentials created before the transfer', async () => {
    // Credentials work before the transfer.
    expect((await h.call('GET', '/sessions', { cookie: owner.cookie, csrf: owner.csrf })).status).toBe(200);
    expect((await h.call('GET', '/devices/self', { bearer: device.token })).status).toBe(200);

    retire();
    expect(getAuthorityState(db())).toBe('transferred');

    const hello = await h.call('GET', '/hello');
    expect(hello.status).toBe(200);
    expect(hello.json).toMatchObject({ authorityState: 'transferred', authorityEpoch: getAuthorityEpoch(db()) });
    for (const asset of ['/', '/index.html', '/main-ABC12345.js', '/favicon.ico']) {
      const res = await request(h.hub.port, h.hub.tls.certPem, asset, { headers: { host: `localhost:${h.hub.port}` } });
      expect(res.status, asset).toBe(200);
    }

    const cookie = { cookie: owner.cookie, csrf: owner.csrf };
    const bearer = { bearer: device.token, noOrigin: true };
    const matrix: Array<[string, string, Parameters<AuthHub['call']>[2]]> = [
      ['POST', '/bootstrap', { body: { setupToken: 'x', ownerDisplayName: 'Ada', environmentName: 'Home', password: 'a very long password' } }],
      ['POST', '/auth/sign-in', { body: { password: 'a very long password' } }],
      ['POST', '/auth/step-up', { ...cookie, body: { password: 'a very long password' } }],
      ['POST', '/auth/owner/bearer', { body: { password: 'a very long password' } }],
      ['POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId: device.deviceId } }],
      ['POST', '/auth/device/token', { noOrigin: true, body: { deviceId: device.deviceId, nonce: 'n', signature: 's' } }],
      ['POST', '/auth/device-recovery/challenge', { noOrigin: true, body: {} }],
      ['POST', '/auth/device-recovery', { ...bearer, body: {} }],
      ['POST', '/devices/enroll', { noOrigin: true, body: {} }],
      ['POST', '/pairing-codes', { ...cookie, body: {} }],
      ['GET', '/devices', cookie],
      ['GET', '/devices/self', bearer],
      ['GET', '/sessions', cookie],
      ['POST', '/sessions/revoke-all/preview', { ...cookie, body: {} }],
      ['GET', '/audit', cookie],
      ['GET', '/diagnostics', cookie],
      ['GET', '/backup/status', cookie],
      ['GET', '/reachability/echo', cookie],
      ['GET', '/reachability/echo', bearer],
      ['GET', '/security/alerts', cookie],
      ['POST', '/security/alerts/seen', { ...cookie, body: {} }],
      ['GET', '/tls/certificates', cookie],
      ['GET', '/sync/changes?since=0', bearer],
      ['POST', '/sync/push', { ...bearer, body: {} }],
      ['GET', '/web/state', cookie],
      ['POST', '/web/push', { ...cookie, body: {} }],
      ['GET', '/not-a-route', {}],
    ];
    const before = h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number };
    for (const [method, path, options] of matrix) {
      const res = await h.call(method, path, options);
      expect(res.status, `${method} ${path}`).toBe(503);
      expect(res.json, `${method} ${path}`).toEqual(TRANSFERRED);
      expect(res.raw.headers['cache-control']).toBe('no-store');
    }
    expect(TRANSFERRED.error.message).toBe(HUB_TRANSFERRED_MESSAGE);
    // The refusals are not audited per request, and nothing was written by any of them.
    expect(h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get()).toEqual(before);
    expect(h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM owner').get()).toEqual({ n: 1 });

    // A non-API method on the API tree is refused too (not only the registered verbs).
    expect((await h.call('DELETE', '/devices/x', cookie)).status).toBe(503);
  });

  it('refuses the realtime upgrade for owner and device credentials with 503, before authentication', async () => {
    expect(getAuthorityState(db())).toBe('transferred');
    expect(await wsRefused(ownerHeaders())).toBe(503);
    expect(await wsRefused({ authorization: `Bearer ${device.token}` })).toBe(503);
    expect(await wsRefused({})).toBe(503); // an unauthenticated upgrade is also 503, not 401: the fence answers first
  });

  it('never counts the refusals as flood hits, whatever the volume', async () => {
    expect(getAuthorityState(db())).toBe('transferred');
    refill();
    for (let i = 0; i < BURST + 60; i += 1) {
      expect((await h.call('GET', '/sessions', { cookie: owner.cookie, csrf: owner.csrf })).status).toBe(503);
    }
    // No 429 above, and the per-address bucket is still full for the first request after reactivation.
    expect(h.hub.hub.db.prepare("SELECT COUNT(*) AS n FROM throttle WHERE throttle_key LIKE 'flood:%' OR throttle_key LIKE 'any-fail:%'").get()).toEqual({ n: 0 });
    expect(h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM ip_blocks').get()).toEqual({ n: 0 });
  });

  it('closes an open socket with 4004 when a message arrives after the state flipped, and via closeAll', async () => {
    reactivate();
    refill();
    const open = (headers: Record<string, string>): Promise<{ ws: WebSocket; closed: Promise<number>; messages: any[] }> => new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers });
      const messages: any[] = [];
      const closed = new Promise<number>((r) => { ws.on('close', (code) => r(code)); });
      ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
      ws.on('error', reject);
      ws.on('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)));
      ws.on('open', () => { sockets.push(ws); resolve({ ws, closed, messages }); });
    });
    const first = await open(ownerHeaders());
    first.ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 }));
    for (let i = 0; i < 100 && first.messages.length === 0; i += 1) await sleep(20);
    expect(first.messages[0]).toMatchObject({ type: 'welcome' });
    retire();
    first.ws.send(JSON.stringify({ type: 'heartbeat' }));
    expect(await Promise.race([first.closed, sleep(3000).then(() => -1)])).toBe(REALTIME_CLOSE_CODES.transferred);
    expect(REALTIME_CLOSE_CODES.transferred).toBe(4004);

    reactivate();
    refill();
    const second = await open({ authorization: `Bearer ${device.token}` });
    second.ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 }));
    for (let i = 0; i < 100 && second.messages.length === 0; i += 1) await sleep(20);
    h.hub.app.realtime.closeAll(REALTIME_CLOSE_CODES.transferred, 'hub transferred');
    expect(await Promise.race([second.closed, sleep(3000).then(() => -1)])).toBe(4004);
  });

  it('serves everything again after reactivation, with the same session and device token, under the next epoch', async () => {
    retire();
    const epoch = getAuthorityEpoch(db());
    expect((await h.call('GET', '/sessions', { cookie: owner.cookie, csrf: owner.csrf })).status).toBe(503);
    reactivate();
    refill();
    expect(getAuthorityEpoch(db())).toBe(epoch + 1);
    expect((await h.call('GET', '/hello')).json).toMatchObject({ authorityState: 'active', authorityEpoch: epoch + 1 });
    expect((await h.call('GET', '/sessions', { cookie: owner.cookie, csrf: owner.csrf })).status).toBe(200);
    expect((await h.call('GET', '/devices/self', { bearer: device.token })).status).toBe(200);
    expect((await h.call('POST', '/auth/sign-in', { body: { password: 'a very long password' } })).status).toBe(200);
  });
});
