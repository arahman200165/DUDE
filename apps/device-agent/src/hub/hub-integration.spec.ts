import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceListResponse } from '@dude/contracts/hub';
import { readDeviceRecord } from '../store/identity.js';
import { getEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { CAPABILITIES, fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { cleanupTemp } from '../testing/test-utils.js';
import { listRecords } from '../store/repos/records.repo.js';
import { spkiSha256Of } from './pinned-transport.js';

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a recovered long password';

let hubHandle: HubHandle;
const rawRequest = (method: string, requestPath: string, body: unknown, headers: Record<string, string> = {}): ReturnType<HubHandle['request']> => hubHandle.request(method, requestPath, body, headers);
const hubCli = (...args: string[]): string => hubHandle.cli(...args);
const cert = (): string => hubHandle.cert();

beforeAll(async () => {
  // Relaxed (test-only) rate limits: the credential bucket no longer needs 30 s refills between cases.
  hubHandle = await startHub({ bootstrap: { password: PASSWORD } });
}, 60_000);

afterAll(async () => {
  stopAgents();
  await hubHandle?.dispose();
  cleanupTemp();
});

describe('device agent against a real Hub', () => {
  it('enrolls, runs owner operations, revokes, rotates the certificate pin and unenrolls', async () => {
    const dpapi = fakeDpapi();

    // The first pairing code needs an owner cookie session (the only browser-style credential).
    const signIn = await rawRequest('POST', '/api/v1/auth/sign-in', { password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = String((signIn.headers['set-cookie'] as string[])[0]).split(';')[0]!;
    const csrf = String(signIn.body['csrfToken']);
    const browserHeaders = { cookie, origin: `https://127.0.0.1:${hubHandle.port}`, 'x-dude-csrf': csrf };
    const firstCode = await rawRequest('POST', '/api/v1/pairing-codes', { host: '127.0.0.1' }, browserHeaders);
    expect(firstCode.status).toBe(200);

    // Device A enrolls and comes online.
    const a = startAgent(dpapi);
    expect(a.hub.manager.status().state).toBe('standalone');
    const enrolled = await a.rpc('hub.enroll', { pairingString: String(firstCode.body['pairingString']) });
    expect(enrolled.enrollment?.state).toBe('enrolled');
    await waitFor('A online', () => a.hub.manager.status().state === 'online');
    expect(a.store.db.prepare('SELECT state FROM hub_enrollment').get()).toMatchObject({ state: 'enrolled' });
    await expect(a.rpc('hub.enroll', { pairingString: String(firstCode.body['pairingString']) })).rejects.toMatchObject({ code: 'already-enrolled' });

    // Owner actions over the device: the bearer lives only inside the agent.
    await expect(a.rpc('hub.owner.listDevices', {})).rejects.toMatchObject({ code: 'owner-not-signed-in' });
    const owner = await a.rpc('hub.owner.signIn', { password: PASSWORD });
    expect(owner.signedIn).toBe(true);
    expect(JSON.stringify(owner)).not.toContain('dob_');
    const idA = a.store.device.deviceId;
    const listed: DeviceListResponse = await a.rpc('hub.owner.listDevices', {});
    expect(listed.find((d) => d.deviceId === idA)).toMatchObject({ online: true, current: true });
    const summary = await a.rpc('hub.owner.syncSummary', {});
    expect(summary).toMatchObject({ headRevision: expect.any(Number), devices: expect.any(Array) });
    expect(Object.keys(summary.counts)).toContain('settings');

    // Device B is paired through A's owner session.
    const code = await a.rpc('hub.owner.createPairingCode', { host: '127.0.0.1' });
    const b = startAgent(dpapi);
    await b.rpc('hub.enroll', { pairingString: code.pairingString });
    await waitFor('B online', () => b.hub.manager.status().state === 'online');
    const idB = b.store.device.deviceId;
    await a.rpc('hub.owner.renameDevice', { deviceId: idB, displayName: 'Device B' });

    // Revoking B: B goes revoked (row kept), A stays online.
    const preview = await a.rpc('hub.owner.revokeDevicePreview', { deviceId: idB });
    await a.rpc('hub.owner.revokeDevice', { deviceId: idB, confirmToken: preview.confirmToken });
    await waitFor('B revoked', () => b.hub.manager.status().state === 'revoked', 30_000);
    expect(getEnrollment(b.store.db)?.state).toBe('revoked');
    expect(a.hub.manager.status().state).toBe('online');
    await expect(b.rpc('hub.enroll', { pairingString: code.pairingString })).rejects.toMatchObject({ code: 'already-enrolled' });
    await b.rpc('hub.unenroll', { force: false });
    expect(b.hub.manager.status().state).toBe('standalone');

    // Certificate rotation: stage, A fetches and acks the next pin, then the two-phase activation.
    const before = getEnrollment(a.store.db)!;
    hubCli('tls', 'rotate');
    const staged = await waitFor('A stages the next pin', () => getEnrollment(a.store.db)?.spkiNext ?? undefined);
    expect(staged).not.toBe(before.spkiActive);
    await waitFor('Hub sees the ack', () => !JSON.parse(hubCli('tls', 'status')).pending?.length, 10_000);
    const previewOut = JSON.parse(hubCli('tls', 'activate')) as { confirmToken: string };
    hubCli('tls', 'activate', '--confirm', previewOut.confirmToken);
    expect(spkiSha256Of(cert())).toBe(staged);

    // The next owner call crosses the new certificate: the staged pin is promoted.
    await a.rpc('hub.owner.listSessions', {});
    expect(getEnrollment(a.store.db)).toMatchObject({ spkiActive: staged, spkiNext: null });
    // And a fresh realtime connection works with the promoted pin.
    a.hub.manager.stop();
    a.hub.manager.start();
    await waitFor('A online on the new certificate', () => a.hub.manager.status().state === 'online');

    // Reverse-proxy pin: staged, announced as a proxy pin, recorded in the accepted set and acknowledged; then activated.
    const proxyPin = Buffer.alloc(32, 7).toString('base64url');
    hubCli('tls', 'proxy-pin', 'add', proxyPin);
    await waitFor('A records the proxy pin', () => (getEnrollment(a.store.db)?.proxySpkis.includes(proxyPin) ? true : undefined));
    await waitFor('Hub sees the proxy ack', () => !JSON.parse(hubCli('tls', 'proxy-pin', 'list')).pending?.length, 10_000);
    const proxyPreview = JSON.parse(hubCli('tls', 'proxy-pin', 'activate')) as { confirmToken: string };
    hubCli('tls', 'proxy-pin', 'activate', '--confirm', proxyPreview.confirmToken);
    expect(JSON.parse(hubCli('tls', 'proxy-pin', 'list')).active.spkiSha256).toBe(proxyPin);

    // Sign out drops the bearer; unenroll tells the Hub and returns the device to standalone.
    await a.rpc('hub.owner.signOut', {});
    await expect(a.rpc('hub.owner.listDevices', {})).rejects.toMatchObject({ code: 'owner-not-signed-in' });
    await a.rpc('hub.unenroll', {});
    expect(a.hub.manager.status()).toMatchObject({ state: 'standalone', enrollment: null });
    expect(getEnrollment(a.store.db)).toBeNull();
  }, 60_000);
  it('recovers the owner password from a recovery-trusted device only', async () => {
    const dpapi = fakeDpapi();
    const signIn = await rawRequest('POST', '/api/v1/auth/sign-in', { password: PASSWORD });
    expect(signIn.status).toBe(200);
    const headers = { cookie: String((signIn.headers['set-cookie'] as string[])[0]).split(';')[0]!, origin: `https://127.0.0.1:${hubHandle.port}`, 'x-dude-csrf': String(signIn.body['csrfToken']) };
    const pairing = String((await rawRequest('POST', '/api/v1/pairing-codes', { host: '127.0.0.1' }, headers)).body['pairingString']);

    const agent = startAgent(dpapi);
    await agent.rpc('hub.enroll', { pairingString: pairing });
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    // Not recovery-trusted yet: the Hub refuses.
    await expect(agent.rpc('hub.recoverOwner', { newPassword: NEW_PASSWORD })).rejects.toMatchObject({ code: 'not-trusted' });

    await agent.rpc('hub.owner.signIn', { password: PASSWORD });
    const deviceId = readDeviceRecord(agent.store.db, CAPABILITIES).deviceId;
    await agent.rpc('hub.owner.setRecoveryTrust', { deviceId, password: PASSWORD, trusted: true });
    expect(await agent.rpc('hub.recoverOwner', { newPassword: NEW_PASSWORD })).toEqual({ ok: true });
    // The Hub revoked every owner session, so the held bearer is gone and the old password no longer works.
    await expect(agent.rpc('hub.owner.listDevices', {})).rejects.toMatchObject({ code: 'owner-not-signed-in' });
    expect((await rawRequest('GET', '/api/v1/auth/session', undefined, { cookie: headers.cookie, origin: headers.origin })).status).toBe(401);
    expect((await rawRequest('POST', '/api/v1/auth/sign-in', { password: NEW_PASSWORD })).status).toBe(200);
    await agent.rpc('hub.unenroll', { force: true });
  }, 90_000);
  it('syncs a favorite between two enrolled devices in both directions, including deletes', async () => {
    const dpapi = fakeDpapi();
    const signIn = await rawRequest('POST', '/api/v1/auth/sign-in', { password: NEW_PASSWORD });
    expect(signIn.status).toBe(200);
    const headers = { cookie: String((signIn.headers['set-cookie'] as string[])[0]).split(';')[0]!, origin: `https://127.0.0.1:${hubHandle.port}`, 'x-dude-csrf': String(signIn.body['csrfToken']) };
    const pairings = await Promise.all([1, 2].map(async () => String((await rawRequest('POST', '/api/v1/pairing-codes', { host: '127.0.0.1' }, headers)).body['pairingString'])));

    const a = startAgent(dpapi);
    const b = startAgent(dpapi);
    // B used DUDE standalone first: this favorite must merge up on its first sync.
    const preexisting = { id: 'tool:preexisting', kind: 'tool', targetId: 'preexisting', order: 3 };
    await b.rpc('entity.commit', { entityType: 'favorite', entityId: 'tool:preexisting', op: 'upsert', payload: preexisting });
    await a.rpc('hub.enroll', { pairingString: pairings[0]! });
    await b.rpc('hub.enroll', { pairingString: pairings[1]! });
    await waitFor('A and B online', () => a.hub.manager.status().state === 'online' && b.hub.manager.status().state === 'online');
    // Before the first sync is done (M656) nothing moves.
    expect((await a.rpc('sync.status', {})).phase).toBe('needs-first-sync');
    const previewA = await a.rpc('sync.firstSync.preview', {});
    expect(previewA.categories.find((c) => c.category === 'favorites')).toMatchObject({ localCount: 0, hubCount: 0 });
    expect(await a.rpc('sync.firstSync.apply', { choices: {}, digest: previewA.digest, ...(previewA.confirmToken ? { confirmToken: previewA.confirmToken } : {}) })).toMatchObject({ cursor: 0 });
    const previewB = await b.rpc('sync.firstSync.preview', {});
    expect(previewB.categories.find((c) => c.category === 'favorites')).toMatchObject({ localCount: 1, localOnly: 1, recommended: 'merge' });
    const afterB = await b.rpc('sync.firstSync.apply', { choices: { favorites: 'merge' }, digest: previewB.digest });
    expect(afterB.phase).not.toBe('needs-first-sync');
    expect(getEnrollment(b.store.db)?.environmentId).toBeTruthy();
    expect(listRecords(b.store.db, 'favorite').length).toBe(1);
    await waitFor('A receives the merged-up favorite', () => listRecords(a.store.db, 'favorite').some((r) => r.entityId === 'tool:preexisting'));
    expect(listRecords(a.store.db, 'favorite').find((r) => r.entityId === 'tool:preexisting')?.payload).toEqual(preexisting);

    const favorite = { id: 'tool:base64', kind: 'tool', targetId: 'base64', order: 0 };
    const has = (agent: Agent): boolean => listRecords(agent.store.db, 'favorite').some((r) => r.entityId === 'tool:base64');
    await a.rpc('entity.commit', { entityType: 'favorite', entityId: 'tool:base64', op: 'upsert', payload: favorite });
    await waitFor('B receives the favorite', () => has(b));
    expect(await a.rpc('sync.now', {})).toMatchObject({ pending: 0, conflicts: 0 });
    expect(listRecords(b.store.db, 'favorite').find((r) => r.entityId === 'tool:base64')?.payload).toEqual(favorite);

    await b.rpc('entity.commit', { entityType: 'favorite', entityId: 'tool:base64', op: 'delete' });
    await waitFor('A converges on the delete', () => !has(a));
    const status = await b.rpc('sync.now', {});
    expect(status).toMatchObject({ phase: 'idle', pending: 0, quarantined: 0, conflicts: 0 });
    expect(status.cursor).toBeGreaterThan(0);
    await a.rpc('hub.unenroll', { force: true });
    await b.rpc('hub.unenroll', { force: true });
  }, 120_000);
});
