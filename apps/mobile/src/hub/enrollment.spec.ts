import { describe, expect, it, vi } from 'vitest';
import type { HubRequest, HubResponse } from '@dude/api-client';
import { MobileEnrollmentService } from './enrollment';
import { MobileDeviceSession } from './session';
import { MobileHubRealtime } from './realtime';
import type { NativeSocketEvent, MobileRealtimePort } from './native';
import { MobileHubError, type MobileEnrollmentAttempt, type MobileHubEnrollment, type MobileHubPersistence, type MobileSigner } from './types';

const hub = '11111111-1111-4111-8111-111111111111';
const device = '22222222-2222-4222-8222-222222222222';
const environment = '33333333-3333-4333-8333-333333333333';
const install = '44444444-4444-4444-8444-444444444444';
const pin = 'A'.repeat(43);
const now = Date.parse('2026-10-04T12:00:00.000Z');
const pairingString = `dude-pair:v1:hub.example:47600:01234567:${pin}`;
const ok = (body: unknown): HubResponse => ({ status: 200, headers: {}, body });
const rejected = (): HubResponse => ({ status: 401, headers: {}, body: { error: { code: 'unauthorized', message: 'The device could not be authenticated.' } } });
const enrollment: MobileHubEnrollment = { hubUrl: 'https://hub.example:47600', pins: [pin], deviceId: device, environmentId: environment, hubInstanceId: hub, authorityEpoch: 1, keyRef: 'opaque-1', publicKey: 'B'.repeat(43), keyId: 'key-id', registeredAt: new Date(now).toISOString(), spkiActive: pin, spkiNext: null, proxySpkis: [] };
function fixture() {
  let saved: MobileHubEnrollment | null = null;
  let pending: MobileEnrollmentAttempt | null = null;
  let keyCount = 0;
  const deleted: string[] = [];
  const proofs: { keyRef: string; device: string; purpose: string }[] = [];
  const requests: HubRequest[] = [];
  const steps: string[] = [];
  const hello: Record<string, unknown> = { service: 'dude-hub', protocolVersion: 2, minClientProtocol: 1, hubVersion: 'test', hubInstanceId: hub, environmentId: environment, bootstrapped: true, tls: { spkiSha256: pin, nextSpkiSha256: null }, authorityEpoch: 1, authorityState: 'active', syncCategoryFiltering: true };
  const persistence: MobileHubPersistence = {
    readEnrollment: async () => saved, readPendingAttempt: async () => pending,
    savePendingAttempt: async attempt => { steps.push('pending'); pending = structuredClone(attempt); },
    commitEnrollment: async value => { steps.push('commit'); saved = structuredClone(value); pending = null; },
    saveEnrollment: async value => { steps.push('save'); saved = structuredClone(value); },
    clearPendingAttempt: async () => { pending = null; },
  };
  const signer: MobileSigner = {
    prepareKey: async () => `opaque-${++keyCount}`, publicKey: async () => 'B'.repeat(43),
    signEnrollment: async (keyRef, _hub, _code, id) => { proofs.push({ keyRef, device: id, purpose: 'enroll' }); return 'C'.repeat(86); },
    signChallenge: async (keyRef, _hub, _nonce, id) => { proofs.push({ keyRef, device: id, purpose: 'challenge' }); return 'C'.repeat(86); },
    deleteKey: async ref => { deleted.push(ref); }, randomBytes: async () => 'D'.repeat(43),
  };
  let tokenCount = 0;
  let override: ((request: HubRequest) => Promise<HubResponse | undefined> | HubResponse | undefined) | undefined;
  const deps = {
    signer, persistence, deviceId: device, installId: install, appVersion: '0.0.0', now: () => now, certificatePin: async () => pin,
    transport: () => ({ request: async (request: HubRequest): Promise<HubResponse> => {
      requests.push(request);
      const custom = await override?.(request);
      if (custom) return custom;
      if (request.path.endsWith('/hello')) return ok(hello);
      if (request.path.endsWith('/tls/certificates')) return ok({ active: { spkiSha256: pin, certPem: 'public-certificate' }, next: null, source: 'self-signed', caCertPem: null, leafNotAfter: '2030-01-01' });
      if (request.path.endsWith('/devices/enroll')) { steps.push('enroll'); return ok({ deviceId: device, environmentId: environment, hubInstanceId: hub, keyId: 'key-id', registeredAt: new Date(now).toISOString(), hubRevision: 0 }); }
      if (request.path.endsWith('/device/challenge')) return ok({ nonce: 'N'.repeat(43), expiresAt: new Date(now + 60_000).toISOString() });
      if (request.path.endsWith('/device/token')) return ok({ accessToken: `ddt_${String.fromCharCode(65 + tokenCount++).repeat(43)}`, expiresAt: new Date(now + 900_000).toISOString(), authorityEpoch: 1 });
      if (request.path.endsWith('/devices/self')) return ok({ deviceId: device, kind: 'desktop', displayName: 'Phone', platform: 'android', appVersion: '0.0.0', protocolVersion: 2, capabilities: ['secure-storage'], registeredAt: new Date(now).toISOString(), lastSeenAt: null, revokedAt: null, unenrolledAt: null, recoveryTrusted: false, online: false, current: true });
      throw new Error(`Unexpected request ${request.path}`);
    } }),
  };
  return { deps, hello, steps, requests, proofs, deleted, setOverride: (value: typeof override) => { override = value; }, setEnrollment: (value: MobileHubEnrollment) => { saved = value; }, getPending: () => pending, getEnrollment: () => saved, keyCount: () => keyCount };
}
const input = { pairingString, displayName: ' Phone ', acknowledged: true as const };

describe('native mobile enrollment receipts', () => {
  it('persists a public receipt before consuming the code and declares only Android secure storage', async () => {
    const f = fixture();
    await new MobileEnrollmentService(f.deps).connect(input);
    expect(f.steps).toEqual(['pending', 'enroll', 'commit']);
    const request = f.requests.find(req => req.path.endsWith('/devices/enroll'))!;
    expect(request.body).toMatchObject({ device: { deviceId: device, displayName: 'Phone', platform: 'android', capabilities: ['secure-storage'] } });
    expect(f.getEnrollment()?.keyRef).toBe('opaque-1');
  });
  it.each(['syncCategoryFiltering', 'authorityState'])('refuses an older or transferred Hub before key generation or code consumption (%s)', async field => {
    const f = fixture();
    if (field === 'syncCategoryFiltering') delete f.hello[field];
    else f.hello[field] = 'transferred';
    await expect(new MobileEnrollmentService(f.deps).connect(input)).rejects.toBeInstanceOf(MobileHubError);
    expect(f.keyCount()).toBe(0);
    expect(f.requests.some(req => req.path.endsWith('/devices/enroll'))).toBe(false);
  });
  it('retains the receipt after a lost acknowledgment and recovers same-key registration without sending another code', async () => {
    const f = fixture();
    f.setOverride(request => { if (request.path.endsWith('/devices/enroll')) throw new Error('Acknowledgment lost'); });
    const service = new MobileEnrollmentService(f.deps);
    await expect(service.connect(input)).rejects.toThrow('Acknowledgment lost');
    const receipt = f.getPending()!;
    expect(Object.keys(receipt)).not.toEqual(expect.arrayContaining(['pairingCode', 'signature', 'accessToken', 'body']));
    expect(JSON.stringify(receipt)).not.toContain('01234567');
    f.setOverride(undefined);
    const recovered = await new MobileEnrollmentService(f.deps).recoverPending();
    expect(recovered).toMatchObject({ deviceId: device, keyRef: 'opaque-1', keyId: null });
    expect(f.requests.filter(req => req.path.endsWith('/devices/enroll'))).toHaveLength(1);
    expect(f.proofs.at(-1)).toEqual({ keyRef: 'opaque-1', device, purpose: 'challenge' });
    expect(f.deleted).toEqual([]);
  });
  it('preserves an unconfirmed pending registration for retry; explicit discard destroys the native key', async () => {
    const f = fixture();
    f.setOverride(request => { if (request.path.endsWith('/devices/enroll')) throw new Error('Not submitted'); });
    const service = new MobileEnrollmentService(f.deps);
    await expect(service.connect(input)).rejects.toThrow();
    f.setOverride(request => request.path.endsWith('/device/token') ? rejected() : undefined);
    await expect(service.recoverPending()).rejects.toMatchObject({ code: 'pairing-input-required' });
    expect(f.getPending()?.keyRef).toBe('opaque-1');
    expect(f.deleted).toEqual([]);
    await service.discardPendingAttempt();
    expect(f.getPending()).toBe(null);
    expect(f.deleted).toEqual(['opaque-1']);
  });
  it('requires reconnect callbacks and preserves device id, prior enrollment and local-data ownership', async () => {
    const f = fixture(); f.setEnrollment(enrollment);
    const callbacks: string[] = [];
    const service = new MobileEnrollmentService({ ...f.deps, beforeReconnect: async previous => { expect(previous).toBe(enrollment); callbacks.push('snapshot'); }, onReconnected: async (previous, next) => { expect(previous.deviceId).toBe(next.deviceId); callbacks.push('preserve-data'); } });
    const next = await service.connect(input, 'reconnect');
    expect(next.deviceId).toBe(device);
    expect(callbacks).toEqual(['snapshot', 'preserve-data']);
    expect(f.deleted).toEqual([]);
  });
  it('keeps a registered pending key when the local commit fails', async () => {
    const f = fixture(); f.deps.persistence.commitEnrollment = async () => { throw new Error('disk full'); };
    await expect(new MobileEnrollmentService(f.deps).connect(input)).rejects.toThrow('disk full');
    expect(f.getPending()?.keyRef).toBe('opaque-1'); expect(f.deleted).toEqual([]);
  });
});
describe('memory-only device sessions', () => {
  it('single-flights concurrent authentication and never stores the token in enrollment', async () => {
    const f = fixture();
    const session = new MobileDeviceSession(f.deps, enrollment);
    const tokens = await Promise.all(Array.from({ length: 20 }, () => session.token()));
    expect(new Set(tokens).size).toBe(1);
    expect(f.requests.filter(req => req.path.endsWith('/device/token'))).toHaveLength(1);
    expect(JSON.stringify(f.getEnrollment())).not.toContain('ddt_');
  });
  it('renews an expired endpoint token without declaring revocation', async () => {
    const f = fixture();
    let rejectedOnce = false;
    f.setOverride(request => { if (request.path.endsWith('/devices/self') && !rejectedOnce) { rejectedOnce = true; return rejected(); } });
    const result = await new MobileDeviceSession(f.deps, enrollment).withToken((api, token) => api.deviceSelf(token));
    expect(result.deviceId).toBe(device);
    expect(f.requests.filter(req => req.path.endsWith('/device/token'))).toHaveLength(2);
  });
  it.each(['expired', 'used'])('retries a fresh signed challenge after %s nonce rejection and keeps auth recoverable', async () => {
    const f = fixture(); let count = 0;
    f.setOverride(request => request.path.endsWith('/device/token') && count++ === 0 ? rejected() : undefined);
    expect(await new MobileDeviceSession(f.deps, enrollment).token()).toMatch(/^ddt_/);
    expect(f.requests.filter(req => req.path.endsWith('/device/challenge'))).toHaveLength(2);
  });
  it('surfaces repeated key rejection without claiming confirmed revocation', async () => {
    const f = fixture(); f.setOverride(request => request.path.endsWith('/device/token') ? rejected() : undefined);
    await expect(new MobileDeviceSession(f.deps, enrollment).token()).rejects.toMatchObject({ code: 'key-rejected' });
  });
  it.each([0, 2])('blocks a changed epoch %s before signing or sending device credentials', async epoch => {
    const f = fixture(); f.hello['authorityEpoch'] = epoch === 0 ? 1 : epoch;
    const expected = epoch === 0 ? { ...enrollment, authorityEpoch: 2 } : enrollment;
    await expect(new MobileDeviceSession(f.deps, expected).token()).rejects.toMatchObject({ code: 'authority-changed' });
    expect(f.proofs).toEqual([]);
    expect(f.requests.some(req => req.path.endsWith('/device/challenge'))).toBe(false);
  });
  it('rejects a mismatching derived certificate before credentials', async () => {
    const f = fixture(); f.deps.certificatePin = async () => 'Z'.repeat(43);
    await expect(new MobileDeviceSession(f.deps, enrollment).token()).rejects.toMatchObject({ code: 'pin-mismatch' });
    expect(f.proofs).toEqual([]);
  });
  it('preserves the missing native-key diagnosis for restored installations', async () => {
    const f = fixture(); f.deps.signer.signChallenge = async () => { throw new MobileHubError('key-unavailable', 'Key unavailable'); };
    await expect(new MobileDeviceSession(f.deps, enrollment).token()).rejects.toMatchObject({ code: 'key-unavailable' });
  });
});
describe('authenticated realtime pin updates', () => {
  it('handles early native events and persists verified next/proxy pins before acknowledging', async () => {
    const f = fixture();
    const next = 'Z'.repeat(43); const proxy = 'P'.repeat(43);
    f.hello['tls'] = { spkiSha256: pin, nextSpkiSha256: next, proxySpkiSha256: [proxy] };
    f.deps.certificatePin = async pem => pem === 'next-certificate' ? next : pin;
    f.setOverride(req => req.path.endsWith('/tls/certificates') ? ok({ active: { spkiSha256: pin, certPem: 'active-certificate' }, next: { spkiSha256: next, certPem: 'next-certificate' }, source: 'self-signed', caCertPem: null, leafNotAfter: '2030', proxySpkiSha256: [proxy] }) : undefined);
    let emit: ((event: NativeSocketEvent) => void) | undefined;
    const sent: unknown[] = [];
    const port: MobileRealtimePort = { open: async (id, _target, _token, listener) => {
      emit = listener;
      listener({ id, kind: 'open' });
      return { close: async () => undefined, send: async text => { const message = JSON.parse(text); sent.push(message); f.steps.push(message.type === 'tls-pin-ack' ? 'ack' : 'hello'); return true; } };
    } };
    const failures: unknown[] = [];
    const realtime = new MobileHubRealtime(new MobileDeviceSession(f.deps, enrollment), port, { onEvent: () => undefined, onFailure: error => failures.push(error), now: () => now });
    try {
      await realtime.start(device);
      await vi.waitFor(() => expect(sent).toContainEqual({ type: 'hello', protocolVersion: 2, minHubProtocol: 2 }));
      emit!({ id: device, kind: 'message', text: JSON.stringify({ type: 'welcome', protocolVersion: 2, sessionKind: 'device', deviceId: device, heartbeatIntervalMs: 25000, tls: f.hello['tls'], authorityEpoch: 1 }) });
      await vi.waitFor(() => expect(sent).toContainEqual({ type: 'tls-pin-ack', spkiSha256: proxy }));
      expect(f.steps).toEqual(['save', 'hello', 'save', 'ack', 'ack']);
      expect(f.getEnrollment()?.pins).toEqual([pin, next, proxy]);
      expect(failures).toEqual([]);
    } finally { await realtime.stop(); }
  });
  it('never acknowledges a pin when durable persistence fails', async () => {
    const f = fixture();
    let saveCount = 0;
    f.deps.persistence.saveEnrollment = async () => { if (++saveCount > 1) throw new Error('disk full'); };
    let emit: ((event: NativeSocketEvent) => void) | undefined;
    const sent: { type: string }[] = [];
    const failures: unknown[] = [];
    const port: MobileRealtimePort = { open: async (_id, _target, _token, listener) => { emit = listener; return { close: async () => undefined, send: async text => { sent.push(JSON.parse(text)); return true; } }; } };
    const realtime = new MobileHubRealtime(new MobileDeviceSession(f.deps, enrollment), port, { onEvent: () => undefined, onFailure: error => failures.push(error), now: () => now });
    try {
      await realtime.start(device);
      emit!({ id: device, kind: 'message', text: JSON.stringify({ type: 'welcome', protocolVersion: 2, sessionKind: 'device', deviceId: device, heartbeatIntervalMs: 25000, tls: f.hello['tls'], authorityEpoch: 1 }) });
      await vi.waitFor(() => expect(failures).toHaveLength(1));
      expect(sent.some(message => message.type === 'tls-pin-ack')).toBe(false);
    } finally { await realtime.stop(); }
  });
});
