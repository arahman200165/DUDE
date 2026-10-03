import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { makeCert, startHttps } from '../testing/test-tls.js';
import type { TestCert } from '../testing/test-tls.js';
import { HUB_MAX_RESPONSE_BYTES, PIN_MISMATCH_CODE, createPinnedTransport } from './pinned-transport.js';
import { probeLocalHub, probePin } from './probe.js';

const servers: Array<{ close(): Promise<void> }> = [];
const track = <T extends { close(): Promise<void> }>(s: T): T => { servers.push(s); return s; };
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); });

const get = (port: number, ca: string[], pins: string[], path = '/x'): Promise<unknown> =>
  createPinnedTransport({ host: '127.0.0.1', port, ca, pins }, 5_000).request({ method: 'GET', path });

describe('pinned transport', () => {
  it('accepts the pinned certificate and sends JSON requests', async () => {
    const a = makeCert('a');
    const server = track(await startHttps(a));
    await expect(get(server.port, [a.certPem], [a.spki])).resolves.toMatchObject({ status: 200, body: { ok: true } });
  });

  it('rejects a server whose SPKI is not pinned even when ca would accept it', async () => {
    const a = makeCert('a');
    const b = makeCert('b');
    const server = track(await startHttps(b));
    await expect(get(server.port, [a.certPem, b.certPem], [a.spki])).rejects.toMatchObject({ code: PIN_MISMATCH_CODE });
    expect(server.requests).toHaveLength(0);
  });

  it('accepts the next pin during rotation, and still rejects it when only the active pin is held', async () => {
    const active = makeCert('active');
    const next = makeCert('next');
    const server = track(await startHttps(next));
    await expect(get(server.port, [active.certPem, next.certPem], [active.spki, next.spki])).resolves.toMatchObject({ status: 200 });
    await expect(get(server.port, [active.certPem, next.certPem], [active.spki])).rejects.toMatchObject({ code: PIN_MISMATCH_CODE });
  });

  it('treats the pin as the only identity: a pinned certificate outside any trust chain is accepted', async () => {
    const a = makeCert('a');
    const other = makeCert('other');
    const server = track(await startHttps(a));
    await expect(get(server.port, [other.certPem], [a.spki])).resolves.toMatchObject({ status: 200 });
    await expect(createPinnedTransport({ host: '127.0.0.1', port: server.port, pins: [a.spki] }, 5_000).request({ method: 'GET', path: '/x' })).resolves.toMatchObject({ status: 200 });
  });

  it('calls onPeerSpki once on success and never on a mismatch', async () => {
    const a = makeCert('a');
    const b = makeCert('b');
    const server = track(await startHttps(a));
    const seen: string[] = [];
    await createPinnedTransport({ host: '127.0.0.1', port: server.port, pins: [a.spki], onPeerSpki: (s) => seen.push(s) }, 5_000).request({ method: 'GET', path: '/x' });
    expect(seen).toEqual([a.spki]);
    const bad: string[] = [];
    await expect(createPinnedTransport({ host: '127.0.0.1', port: server.port, pins: [b.spki], onPeerSpki: (s) => bad.push(s) }, 5_000).request({ method: 'GET', path: '/x' })).rejects.toMatchObject({ code: PIN_MISMATCH_CODE });
    expect(bad).toEqual([]);
  });

  it('writes zero application bytes to a peer whose pin does not match', async () => {
    const a = makeCert('a');
    const b = makeCert('b');
    const received: number[] = [];
    const server = tls.createServer({ key: b.keyPem, cert: b.certPem }, (socket) => {
      socket.on('data', (chunk) => received.push(chunk.length));
      socket.on('error', () => undefined);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    track({ close: () => new Promise<void>((resolve) => server.close(() => resolve())) });
    const port = (server.address() as AddressInfo).port;
    await expect(createPinnedTransport({ host: '127.0.0.1', port, pins: [a.spki] }, 5_000).request({ method: 'POST', path: '/secret', headers: { authorization: 'Bearer secret' }, body: { x: 1 } })).rejects.toMatchObject({ code: PIN_MISMATCH_CODE });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toEqual([]);
  });

  it('refuses non-JSON and oversized responses', async () => {
    const a = makeCert('a');
    const text = track(await startHttps(a, (_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html>'); }));
    await expect(get(text.port, [a.certPem], [a.spki])).rejects.toMatchObject({ code: 'not-json' });
    const big = track(await startHttps(a, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(`"${'x'.repeat(HUB_MAX_RESPONSE_BYTES + 10)}"`); }));
    await expect(get(big.port, [a.certPem], [a.spki])).rejects.toBeDefined();
  });
});

describe('pin probe', () => {
  async function rawServer(cert: TestCert): Promise<{ port: number; received: number[]; close(): Promise<void> }> {
    const received: number[] = [];
    const server = tls.createServer({ key: cert.keyPem, cert: cert.certPem }, (socket) => {
      socket.on('data', (chunk) => received.push(chunk.length));
      socket.on('error', () => undefined);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as AddressInfo).port, received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  }

  it('reports the match and the certificate while writing no application bytes', async () => {
    const a = makeCert('a');
    const server = track(await rawServer(a));
    const result = await probePin('127.0.0.1', server.port, a.spki);
    expect(result).toMatchObject({ matches: true, spki: a.spki });
    expect(result.certPem).toContain('BEGIN CERTIFICATE');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.received).toEqual([]);
  });

  it('reports a mismatch without sending anything', async () => {
    const a = makeCert('a');
    const b = makeCert('b');
    const server = track(await rawServer(b));
    const result = await probePin('127.0.0.1', server.port, a.spki);
    expect(result.matches).toBe(false);
    expect(result.spki).toBe(b.spki);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.received).toEqual([]);
  });

  it('rejects when nothing listens', async () => {
    await expect(probePin('127.0.0.1', 1, 'A'.repeat(43), 2_000)).rejects.toBeDefined();
  });

  it('local discovery reads public hello fields and reports not found otherwise', async () => {
    const a = makeCert('a');
    const hello = {
      service: 'dude-hub', protocolVersion: 1, minClientProtocol: 1, hubVersion: '0.0.0', hubInstanceId: '123e4567-e89b-42d3-a456-426614174000',
      environmentId: null, bootstrapped: true, tls: { spkiSha256: a.spki, nextSpkiSha256: null },
    };
    const seenAuth: Array<string | undefined> = [];
    const server = track(await startHttps(a, (req, res) => {
      seenAuth.push(req.headers.authorization);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(hello));
    }));
    await expect(probeLocalHub(server.port)).resolves.toEqual({
      found: true, bootstrapped: true, hubInstanceId: hello.hubInstanceId, spkiSha256: a.spki, compatibility: 'compatible', hubVersion: hello.hubVersion,
    });
    expect(seenAuth).toEqual([undefined]);
    await expect(probeLocalHub(1, 1_000)).resolves.toMatchObject({ found: false });
  });
});
