import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { createPairingCode, deviceToken, enroll, enrolled, newDevice } from './device-test-helpers.js';
import { listAudit } from '../security/audit.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';

describe('devices confirmation boundary', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });
  // Failure counters are global; reset them so each case starts from a clean throttle.
  beforeEach(() => { h.hub.hub.db.prepare('DELETE FROM throttle').run(); });

  const auth = () => ({ cookie: owner.cookie, csrf: owner.csrf });
  const preview = (id: string) => h.call('POST', `/devices/${id}/revoke/preview`, auth());
  const apply = (id: string, confirmToken: string) => h.call('POST', `/devices/${id}/revoke`, { ...auth(), body: { confirmToken } });
  const alive = async (token: string) => (await h.call('GET', '/devices/self', { bearer: token })).status === 200;

  it('preview alone changes nothing; apply revokes keys, tokens, bound sessions and future auth, and emits events', async () => {
    const { device, token } = await enrolled(h, owner);
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: 'a very long password' } })).json.accessToken as string;
    const events: string[] = [];
    h.hub.app.hubEvents.on('device-revoked', (e) => events.push(`device-revoked:${e.deviceId}`));
    h.hub.app.hubEvents.on('device-registry-changed', (e) => events.push(`changed:${e.change}`));
    h.hub.app.hubEvents.on('session-revoked', (e) => events.push(`session:${e.reason}:${e.deviceId}`));

    const p = await preview(device.deviceId);
    expect(p.status).toBe(200);
    expect(p.json.summary).toMatchObject({ action: 'devices.revoke', deviceId: device.deviceId });
    expect(await alive(token)).toBe(true);
    expect((await h.call('GET', '/sessions', { bearer })).status).toBe(200);
    expect(events).toEqual([]);
    const row = h.hub.hub.db.prepare('SELECT revoked_at FROM devices WHERE device_id = ?').get(device.deviceId) as { revoked_at: string | null };
    expect(row.revoked_at).toBeNull();

    // the app is not applied without a token, with garbage, or by another session
    expect((await h.call('POST', `/devices/${device.deviceId}/revoke`, { ...auth(), body: {} })).status).toBe(400);
    expect((await apply(device.deviceId, 'q'.repeat(43))).status).toBe(403);
    const other = await h.signIn();
    expect((await h.call('POST', `/devices/${device.deviceId}/revoke`, { cookie: other.cookie, csrf: other.csrf, body: { confirmToken: p.json.confirmToken } })).status).toBe(403);
    expect(await alive(token)).toBe(true);

    const p2 = await preview(device.deviceId);
    const done = await apply(device.deviceId, p2.json.confirmToken);
    expect(done.status).toBe(200);
    expect(await alive(token)).toBe(false);
    expect((await h.call('GET', '/sessions', { bearer })).status).toBe(401);
    expect(events).toEqual(expect.arrayContaining([`device-revoked:${device.deviceId}`, 'changed:revoked', `session:device-revoked:${device.deviceId}`]));
    expect(listAudit(h.hub.hub.db, { limit: 20 }).some((r) => r.event === 'device.revoked')).toBe(true);

    // future challenge/token for that device fail
    expect((await deviceToken(h, device).catch(() => ({ token: '' }))).token).toBe('');
    const keys = h.hub.hub.db.prepare('SELECT revoked_at FROM device_keys WHERE device_id = ?').all(device.deviceId) as Array<{ revoked_at: string | null }>;
    expect(keys.every((k) => k.revoked_at !== null)).toBe(true);
    const tokens = h.hub.hub.db.prepare('SELECT revoked_at FROM device_tokens WHERE device_id = ?').all(device.deviceId) as Array<{ revoked_at: string | null }>;
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((t) => t.revoked_at !== null)).toBe(true);

    // replay, and revoking an already revoked device
    expect((await apply(device.deviceId, p2.json.confirmToken)).status).toBe(403);
    expect((await preview(device.deviceId)).status).toBe(404);
  });

  it('rejects an expired confirmation and a digest that changed since the preview', async () => {
    const { device, token } = await enrolled(h, owner);
    const stale = await preview(device.deviceId);
    h.clock.t += CONFIRMATION_TTL_MS + 1;
    expect((await apply(device.deviceId, stale.json.confirmToken)).status).toBe(403);
    expect(await alive(token)).toBe(true);
    expect((await preview(newDevice().deviceId)).status).toBe(404);

    // the key set changed between preview and apply
    const p = await preview(device.deviceId);
    h.hub.hub.db.prepare("INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at, revoked_at) VALUES('extra-key', ?, 'ed25519', x'00', ?, NULL)").run(device.deviceId, new Date(h.clock.t).toISOString());
    expect((await apply(device.deviceId, p.json.confirmToken)).status).toBe(409);
    expect(await alive(token)).toBe(true);
  });

  it('re-enrolls after revoke only with a new key (the old key is dead forever)', async () => {
    const { device } = await enrolled(h, owner);
    const p = await preview(device.deviceId);
    expect((await apply(device.deviceId, p.json.confirmToken)).status).toBe(200);

    const oldKeyCode = (await createPairingCode(h, owner)).json.pairingCode as string;
    const old = await enroll(h, device, { code: oldKeyCode });
    expect(old.status).toBe(409);
    expect((await deviceToken(h, device).catch(() => ({ token: '' }))).token).toBe('');

    const fresh = newDevice(device.deviceId);
    const ok = await enroll(h, fresh, { code: oldKeyCode }); // the rejected attempt did not burn the code
    expect(ok.status).toBe(200);
    const { token } = await deviceToken(h, fresh);
    expect(await alive(token)).toBe(true);
    const row = h.hub.hub.db.prepare('SELECT revoked_at, unenrolled_at FROM devices WHERE device_id = ?').get(device.deviceId) as { revoked_at: string | null; unenrolled_at: string | null };
    expect(row).toEqual({ revoked_at: null, unenrolled_at: null });
    // the old key still cannot authenticate
    expect(h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM device_keys WHERE device_id = ? AND revoked_at IS NULL').get(device.deviceId)).toEqual({ n: 1 });
  });
});
