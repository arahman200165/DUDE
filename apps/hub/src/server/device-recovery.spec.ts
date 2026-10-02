import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_CHALLENGE_TTL_MS, ownerRecoveryMessage } from '@dude/contracts/hub';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled, newDevice } from './device-test-helpers.js';
import type { SimDevice } from './device-test-helpers.js';
import { listAudit } from '../security/audit.js';
import { verifyPassword } from '../auth/password.js';
import { getStoredPassword } from '../auth/owner.js';

const NEW_PASSWORD = 'a brand new password';

describe('device-assisted owner recovery (PD-029)', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });
  beforeEach(() => { h.hub.hub.db.prepare('DELETE FROM throttle').run(); });

  const audits = (event: string) => listAudit(h.hub.hub.db, { limit: 500 }).filter((r) => r.event === event);
  const ownerAuth = () => ({ cookie: owner.cookie, csrf: owner.csrf });

  async function trustedDevice(trusted = true, meta?: Record<string, unknown>): Promise<{ device: SimDevice; token: string }> {
    const { device, token } = await enrolled(h, owner, newDevice(), meta);
    if (trusted) {
      const res = await h.call('PUT', `/devices/${device.deviceId}/recovery-trust`, { ...ownerAuth(), body: { password: currentPassword, trusted: true } });
      expect(res.status).toBe(200);
    }
    return { device, token };
  }

  async function challenge(token: string) {
    return h.call('POST', '/auth/device-recovery/challenge', { bearer: token });
  }
  const signFor = (device: SimDevice, nonce: string, hubInstanceId = h.hub.hub.hubInstanceId) =>
    device.sign(ownerRecoveryMessage({ hubInstanceId, nonce, deviceId: device.deviceId }));

  async function recover(token: string, body: { nonce: string; signature: string; newPassword?: string }) {
    return h.call('POST', '/auth/device-recovery', { bearer: token, body: { newPassword: NEW_PASSWORD, ...body } });
  }

  async function fullRecover(device: SimDevice, token: string, newPassword = NEW_PASSWORD) {
    const c = await challenge(token);
    expect(c.status).toBe(200);
    const nonce = c.json.nonce as string;
    return recover(token, { nonce, signature: signFor(device, nonce), newPassword });
  }

  // Each success changes the password, so every case that needs the owner signs in with whatever is current.
  let currentPassword = PASSWORD;
  async function freshOwner(): Promise<void> {
    owner = await h.signIn(currentPassword);
  }

  it('refuses an untrusted device and audits the denial', async () => {
    const { token } = await trustedDevice(false);
    const before = audits('auth.failure').length;
    const res = await challenge(token);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('forbidden');
    const failures = audits('auth.failure');
    expect(failures.length).toBe(before + 1);
    expect(failures[0]!.detail).toMatchObject({ kind: 'device-recovery' });
    // the recover endpoint refuses too
    const rec = await recover(token, { nonce: 'x', signature: 'A'.repeat(86) });
    expect(rec.status).toBe(403);
    expect(await h.call('POST', '/auth/device-recovery/challenge', {})).toMatchObject({ status: 401 });
  });

  it('refuses a recovery-trusted device that is not a desktop platform', async () => {
    const { token } = await trustedDevice(true, { platform: 'android' });
    expect((await challenge(token)).status).toBe(403);
  });

  it('lets a trusted device reset the password, revoking every owner session', async () => {
    const { device, token } = await trustedDevice();
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: token, body: { password: currentPassword } })).json.accessToken as string;
    const oldCookie = owner.cookie;
    const codesBefore = h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL').get() as { n: number };
    const events: string[] = [];
    h.hub.app.hubEvents.on('owner-recovered', (e) => events.push(`recovered:${e.deviceId}`));
    h.hub.app.hubEvents.on('session-revoked', (e) => events.push(`revoked:${e.reason}`));

    const c = await challenge(token);
    expect(c.status).toBe(200);
    expect(c.json.expiresAt).toBe(new Date(h.clock.t + DEVICE_CHALLENGE_TTL_MS).toISOString());
    const res = await recover(token, { nonce: c.json.nonce, signature: signFor(device, c.json.nonce) });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });

    expect((await h.call('GET', '/auth/session', { cookie: oldCookie })).status).toBe(401);
    expect((await h.call('GET', '/sessions', { bearer })).status).toBe(401);
    expect((await h.call('POST', '/auth/sign-in', { body: { password: currentPassword } })).status).toBe(401);
    expect((await h.call('POST', '/auth/sign-in', { body: { password: NEW_PASSWORD } })).status).toBe(200);
    currentPassword = NEW_PASSWORD;
    expect(events).toEqual(expect.arrayContaining([`recovered:${device.deviceId}`, 'revoked:device-recovery']));
    const codesAfter = h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL').get() as { n: number };
    expect(codesAfter.n).toBe(codesBefore.n);
    const recorded = audits('owner.recovery-device');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ actorKind: 'device', actorId: device.deviceId, outcome: 'success' });
    expect(JSON.stringify(listAudit(h.hub.hub.db, { limit: 500 }))).not.toContain(NEW_PASSWORD);
    expect(await verifyPassword(NEW_PASSWORD, getStoredPassword(h.hub.hub.db, h.ownerId)!)).toBe(true);
    await freshOwner();
  });

  it('rejects a bad signature, a signature over another hub, and a reused nonce', async () => {
    const { device, token } = await trustedDevice();
    const stranger = newDevice();

    const c1 = await challenge(token);
    expect((await recover(token, { nonce: c1.json.nonce, signature: signFor(stranger, c1.json.nonce) })).status).toBe(401);
    // the nonce burned on the failed attempt
    expect((await recover(token, { nonce: c1.json.nonce, signature: signFor(device, c1.json.nonce) })).status).toBe(401);

    const c2 = await challenge(token);
    expect((await recover(token, { nonce: c2.json.nonce, signature: signFor(device, c2.json.nonce, 'other-hub') })).status).toBe(401);

    const c3 = await challenge(token);
    expect((await recover(token, { nonce: c3.json.nonce, signature: signFor(device, c3.json.nonce), newPassword: 'short' })).status).toBe(400); // policy, nonce survives
    expect((await recover(token, { nonce: c3.json.nonce, signature: signFor(device, c3.json.nonce), newPassword: 'another long password' })).status).toBe(200);
    currentPassword = 'another long password';
    expect((await recover(token, { nonce: c3.json.nonce, signature: signFor(device, c3.json.nonce) })).status).toBe(401); // reused
    await freshOwner();
  });

  it('rejects an expired nonce and a nonce issued to another device', async () => {
    const a = await trustedDevice();
    const b = await trustedDevice();
    const c = await challenge(a.token);
    h.clock.t += DEVICE_CHALLENGE_TTL_MS + 1;
    expect((await recover(a.token, { nonce: c.json.nonce, signature: signFor(a.device, c.json.nonce) })).status).toBe(401);
    // device tokens live 15 minutes, so the same token still works
    const c2 = await challenge(a.token);
    expect((await recover(b.token, { nonce: c2.json.nonce, signature: signFor(b.device, c2.json.nonce) })).status).toBe(401);
  });

  it('locks the device and the IP after repeated failures', async () => {
    const { device, token } = await trustedDevice();
    for (let i = 0; i < 6; i++) {
      const c = await challenge(token);
      const res = await recover(token, { nonce: c.json.nonce, signature: signFor(newDevice(), c.json.nonce) });
      expect(res.status).toBe(401);
    }
    const c = await challenge(token);
    const locked = await recover(token, { nonce: c.json.nonce, signature: signFor(device, c.json.nonce) });
    expect(locked.status).toBe(423);
    expect(locked.raw.headers['retry-after']).toBeDefined();
    h.hub.hub.db.prepare('DELETE FROM throttle').run();
  });

  it('rejects a revoked device and a device that lost its trust', async () => {
    const { device, token } = await trustedDevice();
    const c = await challenge(token);
    const preview = await h.call('POST', `/devices/${device.deviceId}/revoke/preview`, ownerAuth());
    expect((await h.call('POST', `/devices/${device.deviceId}/revoke`, { ...ownerAuth(), body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);
    expect((await recover(token, { nonce: c.json.nonce, signature: signFor(device, c.json.nonce) })).status).toBe(401);

    const other = await trustedDevice();
    const c2 = await challenge(other.token);
    await h.call('PUT', `/devices/${other.device.deviceId}/recovery-trust`, { ...ownerAuth(), body: { password: currentPassword, trusted: false } });
    expect((await recover(other.token, { nonce: c2.json.nonce, signature: signFor(other.device, c2.json.nonce) })).status).toBe(403);
  });

  it('does not let an owner credential act as the device', async () => {
    expect((await h.call('POST', '/auth/device-recovery/challenge', { cookie: owner.cookie, csrf: owner.csrf })).status).toBe(403);
    await fullRecoverUnused();
  });

  async function fullRecoverUnused(): Promise<void> {
    const { device, token } = await trustedDevice();
    expect((await fullRecover(device, token, 'yet another long password')).status).toBe(200);
    currentPassword = 'yet another long password';
    await freshOwner();
  }
});
