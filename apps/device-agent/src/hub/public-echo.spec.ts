import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HubApiError, HubProtocolError } from '@dude/api-client';
import { parseHubPublicUrl } from '@dude/contracts';
import { makeCert, startHttps } from '../testing/test-tls.js';
import { HubManagerError } from './errors.js';
import { createPinnedTransport, spkiSha256Of } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';
import { ECHO_MAX_RESPONSE_BYTES, reachabilityEchoViaPublicUrl } from './public-echo.js';

const servers: Array<{ close(): Promise<void> }> = [];
const track = <T extends { close(): Promise<void> }>(s: T): T => { servers.push(s); return s; };
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); });

const ECHO = { observed: { scope: 'public', viaProxy: false }, host: 'hub.example.com', hostMatchesConfiguredName: true, verified: true, reason: 'ok', at: '2026-10-04T00:00:00.000Z' };
const json = (body: unknown) => (_req: unknown, res: { setHeader(n: string, v: string): void; end(b: string): void }): void => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
const withToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => fn('ddt_test-token');
const run = (publicUrl: string, pins: string[], extra: { makeTransport?: (t: PinnedTarget) => ReturnType<typeof createPinnedTransport> } = {}) =>
  reachabilityEchoViaPublicUrl({ publicUrl, pins, withToken, makeTransport: extra.makeTransport ?? ((t) => createPinnedTransport(t)) });

describe('parseHubPublicUrl', () => {
  it.each([
    ['https://hub.example.com', 'https://hub.example.com', 443],
    ['https://hub.example.com/', 'https://hub.example.com', 443],
    ['https://Hub.Example.com:8443', 'https://hub.example.com:8443', 8443],
    ['https://203.0.113.5:8443', 'https://203.0.113.5:8443', 8443],
    ['https://[2001:db8::1]', 'https://[2001:db8::1]', 443],
    ['https://[2001:db8::1]:9000', 'https://[2001:db8::1]:9000', 9000],
    ['https://localhost:47600', 'https://localhost:47600', 47600],
  ])('accepts %s', (input, origin, port) => {
    expect(parseHubPublicUrl(input)).toMatchObject({ ok: true, origin, port });
  });

  it.each([
    'http://hub.example.com', 'https://user@hub.example.com', 'https://user:pw@hub.example.com', 'https://hub.example.com/path', 'https://hub.example.com/a/',
    'https://hub.example.com?x=1', 'https://hub.example.com/?x=1', 'https://hub.example.com#frag', '', 'hub.example.com', 'not a url', 'https://', 'https://:443',
    `https://${'a'.repeat(250)}.com`, 'https://hub.example.com:0', 'https://hub.example.com:65536', 'https://hub.example.com:abc', 'https://hub.example.com:', 'https://[::1',
    'https://[zz::1]', 'https://999.1.1.1', 'https://1.2.3', 'https://exa mple.com', 'https://-bad.example.com', 'https://under_score.example.com', 'ftp://hub.example.com',
  ])('rejects %j', (input) => {
    expect(parseHubPublicUrl(input)).toMatchObject({ ok: false });
  });

  it('rejects non-strings and over-long input', () => {
    expect(parseHubPublicUrl(undefined)).toMatchObject({ ok: false });
    expect(parseHubPublicUrl(5)).toMatchObject({ ok: false });
    expect(parseHubPublicUrl(`https://${'a'.repeat(300)}`)).toMatchObject({ ok: false });
  });
});

describe('reachability echo over a public URL', () => {
  it('uses the device token and the pin, sends GET /api/v1/reachability/echo and reports the round trip', async () => {
    const a = makeCert('a');
    const server = track(await startHttps(a, json(ECHO)));
    const result = await run(`https://127.0.0.1:${server.port}`, [a.spki]);
    expect(result).toMatchObject({ ...ECHO, rttMs: expect.any(Number) });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({ method: 'GET', url: '/api/v1/reachability/echo' });
    expect(server.requests[0]!.headers.authorization).toBe('Bearer ddt_test-token');
  });

  it('accepts a certificate the system CA store vouches for even when it is not pinned', async () => {
    const a = makeCert('a');
    const other = makeCert('other');
    const server = track(await startHttps(a, json(ECHO)));
    const original = tls.getCACertificates('default');
    tls.setDefaultCACertificates([...original, a.certPem]);
    try {
      await expect(run(`https://127.0.0.1:${server.port}`, [other.spki])).resolves.toMatchObject({ verified: true });
    } finally {
      tls.setDefaultCACertificates(original);
    }
  });

  it('refuses a system-trusted certificate that does not name the requested host', async () => {
    // Trusted by the default store, but issued for another name only (the Hub's own generator always adds loopback names, so use openssl).
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-wrong-name-'));
    try {
      const keyFile = path.join(dir, 'k.pem');
      const certFile = path.join(dir, 'c.pem');
      try {
        execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '2', '-subj', '/CN=elsewhere.example.com', '-addext', 'subjectAltName=DNS:elsewhere.example.com'], { stdio: 'ignore' });
      } catch {
        return; // openssl is not available here: the in-process generator cannot produce a cert without loopback names
      }
      const certPem = readFileSync(certFile, 'utf8');
      const wrong = { keyPem: readFileSync(keyFile, 'utf8'), certPem, spki: spkiSha256Of(certPem) };
      const other = makeCert('other');
      const server = track(await startHttps(wrong, json(ECHO)));
      const original = tls.getCACertificates('default');
      tls.setDefaultCACertificates([...original, wrong.certPem]);
      try {
        const error = await run(`https://127.0.0.1:${server.port}`, [other.spki]).catch((e: unknown) => e);
        expect(error).toMatchObject({ code: 'untrusted-tls' });
        expect(server.requests).toHaveLength(0);
      } finally {
        tls.setDefaultCACertificates(original);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails untrusted-tls when the certificate is not system-trusted and not pinned', async () => {
    const a = makeCert('a');
    const other = makeCert('other');
    const server = track(await startHttps(a, json(ECHO)));
    const error = await run(`https://127.0.0.1:${server.port}`, [other.spki]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HubManagerError);
    expect(error).toMatchObject({ code: 'untrusted-tls' });
    expect(server.requests).toHaveLength(0);
  });

  it('writes no application bytes to an untrusted peer', async () => {
    const a = makeCert('a');
    const b = makeCert('b');
    const received: number[] = [];
    const server = tls.createServer({ key: b.keyPem, cert: b.certPem }, (socket) => { socket.on('data', (c) => received.push(c.length)); socket.on('error', () => undefined); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    track({ close: () => new Promise<void>((resolve) => server.close(() => resolve())) });
    const port = (server.address() as AddressInfo).port;
    await expect(run(`https://127.0.0.1:${port}`, [a.spki])).rejects.toMatchObject({ code: 'untrusted-tls' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toEqual([]);
  });

  it('rejects a malformed address before any network use', async () => {
    let built = false;
    await expect(run('http://hub.example.com', [], { makeTransport: (t) => { built = true; return createPinnedTransport(t); } })).rejects.toMatchObject({ code: 'invalid-url' });
    expect(built).toBe(false);
  });

  it('does not follow redirects', async () => {
    const a = makeCert('a');
    const target = track(await startHttps(a, json(ECHO)));
    const server = track(await startHttps(a, (_req, res) => { res.statusCode = 302; res.setHeader('location', `https://127.0.0.1:${target.port}/api/v1/reachability/echo`); res.end(); }));
    await expect(run(`https://127.0.0.1:${server.port}`, [a.spki])).rejects.toBeInstanceOf(HubProtocolError);
    expect(target.requests).toHaveLength(0);
  });

  it('surfaces the Hub error envelope (a rejected device token) as an API error', async () => {
    const a = makeCert('a');
    const server = track(await startHttps(a, (_req, res) => { res.statusCode = 401; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { code: 'unauthorized', message: 'No.' } })); }));
    await expect(run(`https://127.0.0.1:${server.port}`, [a.spki])).rejects.toBeInstanceOf(HubApiError);
  });

  it('refuses a response larger than 16 KiB', async () => {
    const a = makeCert('a');
    const server = track(await startHttps(a, json({ ...ECHO, reason: 'x'.repeat(ECHO_MAX_RESPONSE_BYTES + 10) })));
    await expect(run(`https://127.0.0.1:${server.port}`, [a.spki])).rejects.toMatchObject({ code: 'hub-unreachable' });
  });

  it('times out when the Hub does not answer', async () => {
    const a = makeCert('a');
    const server = track(await startHttps(a, () => undefined));
    await expect(run(`https://127.0.0.1:${server.port}`, [a.spki], { makeTransport: (t) => createPinnedTransport(t, 300) })).rejects.toMatchObject({ code: 'hub-unreachable' });
  });

  it('asks the transport for the public-name target with a 10 s timeout and a 16 KiB cap', async () => {
    const a = makeCert('a');
    const server = track(await startHttps(a, json(ECHO)));
    let seen: PinnedTarget | undefined;
    await run(`https://127.0.0.1:${server.port}`, [a.spki], { makeTransport: (t) => { seen = t; return createPinnedTransport(t); } });
    expect(seen).toMatchObject({ host: '127.0.0.1', port: server.port, pins: [a.spki], allowSystemTrust: true, timeoutMs: 10_000, maxResponseBytes: 16 * 1024 });
  });
});
