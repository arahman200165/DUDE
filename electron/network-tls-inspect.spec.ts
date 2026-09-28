import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type TlsOptions } from 'node:tls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { setTrustStoresForTesting, summarizeCertificate, type HandshakeResult } from './network-tls';
import { inspectTls, weaknessReport } from './network-tls-inspect';
import { parseServerRecords } from './network-tls-records';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name), 'utf8');
const der = (name: string) => Buffer.from(fixture(name).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); setTrustStoresForTesting(null); });

async function server(options: TlsOptions = {}): Promise<number> {
  const tls = createServer({ key: fixture('leaf-key.pem'), cert: `${fixture('leaf.pem')}${fixture('int.pem')}`, ...options }, (socket) => socket.end());
  tls.on('tlsClientError', () => {});
  await new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve));
  closers.push(() => tls.close());
  return (tls.address() as AddressInfo).port;
}

describe('TLS Connection Inspector', () => {
  it('reports both trust verdicts, the hostname match, and a handshake timeline', async () => {
    setTrustStoresForTesting({ mozilla: [fixture('root.pem')], windows: [] });
    const port = await server({ ALPNProtocols: ['h2'] });
    const result = await inspectTls({ kind: 'tls-inspector', target: '127.0.0.1', port, sni: 'localhost', alpn: ['h2', 'http/1.1'] }, new AbortController().signal, () => {});
    expect(result.handshake.alpn).toBe('h2');
    expect(result.trust.map((verdict) => `${verdict.store}:${verdict.trusted}`)).toEqual(['mozilla:true', 'windows:false']);
    expect(result.hostname.reasons.join(' ')).toMatch(/IP/); // connecting by 127.0.0.1, cert is for localhost
    expect(result.timeline?.some((event) => event.handshakeType === 'ServerHello')).toBe(true);
  });

  it('compares SNI variants', async () => {
    setTrustStoresForTesting({ mozilla: [fixture('root.pem')], windows: [] });
    const port = await server();
    const result = await inspectTls({ kind: 'tls-inspector', target: '127.0.0.1', port, sniNames: ['localhost', 'other.dude.test'] }, new AbortController().signal, () => {});
    expect(result.sniComparison?.map((entry) => entry.sni)).toEqual([false, 'localhost', 'other.dude.test']);
    expect(result.sniComparison?.every((entry) => entry.leafFingerprint)).toBe(true);
  });
});

describe('weakness report (configuration only)', () => {
  const base = (overrides: Partial<HandshakeResult>): HandshakeResult => ({
    host: 'x', port: 443, address: null, servername: 'x', protocol: 'TLSv1.2', cipher: { name: 'x', standardName: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256', version: 'TLSv1.2' },
    alpn: null, ephemeralKey: { type: 'ECDH', name: 'X25519', size: 253 }, authorizedByNode: true, authorizationError: null,
    chain: [summarizeCertificate(der('leaf.pem'))], ocspStapleBase64: null, clientCertificateRequested: false, acceptableClientCAs: [], sessionReused: false, peerFinishedHex: null,
    timings: { dnsMs: null, tcpMs: 1, tlsMs: 2, totalMs: 2 }, ...overrides,
  });
  it('flags legacy versions, weak ciphers, weak DH, and passes a modern config', () => {
    expect(weaknessReport(base({ protocol: 'TLSv1' })).find((f) => f.id === 'legacy-version')?.status).toBe('fail');
    expect(weaknessReport(base({ cipher: { name: 'x', standardName: 'TLS_RSA_WITH_RC4_128_SHA', version: 'TLSv1.2' } })).find((f) => f.id === 'rc4')?.status).toBe('fail');
    expect(weaknessReport(base({ cipher: { name: 'x', standardName: 'TLS_RSA_WITH_3DES_EDE_CBC_SHA', version: 'TLSv1.2' } })).find((f) => f.id === '3des')?.status).toBe('fail');
    expect(weaknessReport(base({ ephemeralKey: { type: 'DH', size: 1024 } })).find((f) => f.id === 'weak-dh')?.status).toBe('fail');
    const modern = weaknessReport(base({ protocol: 'TLSv1.3' }));
    expect(modern.every((f) => f.status !== 'fail')).toBe(true);
    expect(modern.find((f) => f.id === 'fs')?.status).toBe('pass');
  });
});

describe('handshake record parser', () => {
  it('reads a ClientHello and a CertificateRequest from raw TLS 1.2 bytes', () => {
    const record = (type: number, body: Buffer) => Buffer.concat([Buffer.from([type, 3, 3, body.length >> 8, body.length & 0xff]), body]);
    const handshake = (hsType: number, len = 4) => Buffer.concat([Buffer.from([hsType, 0, 0, len]), Buffer.alloc(len)]);
    const bytes = Buffer.concat([record(22, Buffer.concat([handshake(11, 8), handshake(13, 6)])), record(21, Buffer.from([2, 116]))]);
    const parsed = parseServerRecords([{ bytes, atMs: 5 }]);
    expect(parsed.events.map((event) => event.handshakeType ?? event.contentType)).toEqual(['Certificate', 'CertificateRequest', 'Alert']);
    expect(parsed.certificateRequested).toBe(true);
    expect(parsed.alert).toEqual({ level: 'fatal', description: 'certificate_required' });
  });
});
