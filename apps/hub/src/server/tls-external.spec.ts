import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProxyPins, proxyPinSpkis, resolveProxyPin } from '../tls/proxy-pins.js';
import { createTlsRotation, acknowledgeTlsPin } from '../tls/rotation.js';
import { generateSelfSigned, spkiSha256 } from '../tls/self-signed.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

const pinOf = (c: string): string => c.repeat(43);

describe('imported certificate source and proxy pins on the public routes', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  it('reports source imported once an imported certificate is the ACTIVE pin, and not before', async () => {
    const db = h.hub.hub.db;
    const swaps: string[] = [];
    const rotation = createTlsRotation({ db, tlsDir: h.hub.paths.tlsDir, hubInstanceId: h.hub.hub.hubInstanceId, now: () => h.clock.t, applySecureContext: (c) => void swaps.push(c.cert) });
    const imported = generateSelfSigned({ hubInstanceId: 'abcdef12-test', extraNames: ['hub.example.com'] });
    mkdirSync(h.hub.paths.tlsDir, { recursive: true });
    const staged = rotation.stageExternal({ keyPem: imported.keyPem, certChainPem: imported.certPem, source: 'imported' });
    const next = await h.call('GET', '/tls/certificates', { noOrigin: true });
    expect(next.json.source).toBe('self-signed'); // the ACTIVE leaf is still the original
    expect(next.json.next.spkiSha256).toBe(staged.spkiSha256);
    const preview = rotation.previewActivate();
    rotation.applyActivate({ confirmToken: preview.confirmToken });
    const after = await h.call('GET', '/tls/certificates', { noOrigin: true });
    expect(after.json.source).toBe('imported');
    expect(after.json.active.spkiSha256).toBe(spkiSha256(imported.certPem));
    expect(after.json.next).toBeNull();
    expect(swaps).toHaveLength(1);
  });

  it('advertises proxy pins (active and next) on /hello and the certificates route, and an empty list otherwise', async () => {
    const db = h.hub.hub.db;
    const before = await h.call('GET', '/hello', { noOrigin: true });
    expect(before.json.tls.proxySpkiSha256).toEqual([]);
    const announced: string[] = [];
    const proxy = createProxyPins({ db, now: () => h.clock.t, announceNext: (s) => void announced.push(s) });
    proxy.add(pinOf('A'));
    expect(announced).toEqual([pinOf('A')]);
    const staged = await h.call('GET', '/hello', { noOrigin: true });
    expect(staged.json.tls.proxySpkiSha256).toEqual([pinOf('A')]);
    expect(staged.json.tls.spkiSha256).not.toBe(pinOf('A'));
    const certs = await h.call('GET', '/tls/certificates', { noOrigin: true });
    expect(certs.json.proxySpkiSha256).toEqual([pinOf('A')]);
    expect(proxyPinSpkis(db)).toEqual([pinOf('A')]);
  });

  it('proxy pins: devices acknowledge a staged pin, activation waits for them unless forced, and one active plus one next at most', async () => {
    const db = h.hub.hub.db;
    const proxy = createProxyPins({ db, now: () => h.clock.t });
    const { device } = await enrolled(h, owner);
    expect(proxy.status().next?.spkiSha256).toBe(pinOf('A'));
    expect(proxy.status().pending.map((d) => d.deviceId)).toEqual([device.deviceId]);
    expect(() => proxy.previewActivate()).toThrow(/have not acknowledged/);
    expect(() => proxy.add(pinOf('B'))).toThrow(/already staged/);

    expect(acknowledgeTlsPin(db, device.deviceId, pinOf('Z'), h.clock.t)).toBe(false); // unknown pin
    expect(acknowledgeTlsPin(db, device.deviceId, pinOf('A'), h.clock.t)).toBe(true);
    expect(acknowledgeTlsPin(db, device.deviceId, pinOf('A'), h.clock.t)).toBe(false); // already acked
    expect(proxy.status()).toMatchObject({ acked: [device.deviceId], pending: [] });

    const preview = proxy.previewActivate();
    expect(preview.summary).toMatchObject({ nextProxySpkiSha256: pinOf('A'), activeProxySpkiSha256: null });
    const done = proxy.applyActivate({ confirmToken: preview.confirmToken });
    expect(done).toMatchObject({ activated: true, spkiSha256: pinOf('A'), previousSpkiSha256: null });
    expect(proxy.status()).toMatchObject({ active: { spkiSha256: pinOf('A') }, next: null });
    expect((await h.call('GET', '/hello', { noOrigin: true })).json.tls.proxySpkiSha256).toEqual([pinOf('A')]);

    // A second pin is staged next; with an unacknowledged device a forced activation replaces the active one.
    proxy.add(pinOf('B'));
    expect((await h.call('GET', '/hello', { noOrigin: true })).json.tls.proxySpkiSha256).toEqual([pinOf('A'), pinOf('B')]);
    const forced = proxy.previewActivate({ force: true });
    expect(forced.summary.unacknowledged).toHaveLength(1);
    expect(proxy.applyActivate({ confirmToken: forced.confirmToken, force: true })).toMatchObject({ previousSpkiSha256: pinOf('A') });
    expect(proxyPinSpkis(db)).toEqual([pinOf('B')]);

    const audits = (db.prepare("SELECT event, detail_json AS detail FROM audit_events WHERE event LIKE 'tls.proxy-pin-%' ORDER BY seq").all() as Array<{ event: string; detail: string }>);
    expect(audits.map((a) => a.event)).toEqual(['tls.proxy-pin-staged', 'tls.proxy-pin-activated', 'tls.proxy-pin-staged', 'tls.proxy-pin-activated']);
    expect(JSON.parse(audits[0]!.detail)).toEqual({ spki: pinOf('A') });
  });

  it('refuses the Hub\'s own pin and a malformed pin, and resolves a PEM certificate to its SPKI', () => {
    const db = h.hub.hub.db;
    const proxy = createProxyPins({ db, now: () => h.clock.t });
    const own = (db.prepare("SELECT spki_sha256 AS s FROM tls_pins WHERE state = 'active'").get() as { s: string }).s;
    expect(() => proxy.add(own)).toThrow(/Hub's own/);
    expect(() => proxy.add('short')).toThrow(/SPKI pin/);
    const cert = generateSelfSigned({ hubInstanceId: 'abcdef12-test' }).certPem;
    expect(resolveProxyPin(cert)).toMatchObject({ spkiSha256: spkiSha256(cert) });
    expect(resolveProxyPin(` ${pinOf('Q')}\n`)).toEqual({ spkiSha256: pinOf('Q'), certPem: null });
  });
});
