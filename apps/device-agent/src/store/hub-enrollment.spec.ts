import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeDeviceRecord } from '@dude/persistence';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { readDeviceRecord } from './identity.js';
import { applyReset, previewReset } from './reset.js';
import {
  clearEnrollment, getEnrollment, markRevoked, promoteNextPin, publicEnrollment, saveEnrollment, setNextPin, touchContact,
} from './repos/hub-enrollment.repo.js';
import { createRpcServer } from '../rpc/server.js';

afterEach(cleanupTemp);
const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
const T0 = new Date('2026-02-01T00:00:00.000Z');
const NEW = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 1, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1, 2, 3]), wrappedPrivateKey: new Uint8Array([9, 9, 9]), enrolledAt: T0.toISOString(),
};

describe('hub enrollment', () => {
  it('is absent by default and the device record is standalone', () => {
    const store = openReady(tempDir());
    expect(getEnrollment(store.db)).toBeNull();
    expect(publicEnrollment(store.db)).toBeNull();
    expect(store.device.enrollmentState).toBe('standalone');
    expect(store.device.enrollment).toBeUndefined();
  });

  it('derives an enrolled then revoked device record that passes the strict decoder', () => {
    const store = openReady(tempDir());
    saveEnrollment(store.db, NEW, T0);
    let record = readDeviceRecord(store.db, store.device.capabilities);
    expect(record.enrollmentState).toBe('enrolled');
    expect(record.enrollment).toEqual({ environmentId: 'env-hub', hubInstanceId: 'hub-1', hubUrl: NEW.hubUrl, enrolledAt: NEW.enrolledAt });
    expect(decodeDeviceRecord(record)).toEqual(record);
    expect(markRevoked(store.db, new Date('2026-02-02T00:00:00.000Z'))).toBe(true);
    expect(markRevoked(store.db, T0)).toBe(false);
    record = readDeviceRecord(store.db, store.device.capabilities);
    expect(record.enrollmentState).toBe('revoked');
    expect(decodeDeviceRecord(record)).toEqual(record);
    expect(publicEnrollment(store.db)?.revokedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('never exposes key material through the public projection', () => {
    const store = openReady(tempDir());
    saveEnrollment(store.db, NEW, T0);
    const pub = publicEnrollment(store.db) as unknown as Record<string, unknown>;
    expect(Object.keys(pub)).not.toEqual(expect.arrayContaining(['wrappedPrivateKey']));
    expect(JSON.stringify(pub)).not.toMatch(/wrapped|privateKey|publicKey|PEM/i);
    expect(getEnrollment(store.db)?.wrappedPrivateKey).toEqual(new Uint8Array([9, 9, 9]));
  });

  it('stages, promotes and touches pins', () => {
    const store = openReady(tempDir());
    saveEnrollment(store.db, NEW, T0);
    expect(promoteNextPin(store.db, T0)).toBe(false);
    expect(setNextPin(store.db, 'spki-b', 'PEM-B', T0)).toBe(true);
    expect(publicEnrollment(store.db)?.spkiNext).toBe('spki-b');
    expect(promoteNextPin(store.db, T0)).toBe(true);
    expect(getEnrollment(store.db)).toMatchObject({ spkiActive: 'spki-b', certActivePem: 'PEM-B', spkiNext: null, certNextPem: null });
    expect(touchContact(store.db, new Date('2026-02-03T00:00:00.000Z'))).toBe(true);
    expect(publicEnrollment(store.db)?.lastContactAt).toBe('2026-02-03T00:00:00.000Z');
    expect(clearEnrollment(store.db)).toBe(true);
    expect(touchContact(store.db, T0)).toBe(false);
  });

  it('survives a reopen', () => {
    const dir = tempDir();
    const a = openReady(dir);
    saveEnrollment(a.db, NEW, T0);
    a.close();
    expect(publicEnrollment(openReady(dir).db)?.hubInstanceId).toBe('hub-1');
  });

  it('a detected clone drops the enrollment so it must re-pair', () => {
    const dir = tempDir();
    const a = openReady(dir);
    saveEnrollment(a.db, NEW, T0);
    a.close();
    const b = openReady(dir, { machineGuid: 'guid-B' });
    expect(b.device.clonedFrom).toBeDefined();
    expect(getEnrollment(b.db)).toBeNull();
    expect(b.device.enrollmentState).toBe('standalone');
  });

  it('Clear data keeps the enrollment; Reset this device drops it', () => {
    const store = openReady(tempDir());
    saveEnrollment(store.db, NEW, T0);
    expect(previewReset(store.db, 'clear-data').counts.hub_enrollment).toBeUndefined();
    expect(applyReset(store.db, 'clear-data', previewReset(store.db, 'clear-data').digest, deps)).toEqual({ ok: true });
    expect(publicEnrollment(store.db)).not.toBeNull();
    const preview = previewReset(store.db, 'reset-device');
    expect(preview.counts.hub_enrollment).toBe(1);
    expect(applyReset(store.db, 'reset-device', preview.digest, deps)).toEqual({ ok: true });
    expect(publicEnrollment(store.db)).toBeNull();
  });

  it('serves hub.enrollment over RPC without key material, and in hydrate', async () => {
    const store = openReady(tempDir());
    const server = createRpcServer(store, deps);
    const none = await server.handle({ id: 1, method: 'hub.enrollment', params: {} });
    expect(none).toEqual({ id: 1, ok: true, result: null });
    saveEnrollment(store.db, NEW, T0);
    const res = await server.handle({ id: 2, method: 'hub.enrollment', params: {} });
    expect(res.ok && res.result).toMatchObject({ state: 'enrolled', hubUrl: NEW.hubUrl, spkiActive: 'spki-a' });
    expect(JSON.stringify(res)).not.toMatch(/wrapped|PEM-A|publicKey/);
    const boot = await server.handle({ id: 3, method: 'store.hydrate', params: {} });
    expect(boot.ok && (boot.result as { device: { enrollmentState: string; enrollment: unknown } }).device).toMatchObject({ enrollmentState: 'enrolled', enrollment: { hubUrl: NEW.hubUrl } });
  });
});
