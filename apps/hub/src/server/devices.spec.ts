import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_PLATFORMS as PERSISTENCE_PLATFORMS } from '@dude/persistence';
import { DEVICE_CAPABILITIES, DEVICE_CHALLENGE_TTL_MS, DEVICE_PLATFORMS, DEVICE_TOKEN_TTL_MS, PAIRING_CODE_TTL_MS, deviceAuthMessage, parsePairingString } from '@dude/contracts/hub';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { createPairingCode, deviceMeta, deviceToken, enroll, enrolled, newDevice } from './device-test-helpers.js';
import { listAudit } from '../security/audit.js';

describe('device registry', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });
  // Failure counters are global; reset them so each case starts from a clean throttle.
  beforeEach(() => { h.hub.hub.db.prepare('DELETE FROM throttle').run(); });

  const audits = (event: string) => listAudit(h.hub.hub.db, { limit: 200 }).filter((r) => r.event === event);
  const self = (token: string) => h.call('GET', '/devices/self', { bearer: token });
  const ownerAuth = () => ({ cookie: owner.cookie, csrf: owner.csrf });

  it('keeps the contract platform list in step with persistence', () => {
    expect([...DEVICE_PLATFORMS]).toEqual([...PERSISTENCE_PLATFORMS]);
  });

  it('runs the full flow: pairing code, enroll, challenge, token, self, owner list', async () => {
    const created = await createPairingCode(h, owner);
    expect(created.status).toBe(200);
    expect(created.raw.headers['cache-control']).toBe('no-store');
    expect(created.json.pairingCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(created.json.expiresAt).toBe(new Date(h.clock.t + PAIRING_CODE_TTL_MS).toISOString());
    expect(created.json.spkiSha256).toBe(h.hub.tls.spkiSha256);
    expect(created.json.hubUrl).toBe(`https://localhost:${h.hub.port}`);
    expect(audits('pairing.created')).toHaveLength(1);
    // only the hash of the code is stored
    const stored = h.hub.hub.db.prepare('SELECT code_hash FROM pairing_codes').all() as Array<{ code_hash: string }>;
    expect(JSON.stringify(stored)).not.toContain(created.json.pairingCode.replace('-', ''));

    const device = newDevice();
    const res = await enroll(h, device, { code: created.json.pairingCode });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ deviceId: device.deviceId, hubInstanceId: h.hub.hub.hubInstanceId, hubRevision: expect.any(Number) });
    expect(res.json.keyId).toBeTruthy();
    expect(audits('device.enrolled')).toHaveLength(1);

    const { token, res: tokenRes } = await deviceToken(h, device);
    expect(tokenRes.status).toBe(200);
    expect(token).toMatch(/^ddt_[A-Za-z0-9_-]{43}$/);
    expect(tokenRes.json.expiresAt).toBe(new Date(h.clock.t + DEVICE_TOKEN_TTL_MS).toISOString());
    const hashStored = h.hub.hub.db.prepare('SELECT token_hash FROM device_tokens').all() as Array<{ token_hash: string }>;
    expect(JSON.stringify(hashStored)).not.toContain(token.slice(4));

    const before = h.hub.hub.db.prepare('SELECT last_seen_at FROM devices WHERE device_id = ?').get(device.deviceId) as { last_seen_at: string | null };
    expect(before.last_seen_at).toBeNull();
    const me = await self(token);
    expect(me.status).toBe(200);
    expect(me.json).toMatchObject({ deviceId: device.deviceId, displayName: 'Test laptop', platform: 'windows', online: false, current: true, revokedAt: null, capabilities: ['desktop', 'filesystem'] });
    const after = h.hub.hub.db.prepare('SELECT last_seen_at FROM devices WHERE device_id = ?').get(device.deviceId) as { last_seen_at: string };
    expect(after.last_seen_at).toBe(new Date(h.clock.t).toISOString());
    // last_seen is written at most once a minute
    h.clock.t += 30_000;
    await self(token);
    expect((h.hub.hub.db.prepare('SELECT last_seen_at FROM devices WHERE device_id = ?').get(device.deviceId) as { last_seen_at: string }).last_seen_at).toBe(after.last_seen_at);
    h.clock.t += 31_000;
    await self(token);
    expect((h.hub.hub.db.prepare('SELECT last_seen_at FROM devices WHERE device_id = ?').get(device.deviceId) as { last_seen_at: string }).last_seen_at).not.toBe(after.last_seen_at);

    const list = await h.call('GET', '/devices', { cookie: owner.cookie });
    expect(list.status).toBe(200);
    const entry = list.json.find((d: { deviceId: string }) => d.deviceId === device.deviceId);
    expect(entry).toMatchObject({ displayName: 'Test laptop', current: false, online: false, recoveryTrusted: false, unenrolledAt: null });
    expect(list.raw.body).not.toContain(device.publicKey);
  });

  it('round-trips the pairing string from the API response', async () => {
    const created = await createPairingCode(h, owner);
    const parts = parsePairingString(created.json.pairingString)!;
    expect(parts).toEqual({ host: 'localhost', port: h.hub.port, code: created.json.pairingCode.replace('-', ''), spkiSha256: h.hub.tls.spkiSha256 });
    // the compact code form from the string is accepted by enroll
    const device = newDevice();
    expect((await enroll(h, device, { code: parts.code })).status).toBe(200);
  });

  it('only issues pairing codes for allowed hosts', async () => {
    expect((await createPairingCode(h, owner, 'evil.example')).status).toBe(400);
    const ok = await createPairingCode(h, owner, '127.0.0.1');
    expect(ok.status).toBe(200);
    expect(ok.json.pairingString).toContain(`dude-pair:v1:127.0.0.1:${h.hub.port}:`);
    const v6 = await createPairingCode(h, owner, '[::1]');
    expect(v6.status).toBe(200);
    expect(parsePairingString(v6.json.pairingString)?.host).toBe('[::1]');
    expect((await h.call('POST', '/pairing-codes', { cookie: owner.cookie, csrf: owner.csrf, body: { host: 'a b' } })).status).toBe(400);
    expect((await h.call('POST', '/pairing-codes', { body: {} })).status).toBe(401); // no credential
  });

  it('makes a pairing code single-use', async () => {
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    expect((await enroll(h, newDevice(), { code })).status).toBe(200);
    expect((await enroll(h, newDevice(), { code })).status).toBe(401);
  });

  it('invalidates a code after five wrong attempts', async () => {
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    const stranger = newDevice();
    for (let i = 0; i < 5; i++) expect((await enroll(h, stranger, { code: 'ZZZZ-ZZZZ' })).status).toBe(401);
    expect((await enroll(h, newDevice(), { code })).status).toBe(401);
    expect(audits('auth.failure').some((r) => (r.detail as { kind?: string }).kind === 'pairing')).toBe(true);
    // a fresh code works again once the lockout has passed
    h.clock.t += 60_000;
    const fresh = (await createPairingCode(h, owner)).json.pairingCode as string;
    expect((await enroll(h, newDevice(), { code: fresh })).status).toBe(200);
  });

  it('rejects an expired code', async () => {
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    h.clock.t += PAIRING_CODE_TTL_MS + 1;
    expect((await enroll(h, newDevice(), { code })).status).toBe(401);
  });

  it('rejects a bad signature (audited) without burning the code, and a signature from a different key', async () => {
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    const device = newDevice();
    const impostor = newDevice();
    const failuresBefore = audits('auth.failure').length;
    // signed by another key
    expect((await enroll(h, device, { code, signWith: impostor })).status).toBe(401);
    // signed with the right key but registering a different public key than the one signed over
    const other = newDevice();
    expect((await enroll(h, device, { code, publicKey: other.publicKey })).status).toBe(401);
    // signed over the wrong Hub
    expect((await enroll(h, device, { code, hubInstanceId: '00000000-0000-4000-8000-000000000000' })).status).toBe(401);
    // malformed key material
    expect((await enroll(h, device, { code, publicKey: 'A'.repeat(43) })).status).toBe(401);
    const failures = audits('auth.failure').slice(0, audits('auth.failure').length - failuresBefore);
    expect(failures.length).toBeGreaterThanOrEqual(4);
    expect(failures.every((r) => (r.detail as { kind?: string }).kind === 'device-signature')).toBe(true);
    expect(h.hub.hub.db.prepare('SELECT 1 AS x FROM devices WHERE device_id = ?').get(device.deviceId)).toBeUndefined();
    // the code is still good
    expect((await enroll(h, device, { code })).status).toBe(200);
  });

  it('rejects a schema-invalid enrollment and a duplicate active device', async () => {
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    const device = newDevice();
    expect((await enroll(h, device, { code, meta: { capabilities: ['teleport'] } })).status).toBe(400);
    expect((await enroll(h, device, { code, meta: { capabilities: ['desktop', 'desktop'] } })).status).toBe(400);
    expect((await enroll(h, device, { code, meta: { displayName: '' } })).status).toBe(400);
    expect((await enroll(h, device, { code, meta: { platform: 'plan9' } })).status).toBe(400);
    expect((await enroll(h, device, { code })).status).toBe(200);
    const code2 = (await createPairingCode(h, owner)).json.pairingCode as string;
    const again = await enroll(h, device, { code: code2 });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('conflict');
    // a conflict does not burn the code
    expect((await enroll(h, newDevice(), { code: code2 })).status).toBe(200);
  });

  it('enrolls two devices independently', async () => {
    const a = await enrolled(h, owner);
    const b = await enrolled(h, owner, newDevice());
    expect(a.device.deviceId).not.toBe(b.device.deviceId);
    expect((await self(a.token)).json.deviceId).toBe(a.device.deviceId);
    expect((await self(b.token)).json.deviceId).toBe(b.device.deviceId);
    // a signature from A cannot mint a token for B
    const challenge = await h.call('POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId: b.device.deviceId } });
    const signature = a.device.sign(deviceAuthMessage({ hubInstanceId: h.hub.hub.hubInstanceId, nonce: challenge.json.nonce, deviceId: b.device.deviceId }));
    expect((await h.call('POST', '/auth/device/token', { noOrigin: true, body: { deviceId: b.device.deviceId, nonce: challenge.json.nonce, signature } })).status).toBe(401);
  });

  it('keeps challenges single-use, short-lived and non-enumerating', async () => {
    const { device } = await enrolled(h, owner);
    const sign = (nonce: string) => device.sign(deviceAuthMessage({ hubInstanceId: h.hub.hub.hubInstanceId, nonce, deviceId: device.deviceId }));
    const c1 = await h.call('POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId: device.deviceId } });
    const body = { deviceId: device.deviceId, nonce: c1.json.nonce, signature: sign(c1.json.nonce) };
    expect((await h.call('POST', '/auth/device/token', { noOrigin: true, body })).status).toBe(200);
    expect((await h.call('POST', '/auth/device/token', { noOrigin: true, body })).status).toBe(401); // replay

    const c2 = await h.call('POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId: device.deviceId } });
    expect(c2.json.expiresAt).toBe(new Date(h.clock.t + DEVICE_CHALLENGE_TTL_MS).toISOString());
    h.clock.t += DEVICE_CHALLENGE_TTL_MS + 1;
    expect((await h.call('POST', '/auth/device/token', { noOrigin: true, body: { deviceId: device.deviceId, nonce: c2.json.nonce, signature: sign(c2.json.nonce) } })).status).toBe(401);

    // an unknown device gets a challenge too (no enumeration) but can never redeem it
    const ghost = newDevice();
    const c3 = await h.call('POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId: ghost.deviceId } });
    expect(c3.status).toBe(200);
    const ghostSig = ghost.sign(deviceAuthMessage({ hubInstanceId: h.hub.hub.hubInstanceId, nonce: c3.json.nonce, deviceId: ghost.deviceId }));
    expect((await h.call('POST', '/auth/device/token', { noOrigin: true, body: { deviceId: ghost.deviceId, nonce: c3.json.nonce, signature: ghostSig } })).status).toBe(401);
    h.clock.t += 60_000; // let the failure throttle lapse for later specs
  });

  it('expires a device token after 15 minutes', async () => {
    const { token } = await enrolled(h, owner);
    expect((await self(token)).status).toBe(200);
    h.clock.t += DEVICE_TOKEN_TTL_MS + 1;
    expect((await self(token)).status).toBe(401);
  });

  it('never lets a device credential act as the owner, or the owner as a device', async () => {
    const { token } = await enrolled(h, owner);
    for (const [method, path] of [['GET', '/devices'], ['GET', '/sessions'], ['POST', '/pairing-codes']] as const) {
      const res = await h.call(method, path, { bearer: token, ...(method === 'POST' ? { body: {} } : {}) });
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe('forbidden');
    }
    // owner cookie
    expect((await h.call('GET', '/devices/self', { cookie: owner.cookie })).status).toBe(403);
    expect((await h.call('POST', '/devices/self/unenroll', { cookie: owner.cookie, csrf: owner.csrf })).status).toBe(403);
    // owner bearer
    const { device, token: t2 } = await enrolled(h, owner);
    const bearer = await h.call('POST', '/auth/owner/bearer', { bearer: t2, body: { password: 'a very long password' } });
    expect(bearer.status).toBe(200);
    expect((await h.call('GET', '/devices/self', { bearer: bearer.json.accessToken })).status).toBe(403);
    // nothing, junk, and a malformed token
    expect((await h.call('GET', '/devices/self', {})).status).toBe(401);
    expect((await h.call('GET', '/devices/self', { bearer: 'xyz' })).status).toBe(401);
    expect((await h.call('GET', '/devices/self', { bearer: `ddt_${'A'.repeat(43)}` })).status).toBe(401);
    expect(device.deviceId).toBeTruthy();
  });

  it('exchanges the password for an owner bearer session bound to the device', async () => {
    const { device, token } = await enrolled(h, owner);
    const wrong = await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: 'nope nope nope' } });
    expect(wrong.status).toBe(403);
    expect((await h.call('POST', '/auth/owner/bearer', { body: { password: 'a very long password' } })).status).toBe(401); // no device credential
    const ok = await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: 'a very long password' } });
    expect(ok.status).toBe(200);
    expect(ok.json.accessToken).toMatch(/^dob_[A-Za-z0-9_-]{43}$/);
    expect(ok.json.owner.displayName).toBe('Ada');
    expect(audits('owner.sign-in').some((r) => (r.detail as { via?: string }).via === 'device')).toBe(true);

    // works on owner routes without Origin or CSRF, and is bound to this device
    const sessions = await h.call('GET', '/sessions', { bearer: ok.json.accessToken });
    expect(sessions.status).toBe(200);
    expect(sessions.json.find((s: { current: boolean }) => s.current)).toMatchObject({ kind: 'bearer', deviceId: device.deviceId });
    const list = await h.call('GET', '/devices', { bearer: ok.json.accessToken });
    expect(list.status).toBe(200);
    expect(list.json.filter((d: { current: boolean }) => d.current).map((d: { deviceId: string }) => d.deviceId)).toEqual([device.deviceId]);
  });

  it('renames a device (owner) and updates itself (device)', async () => {
    const { device, token } = await enrolled(h, owner);
    const renamed = await h.call('PATCH', `/devices/${device.deviceId}`, { ...ownerAuth(), body: { displayName: '  Desk  ' } });
    expect(renamed.status).toBe(200);
    expect(renamed.json.displayName).toBe('Desk');
    expect(audits('device.renamed').length).toBeGreaterThanOrEqual(1);
    expect((await h.call('PATCH', `/devices/${device.deviceId}`, { ...ownerAuth(), body: { displayName: '   ' } })).status).toBe(400);
    expect((await h.call('PATCH', `/devices/${device.deviceId}`, { ...ownerAuth(), body: { displayName: 'x'.repeat(65) } })).status).toBe(400);
    expect((await h.call('PATCH', `/devices/${newDevice().deviceId}`, { ...ownerAuth(), body: { displayName: 'Ghost' } })).status).toBe(404);
    expect((await h.call('PATCH', `/devices/${device.deviceId}`, { cookie: owner.cookie, body: { displayName: 'No CSRF' } })).status).toBe(403);

    const upd = await h.call('PATCH', '/devices/self', { bearer: token, body: { appVersion: '2.0.0', protocolVersion: 2, capabilities: ['desktop', 'hub-host'] } });
    expect(upd.status).toBe(200);
    expect(upd.json).toMatchObject({ displayName: 'Desk', appVersion: '2.0.0', protocolVersion: 2, capabilities: ['desktop', 'hub-host'] });
    expect((await h.call('PATCH', '/devices/self', { bearer: token, body: { capabilities: ['nope'] } })).status).toBe(400);
    expect((await h.call('PATCH', '/devices/self', { bearer: token, body: { displayName: 'Mine' } })).json.displayName).toBe('Mine');
  });

  it('requires the owner password to change recovery trust', async () => {
    const { device } = await enrolled(h, owner);
    const path = `/devices/${device.deviceId}/recovery-trust`;
    const wrong = await h.call('PUT', path, { ...ownerAuth(), body: { password: 'wrong password!', trusted: true } });
    expect(wrong.status).toBe(403);
    expect((await h.call('GET', '/devices', { cookie: owner.cookie })).json.find((d: { deviceId: string }) => d.deviceId === device.deviceId).recoveryTrusted).toBe(false);
    const ok = await h.call('PUT', path, { ...ownerAuth(), body: { password: 'a very long password', trusted: true } });
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryTrusted).toBe(true);
    expect(audits('device.recovery-trust-changed')).toHaveLength(1);
    expect((await h.call('PUT', path, { ...ownerAuth(), body: { password: 'a very long password', trusted: false } })).json.recoveryTrusted).toBe(false);
    expect((await h.call('PUT', `/devices/${newDevice().deviceId}/recovery-trust`, { ...ownerAuth(), body: { password: 'a very long password', trusted: true } })).status).toBe(404);
  });

  it('lets a device unenroll itself, ending its credentials and bound sessions', async () => {
    const { device, token } = await enrolled(h, owner);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: 'a very long password' } })).json.accessToken as string;
    const events: string[] = [];
    h.hub.app.hubEvents.on('device-unenrolled', (e) => events.push(`unenrolled:${e.deviceId}`));
    h.hub.app.hubEvents.on('device-registry-changed', (e) => events.push(`changed:${e.change}`));
    const res = await h.call('POST', '/devices/self/unenroll', { bearer: token, body: undefined });
    expect(res.status).toBe(200);
    expect(events).toEqual(expect.arrayContaining([`unenrolled:${device.deviceId}`, 'changed:unenrolled']));
    expect(audits('device.unenrolled')).toHaveLength(1);
    expect((await self(token)).status).toBe(401);
    expect((await h.call('GET', '/sessions', { bearer })).status).toBe(401);
    const entry = (await h.call('GET', '/devices', { cookie: owner.cookie })).json.find((d: { deviceId: string }) => d.deviceId === device.deviceId);
    expect(entry.unenrolledAt).not.toBeNull();
    expect((await deviceToken(h, device).catch(() => ({ token: '' }))).token).toBe('');
  });

  it('re-enrolls an unenrolled device only with a new key', async () => {
    const { device, token } = await enrolled(h, owner);
    await h.call('POST', '/devices/self/unenroll', { bearer: token });
    const same = (await createPairingCode(h, owner)).json.pairingCode as string;
    expect((await enroll(h, device, { code: same })).status).toBe(409); // the old key is dead
    const fresh = { ...newDevice(device.deviceId) };
    const ok = await enroll(h, fresh, { code: same });
    expect(ok.status).toBe(200);
    expect((await deviceToken(h, fresh)).token).toMatch(/^ddt_/);
    expect(h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM device_keys WHERE device_id = ?').get(device.deviceId)).toEqual({ n: 2 });
  });

  it('accepts credential-less enrollment from a non-browser client but not a browser-like one', async () => {
    const code = (await createPairingCode(h, owner)).json.pairingCode as string;
    const device = newDevice();
    // cross-site Origin
    const cross = await enroll(h, device, { code, origin: true, headers: { origin: 'https://evil.example' } });
    expect(cross.status).toBe(403);
    // no Origin but Sec-Fetch-Site present (a browser)
    const meta = await enroll(h, device, { code, headers: { 'sec-fetch-site': 'cross-site' } });
    expect(meta.status).toBe(403);
    // matching Origin passes the guard (same-origin browser page)
    const sameOrigin = await enroll(h, device, { code, origin: true, headers: { 'sec-fetch-site': 'same-origin' } });
    expect(sameOrigin.status).toBe(200);
    // neither (CLI-like)
    const cli = await enroll(h, newDevice(), { code: (await createPairingCode(h, owner)).json.pairingCode });
    expect(cli.status).toBe(200);
  });
});
