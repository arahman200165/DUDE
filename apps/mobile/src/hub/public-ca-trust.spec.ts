import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { HubRequest, HubResponse } from '@dude/api-client';
import { formatPairingString } from '@dude/contracts/hub';
import { MobileEnrollmentService, reviewMobilePairing } from './enrollment';
import { MobileHubRealtime } from './realtime';
import { MobileDeviceSession } from './session';
import { publicCaDomainOf, trustLabelOf, verifyTrustPins, TRUST_LABEL_PINNED, TRUST_LABEL_PUBLIC_CA, PUBLIC_CA_UNTRUSTED } from './trust';
import type { MobileRealtimePort, NativeSocketEvent } from './native';
import { MobileHubError, type MobileEnrollmentAttempt, type MobileHubEnrollment, type MobileHubPersistence, type MobileHubTarget, type MobileSigner } from './types';

/**
 * Public-CA trust mode of the Android Hub client (32-SS1, Milestone 839, PD-143): the TypeScript side. The Kotlin transport is covered by `PublicCaTrustTest.kt`;
 * this mirrors the Agent's adversarial list (`apps/device-agent/src/hub/public-ca-trust.spec.ts`) for the pairing parser, enrollment, trust selection,
 * the realtime pin handling and the seam scan.
 */
const DOMAIN = 'hub.example.com';
const hub = '11111111-1111-4111-8111-111111111111';
const device = '22222222-2222-4222-8222-222222222222';
const environment = '33333333-3333-4333-8333-333333333333';
const install = '44444444-4444-4444-8444-444444444444';
const pin = 'A'.repeat(43);
const now = Date.parse('2026-10-04T12:00:00.000Z');
const publicString = (host = DOMAIN, port = 443, code = '01234567') => formatPairingString({ trustMode: 'public-ca', host, port, code });
const pinnedString = `dude-pair:v1:hub.example:47600:01234567:${pin}`;
const ok = (body: unknown): HubResponse => ({ status: 200, headers: {}, body });
const pinnedEnrollment: MobileHubEnrollment = { hubUrl: 'https://hub.example:47600', pins: [pin], deviceId: device, environmentId: environment, hubInstanceId: hub, authorityEpoch: 1, keyRef: 'opaque-1', publicKey: 'B'.repeat(43), keyId: 'key-id', registeredAt: 'now', spkiActive: pin, spkiNext: null, proxySpkis: [] };
const publicEnrollment: MobileHubEnrollment = { ...pinnedEnrollment, hubUrl: `https://${DOMAIN}:443`, pins: [], trustMode: 'public-ca', trustDomain: DOMAIN };

function fixture(advertise: { trustMode?: 'pinned' | 'public-ca'; trustDomain?: string } = { trustMode: 'public-ca', trustDomain: DOMAIN }) {
  let saved: MobileHubEnrollment | null = null;
  let pending: MobileEnrollmentAttempt | null = null;
  let keyCount = 0;
  const requests: HubRequest[] = [];
  const targets: MobileHubTarget[] = [];
  const hello: Record<string, unknown> = { service: 'dude-hub', protocolVersion: 2, minClientProtocol: 1, hubVersion: 'test', hubInstanceId: hub, environmentId: environment, bootstrapped: true, syncCategoryFiltering: true, tls: { spkiSha256: pin, nextSpkiSha256: null }, ...advertise };
  const persistence: MobileHubPersistence = {
    readEnrollment: async () => saved, readPendingAttempt: async () => pending,
    savePendingAttempt: async attempt => { pending = structuredClone(attempt); },
    commitEnrollment: async value => { saved = structuredClone(value); pending = null; },
    saveEnrollment: async value => { saved = structuredClone(value); },
    clearPendingAttempt: async () => { pending = null; },
  };
  const signer: MobileSigner = {
    prepareKey: async () => `opaque-${++keyCount}`, publicKey: async () => 'B'.repeat(43),
    signEnrollment: async () => 'C'.repeat(86), signChallenge: async () => 'C'.repeat(86), deleteKey: async () => undefined, randomBytes: async () => 'D'.repeat(43),
  };
  let tokens = 0;
  const deps = {
    signer, persistence, deviceId: device, installId: install, appVersion: '0.0.0', now: () => now, certificatePin: async () => pin,
    beforeReconnect: async () => undefined, onReconnected: async () => undefined,
    transport: (target: MobileHubTarget) => ({ request: async (request: HubRequest): Promise<HubResponse> => {
      targets.push(target); requests.push(request);
      if (request.path.endsWith('/hello')) return ok(hello);
      if (request.path.endsWith('/tls/certificates')) return ok({ active: { spkiSha256: pin, certPem: 'public-certificate' }, next: null, source: 'self-signed', caCertPem: null, leafNotAfter: '2030-01-01' });
      if (request.path.endsWith('/devices/enroll')) return ok({ deviceId: device, environmentId: environment, hubInstanceId: hub, keyId: 'key-id', registeredAt: new Date(now).toISOString(), hubRevision: 0 });
      if (request.path.endsWith('/device/challenge')) return ok({ nonce: 'N'.repeat(43), expiresAt: new Date(now + 60_000).toISOString() });
      if (request.path.endsWith('/device/token')) return ok({ accessToken: `ddt_${String.fromCharCode(65 + tokens++).repeat(43)}`, expiresAt: new Date(now + 900_000).toISOString(), authorityEpoch: 1 });
      throw new Error(`Unexpected request ${request.path}`);
    } }),
  };
  return { deps, hello, requests, targets, setEnrollment: (value: MobileHubEnrollment) => { saved = value; }, getEnrollment: () => saved, keyCount: () => keyCount, enrolled: () => requests.some(r => r.path.endsWith('/devices/enroll')) };
}
const input = (pairingString: string, extra: Record<string, unknown> = {}) => ({ pairingString, displayName: 'Phone', acknowledged: true as const, ...extra });

describe('v2 pairing strings', () => {
  it('review a public-CA string as a pin-free, single-domain pairing', () => {
    expect(reviewMobilePairing(publicString(), ' Phone ')).toEqual({ hubUrl: `https://${DOMAIN}:443`, pin: null, trustMode: 'public-ca', trustDomain: DOMAIN, displayName: 'Phone' });
    expect(reviewMobilePairing(publicString('HUB.Example.COM', 8443), 'P')).toMatchObject({ hubUrl: `https://${DOMAIN}:8443`, trustDomain: DOMAIN });
  });
  it('keep v1 strings pinned and unchanged', () => {
    expect(reviewMobilePairing(pinnedString, 'Phone')).toEqual({ hubUrl: 'https://hub.example:47600', pin, trustMode: 'pinned', trustDomain: null, displayName: 'Phone' });
  });
  it.each([
    'dude-pair:v2:hub.example.com:443:01234567:pinned',
    'dude-pair:v2:hub.example.com:443:01234567',
    'dude-pair:v2:hub.example.com:443:01234567:public-ca:extra',
    'dude-pair:v2:hub.example.com:0:01234567:public-ca',
    'dude-pair:v2:hub.example.com:65536:01234567:public-ca',
    'dude-pair:v2:hub.example.com:443:0123456:public-ca',
    'dude-pair:v2:hub.example.com:443:0123456U:public-ca',
    'dude-pair:v2:127.0.0.1:443:01234567:public-ca',
    'dude-pair:v2:[::1]:443:01234567:public-ca',
    'dude-pair:v2:localhost:443:01234567:public-ca',
    'dude-pair:v2:hub.local:443:01234567:public-ca',
    'dude-pair:v2:hub:443:01234567:public-ca',
    'dude-pair:v3:hub.example.com:443:01234567:public-ca',
    `dude-pair:v2:hub.example.com:443:01234567:${pin}`,
    '',
  ])('refuse the malformed or non-public string %j', string => {
    expect(() => reviewMobilePairing(string, 'Phone')).toThrow(MobileHubError);
  });
});

describe('enrolling against a public-CA domain', () => {
  it('skips every pin step, validates the domain through the Hub hello and stores the mode and domain with no pins', async () => {
    const f = fixture();
    const result = await new MobileEnrollmentService(f.deps).connect(input(publicString()));
    expect(f.requests.some(r => r.path.endsWith('/tls/certificates'))).toBe(false);
    expect(f.targets.every(t => t.trustMode === 'public-ca' && t.trustDomain === DOMAIN && t.pins.length === 0 && t.hubUrl === `https://${DOMAIN}:443`)).toBe(true);
    expect(result).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN, pins: [], spkiNext: null, proxySpkis: [], hubUrl: `https://${DOMAIN}:443` });
    expect(f.getEnrollment()).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN, pins: [] });
  });
  it.each([
    ['no advertisement (a Hub without the tunnel)', {}],
    ['a pinned advertisement', { trustMode: 'pinned' as const }],
    ['another domain', { trustMode: 'public-ca' as const, trustDomain: 'other.example.com' }],
  ])('refuses a Hub whose hello is %s, before a key exists and with the pairing code unsent', async (_name, advertise) => {
    const f = fixture(advertise);
    await expect(new MobileEnrollmentService(f.deps).connect(input(publicString()))).rejects.toMatchObject({ code: 'incompatible' });
    expect(f.keyCount()).toBe(0);
    expect(f.enrolled()).toBe(false);
  });
  it('keeps the pinned flow for a v1 string, records no trust fields and never trusts a public advertisement', async () => {
    const f = fixture({ trustMode: 'public-ca', trustDomain: DOMAIN });
    const result = await new MobileEnrollmentService(f.deps).connect(input(pinnedString));
    expect(result.pins).toEqual([pin]);
    expect('trustMode' in result).toBe(false);
    expect(f.requests.some(r => r.path.endsWith('/tls/certificates'))).toBe(true);
    await expect(new MobileEnrollmentService(fixture().deps).connect(input(`dude-pair:v1:hub.example:47600:01234567:${'Z'.repeat(43)}`))).rejects.toMatchObject({ code: 'pin-mismatch' });
  });
});

describe('a device never changes trust mode because a server says so', () => {
  const reconnect = (f: ReturnType<typeof fixture>, pairingString: string, extra: Record<string, unknown> = {}) => new MobileEnrollmentService(f.deps).connect(input(pairingString, extra), 'reconnect');
  it('refuses pinned -> public-ca without a confirmation, before any traffic', async () => {
    const f = fixture(); f.setEnrollment(pinnedEnrollment);
    await expect(reconnect(f, publicString())).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    expect(f.requests).toEqual([]);
    expect(f.keyCount()).toBe(0);
  });
  it('refuses public-ca -> pinned and public-ca -> another domain without a matching confirmation', async () => {
    const toPinned = fixture(); toPinned.setEnrollment(publicEnrollment);
    await expect(reconnect(toPinned, pinnedString)).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    expect(toPinned.requests).toEqual([]);
    const toOther = fixture({ trustMode: 'public-ca', trustDomain: 'other.example.com' }); toOther.setEnrollment(publicEnrollment);
    await expect(reconnect(toOther, publicString('other.example.com'))).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    expect(toOther.requests).toEqual([]);
  });
  it('refuses a confirmation for something other than what the pairing string does', async () => {
    const f = fixture(); f.setEnrollment(pinnedEnrollment);
    await expect(reconnect(f, publicString(), { trustChange: { mode: 'public-ca', domain: 'other.example.com' } })).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    await expect(reconnect(f, publicString(), { trustChange: { mode: 'pinned', domain: null } })).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    expect(f.requests).toEqual([]);
  });
  it('applies exactly the confirmed change, in both directions', async () => {
    const up = fixture(); up.setEnrollment(pinnedEnrollment);
    expect(await reconnect(up, publicString(), { trustChange: { mode: 'public-ca', domain: DOMAIN } })).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN, pins: [] });
    const down = fixture({}); down.setEnrollment(publicEnrollment);
    const result = await reconnect(down, pinnedString, { trustChange: { mode: 'pinned', domain: null } });
    expect(result.pins).toEqual([pin]);
    expect('trustMode' in result).toBe(false);
  });
  it('a same-mode reconnect needs no confirmation', async () => {
    const f = fixture(); f.setEnrollment(publicEnrollment);
    expect(await reconnect(f, publicString())).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN });
    const g = fixture({}); g.setEnrollment(pinnedEnrollment);
    expect((await reconnect(g, pinnedString)).pins).toEqual([pin]);
  });
  it('a hello that advertises another trust is never applied to a connected device (either direction)', async () => {
    const pinnedDevice = fixture({ trustMode: 'public-ca', trustDomain: DOMAIN });
    const pinnedSession = new MobileDeviceSession(pinnedDevice.deps, pinnedEnrollment);
    const refreshedPinned = await pinnedSession.refreshTrust();
    expect(refreshedPinned.trustMode).toBeUndefined();
    expect(refreshedPinned.pins).toEqual([pin]);
    expect(pinnedDevice.targets.every(t => t.trustMode === undefined && t.pins.length === 1)).toBe(true);

    const publicDevice = fixture({});
    const session = new MobileDeviceSession(publicDevice.deps, publicEnrollment);
    const refreshed = await session.refreshTrust();
    expect(refreshed).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN, pins: [], hubUrl: `https://${DOMAIN}:443` });
    expect(publicDevice.targets.every(t => t.trustMode === 'public-ca' && t.pins.length === 0)).toBe(true);
    // Authentication (challenge + token) also stays on the public-CA target and fetches no certificates.
    await session.token(true);
    expect(publicDevice.requests.some(r => r.path.endsWith('/tls/certificates'))).toBe(false);
    expect(publicDevice.targets.every(t => t.trustMode === 'public-ca')).toBe(true);
  });
});

describe('trust selection comes from the stored enrollment only', () => {
  const target = (over: Partial<MobileHubTarget>): MobileHubTarget => ({ hubUrl: `https://${DOMAIN}:443`, pins: [], trustMode: 'public-ca', trustDomain: DOMAIN, ...over });
  it('reads a pre-839 or pinned record as pinned', () => {
    expect(publicCaDomainOf({ hubUrl: 'https://hub.example:47600', pins: [pin] })).toBeNull();
    expect(publicCaDomainOf({ hubUrl: 'https://hub.example:47600', pins: [pin], trustMode: 'pinned', trustDomain: null })).toBeNull();
  });
  it('selects the one stored domain for a public-ca record whatever else it holds', () => {
    expect(publicCaDomainOf(target({}))).toBe(DOMAIN);
    expect(publicCaDomainOf(target({ pins: [pin], hubUrl: `https://${DOMAIN.toUpperCase()}:8443/` }))).toBe(DOMAIN);
  });
  it.each([
    ['plain http', { hubUrl: `http://${DOMAIN}:443` }],
    ['another host', { hubUrl: 'https://evil.example.com:443' }],
    ['a parent domain', { hubUrl: 'https://example.com:443' }],
    ['credentials', { hubUrl: `https://user:pw@${DOMAIN}:443` }],
    ['a path', { hubUrl: `https://${DOMAIN}:443/x` }],
    ['an IP literal origin', { hubUrl: 'https://127.0.0.1:443' }],
    ['an IP literal domain', { hubUrl: 'https://127.0.0.1:443', trustDomain: '127.0.0.1' }],
    ['a missing domain', { trustDomain: null }],
    ['a single-label domain', { hubUrl: 'https://localhost:443', trustDomain: 'localhost' }],
    ['an unknown mode', { trustMode: 'trust-all' as never }],
  ])('refuses %s for a public-ca record, with nothing sent', (_name, over) => {
    expect(() => publicCaDomainOf(target(over))).toThrow(MobileHubError);
  });
  it('verifyTrustPins keeps the pinned verification and stores no pin for public-ca', async () => {
    const f = fixture();
    const api = { tlsCertificates: vi.fn(async () => { throw new Error('must not be called'); }) } as never;
    const helloBody = { tls: { spkiSha256: pin, nextSpkiSha256: 'N'.repeat(43), proxySpkiSha256: ['P'.repeat(43)] } } as never;
    expect(await verifyTrustPins(api, helloBody, f.deps.certificatePin, target({}))).toEqual({ spkiActive: pin, spkiNext: null, proxySpkis: [], pins: [] });
    await expect(verifyTrustPins(api, helloBody, f.deps.certificatePin, { hubUrl: 'https://hub.example:47600', pins: [pin] })).rejects.toThrow('must not be called');
  });
  it('labels the modes like the desktop', () => {
    expect(trustLabelOf('pinned')).toBe(TRUST_LABEL_PINNED);
    expect(trustLabelOf(undefined)).toBe(TRUST_LABEL_PINNED);
    expect(trustLabelOf('public-ca')).toBe(TRUST_LABEL_PUBLIC_CA);
    expect(TRUST_LABEL_PUBLIC_CA).toBe('Public certificate authority (via Cloudflare — Cloudflare can read traffic)');
  });
});

describe('realtime with a public-CA device', () => {
  it('never compares, stores or acknowledges the Hub announced pins, and maps a TLS failure to an untrusted-certificate error', async () => {
    const f = fixture({});
    f.hello['tls'] = { spkiSha256: pin, nextSpkiSha256: 'Z'.repeat(43), proxySpkiSha256: ['P'.repeat(43)] };
    let emit: ((event: NativeSocketEvent) => void) | undefined;
    const sent: { type: string }[] = [];
    const failures: unknown[] = [];
    const port: MobileRealtimePort = { open: async (id, _target, _token, listener) => { emit = listener; listener({ id, kind: 'open' }); return { close: async () => undefined, send: async text => { sent.push(JSON.parse(text)); return true; } }; } };
    const session = new MobileDeviceSession(f.deps, publicEnrollment);
    const realtime = new MobileHubRealtime(session, port, { onEvent: () => undefined, onFailure: error => failures.push(error), now: () => now });
    try {
      await realtime.start(device);
      await vi.waitFor(() => expect(sent.some(m => m.type === 'hello')).toBe(true));
      emit!({ id: device, kind: 'message', text: JSON.stringify({ type: 'welcome', protocolVersion: 2, sessionKind: 'device', deviceId: device, heartbeatIntervalMs: 25000, tls: f.hello['tls'], authorityEpoch: 1 }) });
      await vi.waitFor(() => expect(session.getEnrollment().spkiActive).toBe(pin));
      emit!({ id: device, kind: 'message', text: JSON.stringify({ type: 'event', event: 'tls-next-pin', topic: 'hub', data: { spkiSha256: 'Z'.repeat(43) } }) });
      expect(sent.some(m => m.type === 'tls-pin-ack')).toBe(false);
      expect(session.getEnrollment()).toMatchObject({ pins: [], spkiNext: null, proxySpkis: [], trustMode: 'public-ca' });
      expect(failures).toEqual([]);
      emit!({ id: device, kind: 'failure', code: 0, error: PUBLIC_CA_UNTRUSTED });
      await vi.waitFor(() => expect(failures).toHaveLength(1));
      expect(failures[0]).toMatchObject({ code: 'tls-untrusted' });
    } finally { await realtime.stop(); }
  });
});

describe('the native bridge selects trust from the stored target', () => {
  it('passes the public domain and no pins to the native module, refuses a wrong origin before any native call and names a handshake failure', async () => {
    vi.resetModules();
    const calls: unknown[][] = [];
    let failWith: Error | null = null;
    vi.doMock('expo-modules-core', () => ({ requireNativeModule: () => ({
      request: async (...args: unknown[]) => { calls.push(args); if (failWith) throw failWith; return { status: 200, headers: {}, body: '{"ok":true}' }; },
      openSocket: async (...args: unknown[]) => { calls.push(args); },
      addListener: () => ({ remove: () => undefined }),
    }) }));
    const { androidHubTransport, androidRealtime } = await import('./native');
    const publicTarget: MobileHubTarget = { hubUrl: `https://${DOMAIN}:443`, pins: [], trustMode: 'public-ca', trustDomain: DOMAIN };
    await androidHubTransport(publicTarget).request({ method: 'GET', path: '/api/v1/hello' });
    expect(calls[0]).toEqual([`https://${DOMAIN}:443`, [], 'GET', '/api/v1/hello', {}, null, DOMAIN]);
    await androidHubTransport({ hubUrl: 'https://hub.example:47600', pins: [pin] }).request({ method: 'GET', path: '/api/v1/hello' });
    expect(calls[1]![1]).toEqual([pin]);
    expect(calls[1]![6]).toBeNull();
    await androidRealtime.open('socket', publicTarget, `ddt_${'A'.repeat(43)}`, () => undefined);
    expect(calls[2]).toEqual(['socket', `https://${DOMAIN}:443`, [], `ddt_${'A'.repeat(43)}`, DOMAIN]);
    const before = calls.length;
    await expect(androidHubTransport({ ...publicTarget, hubUrl: 'https://evil.example.com:443' }).request({ method: 'GET', path: '/api/v1/hello' })).rejects.toMatchObject({ code: 'trust-origin-refused' });
    await expect(androidHubTransport({ ...publicTarget, hubUrl: `http://${DOMAIN}:443` }).request({ method: 'GET', path: '/api/v1/hello' })).rejects.toMatchObject({ code: 'trust-origin-refused' });
    await expect(androidRealtime.open('socket-2', { ...publicTarget, hubUrl: 'https://evil.example.com:443' }, `ddt_${'A'.repeat(43)}`, () => undefined)).rejects.toMatchObject({ code: 'trust-origin-refused' });
    expect(calls.length).toBe(before);
    failWith = new Error(PUBLIC_CA_UNTRUSTED);
    await expect(androidHubTransport(publicTarget).request({ method: 'GET', path: '/api/v1/hello' })).rejects.toMatchObject({ code: 'tls-untrusted' });
    failWith = new Error('tls-pin-mismatch');
    await expect(androidHubTransport({ hubUrl: 'https://hub.example:47600', pins: [pin] }).request({ method: 'GET', path: '/api/v1/hello' })).rejects.toMatchObject({ code: 'pin-mismatch' });
    vi.doUnmock('expo-modules-core');
  });
});

describe('the test seam and global trust', () => {
  const dir = (...parts: string[]) => path.join(__dirname, '..', '..', ...parts);
  const walk = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? entry.name === 'node_modules' ? [] : walk(path.join(root, entry.name)) : [path.join(root, entry.name)]);
  it('is reachable only from the Kotlin transport file, never from the module, the bridge or any TypeScript', () => {
    const kotlinMain = dir('modules', 'dude-hub', 'android', 'src', 'main');
    const users = walk(kotlinMain).filter(file => readFileSync(file, 'utf8').includes('PublicCaTestSeam')).map(file => path.basename(file));
    expect(users).toEqual(['PinnedHubTransport.kt']);
    expect(readFileSync(path.join(kotlinMain, 'java', 'expo', 'modules', 'dudehub', 'DudeHubModule.kt'), 'utf8').toLowerCase()).not.toContain('seam');
    const ts = [...walk(dir('src')), ...walk(dir('app'))].filter(file => /\.(ts|tsx)$/.test(file) && !file.endsWith('public-ca-trust.spec.ts'));
    expect(ts.filter(file => /PublicCaTestSeam|publicCaTestSeam/.test(readFileSync(file, 'utf8')))).toEqual([]);
  });
  it('adds no global trust-all: no trust manager is installed outside the pin trust manager and the platform default', () => {
    const source = readFileSync(path.join(dir('modules', 'dude-hub', 'android', 'src', 'main'), 'java', 'expo', 'modules', 'dudehub', 'PinnedHubTransport.kt'), 'utf8');
    expect(source.match(/: X509TrustManager \{/g)).toHaveLength(1);
    expect(source).not.toMatch(/HttpsURLConnection\.setDefault|SSLContext\.setDefault|hostnameVerifier \{ _, _ -> true/);
    expect(readFileSync(dir('plugins', 'with-android-privacy.cjs'), 'utf8')).toContain("'android:usesCleartextTraffic': 'false'");
  });
});
