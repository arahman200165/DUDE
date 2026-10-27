import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HubTransport } from '@dude/api-client';
import { formatPairingString } from '@dude/contracts/hub';
import { getEnrollment, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { readDeviceRecord } from '../store/identity.js';
import { CAPABILITIES, fakeDpapi } from '../testing/hub-harness.js';
import { makeCert, startHttps } from '../testing/test-tls.js';
import type { TestHttpsServer } from '../testing/test-tls.js';
import { createTestPublicCa } from '../testing/test-public-ca.js';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { enrollDevice, reconnectDevice } from './enroll.js';
import type { ReconnectDeps } from './enroll.js';
import { HubManagerError } from './errors.js';
import { createHubConnectionManager } from './hub-client.js';
import type { HubConnectionManager } from './hub-client.js';
import { PIN_MISMATCH_CODE, TRUST_ORIGIN_REFUSED_CODE, connectPinned, createPinnedTransport } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';
import { resolveTrustTarget } from './trust.js';

/**
 * Public-CA trust mode (32-SS1, Milestone 838, PD-143), adversarially. A throwaway CA signs the "public" leaves; its certificate reaches a TLS client ONLY
 * through the `publicCaTestSeam` of a target (never a process-wide setting, never `rejectUnauthorized`). The seam also dials loopback while SNI and the host
 * name check use the trusted domain.
 */
const DOMAIN = 'hub.example.com';
const INSTANCE = '0190a1b2-c3d4-7e5f-8a6b-1c2d3e4f5a6b';
const SPKI = 'A'.repeat(43);
const NOW = new Date('2026-03-01T12:00:00.000Z');
const T0 = new Date('2026-02-01T00:00:00.000Z');
const DAY = 86_400_000;

const servers: TestHttpsServer[] = [];
const serve = async (cert: Parameters<typeof startHttps>[0], handler?: (req: IncomingMessage, res: ServerResponse) => void): Promise<TestHttpsServer> => {
  const s = await startHttps(cert, handler);
  servers.push(s);
  return s;
};
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); await cleanupTemp(); });

const ca = createTestPublicCa();
const publicTarget = (port: number, over: Partial<PinnedTarget> = {}): PinnedTarget => ({
  host: DOMAIN, port, pins: [], trust: 'public-ca', trustedDomain: DOMAIN, publicCaTestSeam: ca.seam('127.0.0.1'), ...over,
});
const getVia = (target: PinnedTarget): Promise<unknown> => createPinnedTransport(target, 5_000).request({ method: 'GET', path: '/x' });

describe('public-ca transport: only a CA-valid certificate for the trusted domain is accepted', () => {
  it('accepts a CA-issued certificate for the domain without any pin and never reports a peer pin', async () => {
    const server = await serve(ca.issue({ names: [DOMAIN] }));
    const seen: string[] = [];
    await expect(getVia(publicTarget(server.port, { onPeerSpki: (s) => seen.push(s) }))).resolves.toMatchObject({ status: 200, body: { ok: true } });
    expect(seen).toEqual([]);
    expect(server.requests).toHaveLength(1);
  });

  it('refuses a CA-issued certificate for another host name, with zero application bytes', async () => {
    const server = await serve(ca.issue({ names: ['other.example.com'] }));
    await expect(getVia(publicTarget(server.port))).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    expect(server.requests).toHaveLength(0);
  });

  it('refuses an expired certificate', async () => {
    const server = await serve(ca.issue({ names: [DOMAIN], notBefore: new Date(Date.now() - 30 * DAY), notAfter: new Date(Date.now() - DAY) }));
    await expect(getVia(publicTarget(server.port))).rejects.toMatchObject({ code: 'CERT_HAS_EXPIRED' });
    expect(server.requests).toHaveLength(0);
  });

  it('refuses a not-yet-valid certificate', async () => {
    const server = await serve(ca.issue({ names: [DOMAIN], notBefore: new Date(Date.now() + DAY), notAfter: new Date(Date.now() + 30 * DAY) }));
    await expect(getVia(publicTarget(server.port))).rejects.toMatchObject({ code: 'CERT_NOT_YET_VALID' });
    expect(server.requests).toHaveLength(0);
  });

  it('refuses a self-signed certificate, even one listed in every Hub-supplied field', async () => {
    const self = makeCert('self');
    const server = await serve(self);
    // `ca`, `pins` and `allowSystemTrust` are exactly what a hostile Hub could have handed the device; none of them may widen public-ca trust.
    const hostile = publicTarget(server.port, { ca: [self.certPem], pins: [self.spki], allowSystemTrust: true });
    await expect(getVia(hostile)).rejects.toMatchObject({ code: expect.stringMatching(/SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/) });
    expect(server.requests).toHaveLength(0);
  });

  it('refuses a certificate from a different (untrusted) CA', async () => {
    const rogue = createTestPublicCa('Rogue Root');
    const server = await serve(rogue.issue({ names: [DOMAIN] }));
    await expect(getVia(publicTarget(server.port))).rejects.toMatchObject({ code: expect.stringMatching(/SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/) });
    expect(server.requests).toHaveLength(0);
  });

  it.each([
    ['another host', { host: 'evil.example.com' }],
    ['an IPv4 literal', { host: '127.0.0.1' }],
    ['a bracketed IPv6 literal', { host: '[::1]' }],
    ['no trusted domain', { trustedDomain: undefined }],
    ['a trusted domain that is not a public name', { host: 'localhost', trustedDomain: 'localhost' }],
  ] as Array<[string, Partial<PinnedTarget>]>)('refuses %s before any socket opens', async (_name, over) => {
    const server = await serve(ca.issue({ names: [DOMAIN] }));
    await expect(connectPinned(publicTarget(server.port, over), 2_000)).rejects.toMatchObject({ code: TRUST_ORIGIN_REFUSED_CODE });
    expect(server.requests).toHaveLength(0);
  });
});

describe('pinned mode is unchanged and never falls back to the public chain', () => {
  it('refuses a CA-valid certificate whose key is not pinned', async () => {
    const leaf = ca.issue({ names: ['127.0.0.1'] });
    const other = makeCert('other');
    const server = await serve(leaf);
    const target: PinnedTarget = { host: '127.0.0.1', port: server.port, ca: [ca.caCertPem], pins: [other.spki] };
    await expect(createPinnedTransport(target, 5_000).request({ method: 'GET', path: '/x' })).rejects.toMatchObject({ code: PIN_MISMATCH_CODE });
    expect(server.requests).toHaveLength(0);
  });

  it('still accepts its own pin on a certificate outside any chain', async () => {
    const self = makeCert('self');
    const server = await serve(self);
    await expect(createPinnedTransport({ host: '127.0.0.1', port: server.port, pins: [self.spki] }, 5_000).request({ method: 'GET', path: '/x' })).resolves.toMatchObject({ status: 200 });
  });
});

// --- Enrollment rows and target selection -----------------------------------------------------------------------------

function seed(over: { hubUrl?: string; trustMode?: 'pinned' | 'public-ca'; trustDomain?: string | null } = {}) {
  const dir = tempDir();
  const store = openReady(dir, { capabilities: CAPABILITIES });
  const db = store.db;
  saveEnrollment(db, {
    hubInstanceId: INSTANCE, environmentId: 'env-1', hubUrl: over.hubUrl ?? 'https://old.hub:8443', protocolVersion: 3, spkiActive: SPKI, certActivePem: 'HUB-SUPPLIED-PEM',
    keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(), authorityEpoch: 1,
    ...(over.trustMode ? { trustMode: over.trustMode, trustDomain: over.trustDomain ?? null } : {}),
  }, T0);
  return { dir, store, db };
}

describe('trust selection comes from the enrollment row only', () => {
  it('persists the mode and reads a pre-838 or damaged row as pinned', () => {
    const { db } = seed();
    expect(getEnrollment(db)).toMatchObject({ trustMode: 'pinned', trustDomain: null });
    const pub = seed({ hubUrl: `https://${DOMAIN}`, trustMode: 'public-ca', trustDomain: DOMAIN });
    expect(getEnrollment(pub.db)).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN });
    expect(() => saveEnrollment(pub.db, { ...getEnrollment(pub.db)!, trustMode: 'public-ca', trustDomain: null }, NOW)).toThrow(/domain/);
    pub.db.prepare('UPDATE hub_enrollment SET trust_domain = NULL').run();
    expect(getEnrollment(pub.db)).toMatchObject({ trustMode: 'pinned', trustDomain: null });
  });

  it('builds a pin-free, root-free target for a public-ca row whatever the row holds', () => {
    const { db } = seed({ hubUrl: `https://${DOMAIN}`, trustMode: 'public-ca', trustDomain: DOMAIN });
    db.prepare("UPDATE hub_enrollment SET proxy_spkis = ?, spki_next = ?, cert_next_pem = 'MORE-PEM'").run(JSON.stringify([SPKI]), 'C'.repeat(43));
    const target = resolveTrustTarget(getEnrollment(db)!, () => undefined);
    expect(target).toMatchObject({ trust: 'public-ca', trustedDomain: DOMAIN, host: DOMAIN, port: 443, pins: [] });
    for (const key of ['ca', 'publicCaTestSeam', 'allowSystemTrust', 'onPeerSpki']) expect(target, key).not.toHaveProperty(key);
  });

  it('refuses a plain-http origin, another host, an IP literal and credentials for a public-ca row', () => {
    for (const hubUrl of ['http://hub.example.com', 'https://evil.example.com', 'https://127.0.0.1', 'https://u:p@hub.example.com', 'https://hub.example.com.evil.example']) {
      const { db } = seed({ hubUrl, trustMode: 'public-ca', trustDomain: DOMAIN });
      expect(() => resolveTrustTarget(getEnrollment(db)!), hubUrl).toThrowError(expect.objectContaining({ code: 'trust-origin-refused' }));
    }
  });

  it('keeps the pinned target exactly as before for a pinned row', () => {
    const { db } = seed();
    expect(resolveTrustTarget(getEnrollment(db)!)).toMatchObject({ host: 'old.hub', port: 8443, ca: ['HUB-SUPPLIED-PEM'], pins: [SPKI] });
    expect(resolveTrustTarget(getEnrollment(db)!)).not.toHaveProperty('trust');
  });

  it('the test seam is reachable only from the allowlisted wiring files, never from Hub-provided data', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const users: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.endsWith('.spec.ts') && readFileSync(full, 'utf8').includes('publicCaTestSeam')) users.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    };
    walk(root);
    expect(users.sort()).toEqual(['hub/enroll.ts', 'hub/hub-client.ts', 'hub/index.ts', 'hub/pinned-transport.ts', 'testing/test-public-ca.ts']);
    // None of them may read the seam from a hello, a pairing payload or an enrollment row.
    for (const file of users) {
      const text = readFileSync(path.join(root, file), 'utf8');
      expect(text, file).not.toMatch(/(hello|enrollment|parsed|row)\.[A-Za-z.]*publicCaTestSeam/);
    }
  });
});

// --- Enrollment over a real TLS chain ---------------------------------------------------------------------------------

/** A hello; a key set to `undefined` is left out (the schema's optional fields must be absent, not undefined). */
const helloBody = (over: Record<string, unknown> = {}): Record<string, unknown> => Object.fromEntries(Object.entries({
  service: 'dude-hub', protocolVersion: 3, minClientProtocol: 1, hubVersion: '1.0.0', hubInstanceId: INSTANCE, environmentId: 'env-1', bootstrapped: true,
  tls: { spkiSha256: SPKI, nextSpkiSha256: null }, authorityEpoch: 1, authorityState: 'active', trustMode: 'public-ca', trustDomain: DOMAIN, ...over,
}).filter(([, v]) => v !== undefined));

function jsonHub(hello: Record<string, unknown>) {
  const enrollBodies: unknown[] = [];
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.endsWith('/hello')) { res.end(JSON.stringify(hello)); return; }
    if (req.url?.endsWith('/devices/enroll')) {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { device: { deviceId: string } };
        enrollBodies.push(body);
        res.end(JSON.stringify({ deviceId: body.device.deviceId, environmentId: 'env-1', hubInstanceId: INSTANCE, keyId: 'key-new', registeredAt: NOW.toISOString(), hubRevision: 0 }));
      });
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  };
  return { handler, enrollBodies };
}

const pairing = formatPairingString({ trustMode: 'public-ca', host: DOMAIN, port: 443, code: 'ABCD2345' });

describe('enrolling against a public-CA domain', () => {
  async function enrollOverTls(hello: Record<string, unknown>, leaf = ca.issue({ names: [DOMAIN] })) {
    const hub = jsonHub(hello);
    const server = await serve(leaf, hub.handler);
    // The pairing string says port 443; the test server listens elsewhere, so the string is rewritten to the test port (the host stays the domain).
    const text = pairing.replace(':443:', `:${server.port}:`);
    const dir = tempDir();
    const store = openReady(dir, { capabilities: CAPABILITIES });
    const probe = vi.fn();
    const manager = { status: vi.fn(() => ({ state: 'standalone' })), start: vi.fn(), stop: vi.fn() } as unknown as HubConnectionManager;
    const run = (): ReturnType<typeof enrollDevice> => enrollDevice(text, {
      db: store.db, dpapi: fakeDpapi(), now: () => NOW, device: () => readDeviceRecord(store.db, CAPABILITIES), manager, probe, publicCaTestSeam: ca.seam('127.0.0.1'),
    });
    return { db: store.db, hub, server, probe, manager, run };
  }

  it('skips the pin probe, validates the chain, stores the mode and domain and starts the manager', async () => {
    const ctx = await enrollOverTls(helloBody());
    await ctx.run();
    expect(ctx.probe).not.toHaveBeenCalled();
    expect(ctx.manager.start).toHaveBeenCalledOnce();
    expect(ctx.hub.enrollBodies).toHaveLength(1);
    expect(getEnrollment(ctx.db)).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN, hubUrl: `https://${DOMAIN}:${ctx.server.port}`, certActivePem: '' });
  });

  it('refuses a Hub whose hello does not advertise public-ca for exactly that domain, sending no pairing code', async () => {
    for (const hello of [helloBody({ trustMode: undefined, trustDomain: undefined }), helloBody({ trustDomain: 'other.example.com' }), helloBody({ trustMode: 'pinned', trustDomain: undefined })]) {
      const ctx = await enrollOverTls(hello);
      await expect(ctx.run()).rejects.toMatchObject({ code: 'incompatible' });
      expect(ctx.hub.enrollBodies).toHaveLength(0);
      expect(getEnrollment(ctx.db)).toBeNull();
    }
  });

  it.each([
    ['a certificate for another host', () => ca.issue({ names: ['other.example.com'] })],
    ['an expired certificate', () => ca.issue({ names: [DOMAIN], notBefore: new Date(Date.now() - 30 * DAY), notAfter: new Date(Date.now() - DAY) })],
    ['a self-signed certificate', () => makeCert('self')],
  ])('refuses %s: the pairing code is never sent and nothing is stored', async (_name, leaf) => {
    const ctx = await enrollOverTls(helloBody(), leaf());
    await expect(ctx.run()).rejects.toMatchObject({ code: 'tls-pin-mismatch' });
    expect(ctx.server.requests).toHaveLength(0);
    expect(ctx.hub.enrollBodies).toHaveLength(0);
    expect(getEnrollment(ctx.db)).toBeNull();
  });
});

// --- Downgrade protection ---------------------------------------------------------------------------------------------

describe('a device never changes trust mode because a server says so', () => {
  function reconnectCtx(over: Parameters<typeof seed>[0]) {
    const { store, db } = seed(over);
    const requests: string[] = [];
    const manager = { status: vi.fn(() => ({ state: 'offline', enrollment: getEnrollment(db) })), start: vi.fn(), stop: vi.fn() } as unknown as HubConnectionManager;
    const createTransport = (): HubTransport => ({
      async request(req) {
        requests.push(`${req.method} ${req.path}`);
        if (req.path.endsWith('/hello')) return { status: 200, headers: {}, body: helloBody({ trustMode: undefined, trustDomain: undefined, tls: { spkiSha256: SPKI, nextSpkiSha256: null } }) };
        if (req.path.endsWith('/devices/enroll')) {
          const device = (req.body as { device: { deviceId: string } }).device;
          return { status: 200, headers: {}, body: { deviceId: device.deviceId, environmentId: 'env-1', hubInstanceId: INSTANCE, keyId: 'key-new', registeredAt: NOW.toISOString(), hubRevision: 0 } };
        }
        return { status: 404, headers: {}, body: {} };
      },
    });
    const probe = vi.fn(async () => ({ matches: true, certPem: 'PEM', spki: SPKI }));
    const deps: ReconnectDeps = { db, dpapi: fakeDpapi(), now: () => NOW, device: () => readDeviceRecord(db, CAPABILITIES), manager, createTransport, probe };
    return { store, db, requests, probe, deps, manager };
  }
  const pinnedPairing = formatPairingString({ host: 'old.hub', port: 8443, code: 'ABCD2345', spkiSha256: SPKI });

  it('refuses pinned -> public-ca without a confirmation, before any traffic', async () => {
    const ctx = reconnectCtx({});
    await expect(reconnectDevice(pairing, ctx.deps)).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    expect(ctx.requests).toEqual([]);
    expect(ctx.probe).not.toHaveBeenCalled();
    expect(ctx.manager.stop).not.toHaveBeenCalled();
    expect(getEnrollment(ctx.db)).toMatchObject({ trustMode: 'pinned', trustDomain: null });
  });

  it('refuses public-ca -> pinned and public-ca -> another domain without a matching confirmation', async () => {
    const ctx = reconnectCtx({ hubUrl: `https://${DOMAIN}`, trustMode: 'public-ca', trustDomain: DOMAIN });
    await expect(reconnectDevice(pinnedPairing, ctx.deps)).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    const other = formatPairingString({ trustMode: 'public-ca', host: 'other.example.com', port: 443, code: 'ABCD2345' });
    await expect(reconnectDevice(other, ctx.deps)).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    expect(ctx.requests).toEqual([]);
    expect(ctx.probe).not.toHaveBeenCalled();
    expect(getEnrollment(ctx.db)).toMatchObject({ trustMode: 'public-ca', trustDomain: DOMAIN });
  });

  it('refuses a confirmation for something other than what the pairing string does', async () => {
    const ctx = reconnectCtx({});
    for (const wrong of [{ mode: 'public-ca' as const, domain: 'other.example.com' }, { mode: 'pinned' as const, domain: null }]) {
      await expect(reconnectDevice(pairing, ctx.deps, wrong)).rejects.toMatchObject({ code: 'trust-change-unconfirmed' });
    }
    expect(ctx.requests).toEqual([]);
    expect(getEnrollment(ctx.db)).toMatchObject({ trustMode: 'pinned' });
  });

  it('a same-mode reconnect needs no confirmation and keeps the pinned flow (the pin probe runs)', async () => {
    const ctx = reconnectCtx({});
    await expect(reconnectDevice(pinnedPairing, ctx.deps)).resolves.toBeDefined();
    expect(ctx.probe).toHaveBeenCalledOnce();
    expect(getEnrollment(ctx.db)).toMatchObject({ trustMode: 'pinned' });
  });

  it('a hello that advertises public-ca is shown as an offer and never applied to a pinned device (and the reverse)', async () => {
    const cases = [
      { over: {}, hello: helloBody(), mode: 'pinned', offer: { mode: 'public-ca', domain: DOMAIN } },
      { over: { hubUrl: `https://${DOMAIN}`, trustMode: 'public-ca' as const, trustDomain: DOMAIN }, hello: helloBody({ trustMode: undefined, trustDomain: undefined }), mode: 'public-ca', offer: { mode: 'pinned', domain: null } },
    ];
    for (const c of cases) {
      const { db } = seed(c.over);
      const manager = createHubConnectionManager({
        db, dpapi: fakeDpapi(), now: () => NOW, device: () => readDeviceRecord(db, CAPABILITIES), timings: { backoffMinMs: 600_000, backoffMaxMs: 600_000 },
        createTransport: () => ({ request: async (req) => (req.path.endsWith('/hello') ? { status: 200, headers: {}, body: c.hello } : { status: 404, headers: {}, body: {} }) }),
      });
      manager.start();
      for (let i = 0; i < 100 && !manager.status().trustOffer; i++) await new Promise((r) => setTimeout(r, 20));
      expect(manager.status().trustOffer).toEqual(c.offer);
      manager.stop();
      expect(getEnrollment(db)).toMatchObject({ trustMode: c.mode });
    }
  });
});

describe('the connection manager enforces the stored domain end to end', () => {
  it('serves a call over a CA-valid chain for the stored domain and refuses a self-signed server for it', async () => {
    const good = await serve(ca.issue({ names: [DOMAIN] }), jsonHub(helloBody()).handler);
    const bad = await serve(makeCert('self'), jsonHub(helloBody()).handler);
    for (const [server, ok] of [[good, true], [bad, false]] as const) {
      const { db } = seed({ hubUrl: `https://${DOMAIN}:${server.port}`, trustMode: 'public-ca', trustDomain: DOMAIN });
      const manager = createHubConnectionManager({
        db, dpapi: fakeDpapi(), now: () => NOW, device: () => readDeviceRecord(db, CAPABILITIES), publicCaTestSeam: ca.seam('127.0.0.1'),
      });
      const outcome = manager.call((api) => api.hello());
      if (ok) await expect(outcome).resolves.toMatchObject({ hubInstanceId: INSTANCE });
      else await expect(outcome).rejects.toBeInstanceOf(HubManagerError);
    }
    expect(bad.requests).toHaveLength(0);
  });

  it('refuses to dial a plain-http or other-host origin stored for a public-ca enrollment', async () => {
    for (const hubUrl of ['http://hub.example.com', 'https://elsewhere.example.com']) {
      const { db } = seed({ hubUrl, trustMode: 'public-ca', trustDomain: DOMAIN });
      const createTransport = vi.fn();
      const manager = createHubConnectionManager({ db, dpapi: fakeDpapi(), now: () => NOW, device: () => readDeviceRecord(db, CAPABILITIES), createTransport });
      await expect(manager.call((api) => api.hello())).rejects.toMatchObject({ code: 'trust-origin-refused' });
      expect(createTransport).not.toHaveBeenCalled();
    }
  });
});
