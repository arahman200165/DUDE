import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { STEP_UP_WINDOW_MS } from '../auth/sessions.js';
import { listAudit } from '../security/audit.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { deviceToken, enroll, enrolled, newDevice } from './device-test-helpers.js';
import type { SimDevice } from './device-test-helpers.js';

/** Re-attach pairing codes (PD-072): a restored Hub's `needs_re_pair` desktop rows take a new key only through a code bound to them. */
describe('re-attach pairing codes', () => {
  let h: AuthHub;
  let owner: Signed;
  const db = () => h.hub.hub.db;
  beforeAll(async () => { h = await startAuthHub(); });
  afterAll(async () => { await h.close(); });
  beforeEach(async () => { db().prepare('DELETE FROM throttle').run(); owner = await h.signIn(); });

  const audits = (event: string) => listAudit(db(), { limit: 500 }).filter((r) => r.event === event);
  const ownerAuth = () => ({ cookie: owner.cookie, csrf: owner.csrf });
  const reattachCode = (deviceId: string) => h.call('POST', '/pairing-codes', { ...ownerAuth(), body: { reattachDeviceId: deviceId } });
  const ordinaryCode = async (): Promise<string> => (await h.call('POST', '/pairing-codes', { ...ownerAuth(), body: {} })).json.pairingCode as string;
  const consumedCount = (): number => (db().prepare('SELECT COUNT(*) AS n FROM pairing_codes WHERE consumed_at IS NOT NULL').get() as { n: number }).n;

  /** What a Hub restore does to a desktop row: the row stays active, flagged, with every key revoked. */
  const markNeedsRePair = (deviceId: string): void => {
    db().prepare('UPDATE devices SET needs_re_pair = 1 WHERE device_id = ?').run(deviceId);
    db().prepare('UPDATE device_keys SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').run(new Date(h.clock.t).toISOString(), deviceId);
  };
  const awaiting = async (): Promise<SimDevice> => {
    const { device } = await enrolled(h, owner);
    markNeedsRePair(device.deviceId);
    return device;
  };
  const keys = (deviceId: string) => db().prepare('SELECT revoked_at FROM device_keys WHERE device_id = ? ORDER BY created_at, key_id').all(deviceId) as Array<{ revoked_at: string | null }>;
  const row = (deviceId: string) => db().prepare('SELECT needs_re_pair, revoked_at, unenrolled_at, last_seen_at, recovery_trusted, display_name FROM devices WHERE device_id = ?').get(deviceId) as {
    needs_re_pair: number; revoked_at: string | null; unenrolled_at: string | null; last_seen_at: string | null; recovery_trusted: number; display_name: string;
  };

  describe('creating a code', () => {
    it('binds a code to a device that awaits re-pair and reports it, without putting the id in the audit detail', async () => {
      const device = await awaiting();
      const before = audits('pairing.created').length;
      const res = await reattachCode(device.deviceId);
      expect(res.status).toBe(200);
      expect(res.json.reattachDeviceId).toBe(device.deviceId);
      expect(res.json.pairingCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect((db().prepare('SELECT reattach_device_id FROM pairing_codes WHERE reattach_device_id IS NOT NULL').all() as unknown[])).toEqual([{ reattach_device_id: device.deviceId }]);
      const created = audits('pairing.created');
      expect(created).toHaveLength(before + 1);
      const detail = created[0]!.detail as Record<string, unknown>;
      expect(detail.reattach).toBe(true);
      expect(JSON.stringify(detail)).not.toContain(device.deviceId);
    });

    it('reports null for an ordinary code and records no binding', async () => {
      const res = await h.call('POST', '/pairing-codes', { ...ownerAuth(), body: {} });
      expect(res.status).toBe(200);
      expect(res.json.reattachDeviceId).toBeNull();
      expect((audits('pairing.created')[0]!.detail as Record<string, unknown>).reattach).toBeUndefined();
    });

    it('answers 404 for an unknown device and for a browser row, 409 for a healthy, revoked or unenrolled row', async () => {
      expect((await reattachCode('00000000-0000-4000-8000-000000000001')).status).toBe(404);
      const browserId = '00000000-0000-4000-8000-0000000000b1';
      db().prepare("INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, kind, installation_id) VALUES (?, (SELECT environment_id FROM environment LIMIT 1), 'Browser', 'web', '1', '[]', 0, 1, ?, 'browser', 'inst-reattach')")
        .run(browserId, new Date(h.clock.t).toISOString());
      db().prepare('UPDATE devices SET needs_re_pair = 1 WHERE device_id = ?').run(browserId);
      expect((await reattachCode(browserId)).status).toBe(404);

      const { device: healthy } = await enrolled(h, owner);
      const conflict = await reattachCode(healthy.deviceId);
      expect(conflict.status).toBe(409);
      expect(conflict.json.error.code).toBe('conflict');

      const revoked = await awaiting();
      db().prepare('UPDATE devices SET revoked_at = ? WHERE device_id = ?').run(new Date(h.clock.t).toISOString(), revoked.deviceId);
      expect((await reattachCode(revoked.deviceId)).status).toBe(409);
      const unenrolled = await awaiting();
      db().prepare('UPDATE devices SET unenrolled_at = ? WHERE device_id = ?').run(new Date(h.clock.t).toISOString(), unenrolled.deviceId);
      expect((await reattachCode(unenrolled.deviceId)).status).toBe(409);
    });

    it('rejects a malformed id and keeps the step-up requirement', async () => {
      expect((await reattachCode('not-a-uuid')).status).toBe(400);
      const device = await awaiting();
      expect((await reattachCode(device.deviceId)).status).toBe(200);
      h.clock.t += STEP_UP_WINDOW_MS + 1;
      const res = await reattachCode(device.deviceId);
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe('step-up-required');
    });

    it('is owner-only: no credential, a device token or a malformed body get no code', async () => {
      const { token, device } = await enrolled(h, owner);
      markNeedsRePair(device.deviceId);
      expect((await h.call('POST', '/pairing-codes', { body: { reattachDeviceId: device.deviceId } })).status).toBe(401);
      expect((await h.call('POST', '/pairing-codes', { bearer: token, noOrigin: true, body: { reattachDeviceId: device.deviceId } })).status).toBe(403);
      expect((await h.call('POST', '/pairing-codes', { ...ownerAuth(), body: { reattachDeviceId: device.deviceId, extra: 1 } })).status).toBe(400);
    });
  });

  describe('enrolling with a code', () => {
    it('attaches a NEW key to the old row with a matching bound code: flag cleared, one new active key, old keys still revoked', async () => {
      const old = await awaiting();
      expect(keys(old.deviceId)).toHaveLength(1);
      const code = (await reattachCode(old.deviceId)).json.pairingCode as string;
      // The old key is dead until the device is re-paired.
      expect((await deviceToken(h, old).catch(() => ({ token: '' }))).token).toBe('');

      const fresh = newDevice(old.deviceId);
      const res = await enroll(h, fresh, { code, meta: { displayName: 'Rebuilt laptop', appVersion: '2.0.0' } });
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ deviceId: old.deviceId, hubInstanceId: h.hub.hub.hubInstanceId, keyId: expect.any(String) });

      const after = row(old.deviceId);
      expect(after).toMatchObject({ needs_re_pair: 0, revoked_at: null, unenrolled_at: null, last_seen_at: null, recovery_trusted: 0, display_name: 'Rebuilt laptop' });
      const all = keys(old.deviceId);
      expect(all).toHaveLength(2);
      expect(all.filter((k) => k.revoked_at === null)).toHaveLength(1);
      expect(all.filter((k) => k.revoked_at !== null)).toHaveLength(1);
      expect((db().prepare('SELECT key_id FROM device_keys WHERE device_id = ? AND revoked_at IS NULL').get(old.deviceId) as { key_id: string }).key_id).toBe(res.json.keyId);
      expect((await deviceToken(h, fresh)).token).toMatch(/^ddt_/);
      expect((await deviceToken(h, old).catch(() => ({ token: '' }))).token).toBe('');

      const enrollAudit = audits('device.enrolled')[0]!;
      expect((enrollAudit.detail as Record<string, unknown>).reattach).toBe(true);
      // The code is single-use.
      expect((await enroll(h, newDevice(old.deviceId), { code })).status).toBe(401);
    });

    it('keeps an ordinary code over a needs_re_pair row an active-conflict, without burning the code', async () => {
      const old = await awaiting();
      const code = await ordinaryCode();
      const res = await enroll(h, newDevice(old.deviceId), { code });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe('conflict');
      expect(row(old.deviceId).needs_re_pair).toBe(1);
      expect((await enroll(h, newDevice(), { code })).status).toBe(200);
    });

    it('rejects a bound code presented by a different deviceId without consuming it', async () => {
      const old = await awaiting();
      const other = await awaiting();
      const code = (await reattachCode(old.deviceId)).json.pairingCode as string;
      const consumed = consumedCount();
      const stranger = await enroll(h, newDevice(), { code });
      expect(stranger.status).toBe(401);
      expect(consumedCount()).toBe(consumed);
      // Another awaiting device cannot use it either.
      expect((await enroll(h, newDevice(other.deviceId), { code })).status).toBe(401);
      expect(row(other.deviceId).needs_re_pair).toBe(1);
      expect(consumedCount()).toBe(consumed);
      // The code is still live for its own device.
      expect((await enroll(h, newDevice(old.deviceId), { code })).status).toBe(200);
      expect(consumedCount()).toBe(consumed + 1);
    });

    it('rejects a bound code once its row was re-paired or revoked, without consuming it', async () => {
      const old = await awaiting();
      const first = (await reattachCode(old.deviceId)).json.pairingCode as string;
      const second = (await reattachCode(old.deviceId)).json.pairingCode as string;
      expect((await enroll(h, newDevice(old.deviceId), { code: first })).status).toBe(200);
      const consumed = consumedCount();
      expect((await enroll(h, newDevice(old.deviceId), { code: second })).status).toBe(401);
      expect(consumedCount()).toBe(consumed);

      const revoked = await awaiting();
      const code = (await reattachCode(revoked.deviceId)).json.pairingCode as string;
      db().prepare('UPDATE devices SET revoked_at = ? WHERE device_id = ?').run(new Date(h.clock.t).toISOString(), revoked.deviceId);
      const before = consumedCount();
      expect((await enroll(h, newDevice(revoked.deviceId), { code })).status).toBe(401);
      expect(consumedCount()).toBe(before);
      expect(row(revoked.deviceId).revoked_at).not.toBeNull();
    });

    it('still refuses a revoked key on a re-attach (key reuse), keeping the code', async () => {
      const old = await awaiting();
      const code = (await reattachCode(old.deviceId)).json.pairingCode as string;
      const consumed = consumedCount();
      const res = await enroll(h, old, { code });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe('conflict');
      expect(consumedCount()).toBe(consumed);
      expect(row(old.deviceId).needs_re_pair).toBe(1);
      expect((await enroll(h, newDevice(old.deviceId), { code })).status).toBe(200);
    });

    it('leaves the brand-new device and revoked re-enroll paths as before', async () => {
      const fresh = newDevice();
      const created = await enroll(h, fresh, { code: await ordinaryCode() });
      expect(created.status).toBe(200);
      expect((audits('device.enrolled')[0]!.detail as Record<string, unknown>).reattach).toBeUndefined();

      // Revoked row (even one still flagged) re-enrolls with an ordinary code and a new key, and clears the flag.
      const old = await awaiting();
      db().prepare('UPDATE devices SET revoked_at = ? WHERE device_id = ?').run(new Date(h.clock.t).toISOString(), old.deviceId);
      expect((await enroll(h, old, { code: await ordinaryCode() })).status).toBe(409);
      const again = newDevice(old.deviceId);
      expect((await enroll(h, again, { code: await ordinaryCode() })).status).toBe(200);
      expect(row(old.deviceId)).toMatchObject({ needs_re_pair: 0, revoked_at: null });
      expect((await deviceToken(h, again)).token).toMatch(/^ddt_/);
    });
  });
});
