import { describe, expect, it, vi } from 'vitest';
import { FAKE_HUB_DIAGNOSTICS } from '../../../../core/platform/testing/fake-hub';
import { assessTrust, clockSkew, matchOrigin, pemToDer, probeRealtime, realtimeUrl, serviceWorkerLabel, type SocketLike } from './browser-checks';

const SW_NONE = { supported: true, controlling: false, registered: false };

describe('assessTrust', () => {
  it('treats a registered service worker as proof the certificate is trusted', () => {
    expect(assessTrust({ isSecureContext: true, protocol: 'https:', serviceWorker: { ...SW_NONE, registered: true } }).verdict).toBe('trusted');
    expect(assessTrust({ isSecureContext: true, protocol: 'https:', serviceWorker: { ...SW_NONE, controlling: true } }).verdict).toBe('trusted');
  });
  it('says the certificate may not be trusted when there is no worker, and points at the root', () => {
    const result = assessTrust({ isSecureContext: true, protocol: 'https:', serviceWorker: SW_NONE });
    expect(result.verdict).toBe('unknown');
    expect(result.summary).toBe('Certificate may not be trusted');
    expect(result.detail).toContain("Hub's root");
  });
  it('reports a non-secure page as insecure', () => {
    expect(assessTrust({ isSecureContext: false, protocol: 'http:', serviceWorker: SW_NONE }).verdict).toBe('insecure');
  });
  it('labels the service worker states', () => {
    expect(serviceWorkerLabel({ supported: false, controlling: false, registered: false })).toBe('Not supported');
    expect(serviceWorkerLabel(SW_NONE)).toBe('None');
    expect(serviceWorkerLabel({ supported: true, controlling: false, registered: true })).toContain('not controlling');
    expect(serviceWorkerLabel({ supported: true, controlling: true, registered: true })).toContain('controlling this page');
  });
});

describe('clockSkew', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  it('warns beyond 60 seconds either way', () => {
    expect(clockSkew('Thu, 01 Jan 2026 00:01:01 GMT', now)).toEqual({ seconds: 61, warn: true });
    expect(clockSkew('Wed, 31 Dec 2025 23:58:00 GMT', now)).toEqual({ seconds: -120, warn: true });
  });
  it('does not warn at the 60 second boundary or when the header is unusable', () => {
    expect(clockSkew('Thu, 01 Jan 2026 00:01:00 GMT', now)).toEqual({ seconds: 60, warn: false });
    expect(clockSkew(null, now)).toEqual({ seconds: null, warn: false });
    expect(clockSkew('garbage', now)).toEqual({ seconds: null, warn: false });
  });
});

describe('matchOrigin', () => {
  const report = FAKE_HUB_DIAGNOSTICS;
  it('recognizes the canonical origin, a configured name with the port, and an unknown origin', () => {
    expect(matchOrigin('https://hub.local:47600', report)).toBe('canonical');
    expect(matchOrigin('https://192.168.1.20:47600', report)).toBe('name');
    expect(matchOrigin('https://evil.example', report)).toBe('unknown');
    expect(matchOrigin('https://hub.local', report)).toBe('unknown');
  });
  it('recognizes the proxy public origin and the default port', () => {
    const proxied = { exposure: { ...report.exposure, port: 443, canonicalOrigin: null, proxy: { trusted: ['10.0.0.2'], publicOrigin: 'https://dude.example.com' } } };
    expect(matchOrigin('https://dude.example.com/', proxied)).toBe('proxy');
    expect(matchOrigin('https://hub.local', proxied)).toBe('name');
  });
  it('asks for a sign-in when there is no report', () => {
    expect(matchOrigin('https://hub.local:47600', null)).toBe('no-report');
  });
});

describe('probeRealtime', () => {
  function fakeSocket(): SocketLike & { sent: string[]; closed: boolean } {
    const socket = { onopen: null, onmessage: null, onerror: null, onclose: null, sent: [] as string[], closed: false, send(d: string) { this.sent.push(d); }, close() { this.closed = true; } };
    return socket as unknown as SocketLike & { sent: string[]; closed: boolean };
  }

  it('sends hello, resolves on welcome and closes', async () => {
    const socket = fakeSocket();
    const result = probeRealtime(() => socket, { now: (() => { let t = 0; return () => (t += 25); })() });
    socket.onopen?.({});
    expect(JSON.parse(socket.sent[0])).toMatchObject({ type: 'hello', protocolVersion: expect.any(Number), minHubProtocol: expect.any(Number) });
    socket.onmessage?.({ data: JSON.stringify({ type: 'welcome' }) });
    await expect(result).resolves.toMatchObject({ ok: true, ms: 25 });
    expect(socket.closed).toBe(true);
  });

  it('times out after the limit without a welcome', async () => {
    vi.useFakeTimers();
    try {
      const socket = fakeSocket();
      const result = probeRealtime(() => socket, { timeoutMs: 5000 });
      await vi.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toMatchObject({ ok: false, ms: null });
      expect(socket.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts an unauthorized close as reachable and other closes, errors and throws as failures', async () => {
    const a = fakeSocket();
    const unauthorized = probeRealtime(() => a);
    a.onclose?.({ code: 4001 });
    await expect(unauthorized).resolves.toMatchObject({ ok: true });
    const b = fakeSocket();
    const closed = probeRealtime(() => b);
    b.onclose?.({ code: 1006 });
    await expect(closed).resolves.toMatchObject({ ok: false });
    const c = fakeSocket();
    const errored = probeRealtime(() => c);
    c.onerror?.({});
    await expect(errored).resolves.toMatchObject({ ok: false });
    await expect(probeRealtime(() => { throw new Error('blocked'); })).resolves.toMatchObject({ ok: false, detail: 'blocked' });
  });

  it('builds the same-origin realtime URL', () => {
    expect(realtimeUrl({ protocol: 'https:', host: 'hub.local:47600' })).toBe('wss://hub.local:47600/api/v1/realtime');
    expect(realtimeUrl({ protocol: 'http:', host: 'localhost:4200' })).toBe('ws://localhost:4200/api/v1/realtime');
  });
});

describe('pemToDer', () => {
  it('decodes a PEM certificate body and rejects anything else', () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${btoa('abc')}\n-----END CERTIFICATE-----`;
    expect(Array.from(pemToDer(pem) ?? [])).toEqual([97, 98, 99]);
    expect(pemToDer('nope')).toBeNull();
  });
});
