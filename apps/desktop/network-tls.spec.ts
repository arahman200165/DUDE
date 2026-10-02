import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type TlsOptions } from 'node:tls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { analyzeHostname, chainDerFromSummaries, expiryStatus, setTrustStoresForTesting, summarizeCertificate, tlsHandshake, validateChain } from './network-tls';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name), 'utf8');
const der = (name: string) => Buffer.from(fixture(name).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); setTrustStoresForTesting(null); });

async function server(options: TlsOptions): Promise<number> {
  const tls = createServer({ key: fixture('leaf-key.pem'), cert: `${fixture('leaf.pem')}${fixture('int.pem')}`, ...options }, (socket) => socket.end());
  tls.on('tlsClientError', () => {});
  await new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve));
  closers.push(() => tls.close());
  return (tls.address() as AddressInfo).port;
}

describe('live TLS handshake', () => {
  it('reports protocol, cipher, ALPN, timings, and the full presented chain', async () => {
    const port = await server({ ALPNProtocols: ['h2', 'http/1.1'] });
    const chunks: number[] = [];
    const result = await tlsHandshake({ host: '127.0.0.1', port, servername: 'localhost', alpn: ['h2', 'http/1.1'], onServerBytes: (chunk) => chunks.push(chunk.length) }, new AbortController().signal);
    expect(result.protocol).toMatch(/TLSv1\.[23]/);
    expect(result.alpn).toBe('h2');
    expect(result.cipher?.standardName).toMatch(/^TLS_/);
    expect(result.chain.map((entry) => entry.subject)).toEqual(['CN=localhost', 'CN=DUDE Test Intermediate']);
    expect(result.chain[0].subjectAltName).toContain('DNS:*.dude.test');
    expect(result.chain[0].ocspUrls).toEqual(['http://127.0.0.1:1/ocsp']);
    expect(result.chain[0].crlUrls).toEqual(['http://127.0.0.1:1/int.crl']);
    expect(result.chain[0].keyDetail).toBe('2048-bit');
    expect(result.authorizedByNode).toBe(false);
    expect(result.timings.tcpMs).not.toBeNull();
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('pins a TLS version range', async () => {
    const port = await server({ maxVersion: 'TLSv1.2' });
    const result = await tlsHandshake({ host: '127.0.0.1', port, servername: 'localhost', minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' }, new AbortController().signal);
    expect(result.protocol).toBe('TLSv1.2');
    await expect(tlsHandshake({ host: '127.0.0.1', port, servername: 'localhost', minVersion: 'TLSv1.3' }, new AbortController().signal)).rejects.toThrow();
  });

  it('presents a session-only client identity when the server requires one', async () => {
    const port = await server({ requestCert: true, rejectUnauthorized: true, ca: [fixture('root.pem'), fixture('int.pem')], maxVersion: 'TLSv1.2' });
    await expect(tlsHandshake({ host: '127.0.0.1', port, servername: 'localhost' }, new AbortController().signal)).rejects.toThrow();
    const pfxBase64 = readFileSync(join(__dirname, '__fixtures__/tls/client.p12')).toString('base64');
    const result = await tlsHandshake({ host: '127.0.0.1', port, servername: 'localhost', clientIdentity: { pfxBase64, passphrase: 'dude' } }, new AbortController().signal);
    expect(result.protocol).toBe('TLSv1.2');
  });

  it('cancels promptly', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(tlsHandshake({ host: '127.0.0.1', port: 9, servername: 'localhost' }, abort.signal)).rejects.toThrow();
  });
});

describe('trust verdicts per store', () => {
  it('trusts a chain only in the store that holds its root', () => {
    setTrustStoresForTesting({ mozilla: [fixture('root.pem')], windows: [] });
    const chain = [der('leaf.pem'), der('int.pem')];
    const now = new Date();
    expect(validateChain(chain, 'mozilla', now)).toMatchObject({ trusted: true, path: ['localhost', 'DUDE Test Intermediate', 'DUDE Test Root'] });
    expect(validateChain(chain, 'windows', now).trusted).toBe(false);
    expect(validateChain([der('leaf.pem')], 'mozilla', now).reason).toMatch(/Incomplete chain/);
    expect(validateChain([der('self.pem')], 'mozilla', now).reason).toMatch(/Self-signed/);
    expect(validateChain(chain, 'mozilla', new Date('2200-01-01')).reason).toMatch(/Expired/);
  });
});

describe('hostname mismatch analysis', () => {
  const leaf = summarizeCertificate(der('leaf.pem'));
  it('explains matches and misses', () => {
    expect(analyzeHostname('localhost', leaf)).toMatchObject({ matches: true, matchedName: 'localhost' });
    expect(analyzeHostname('api.dude.test', leaf)).toMatchObject({ matches: true, matchedName: '*.dude.test' });
    expect(analyzeHostname('a.b.dude.test', leaf).reasons.join(' ')).toMatch(/one label/);
    expect(analyzeHostname('dude.test', leaf).reasons.join(' ')).toMatch(/bare domain/);
    expect(analyzeHostname('127.0.0.1', leaf).matches).toBe(true);
    expect(analyzeHostname('10.0.0.1', leaf).reasons.join(' ')).toMatch(/not among the IP SANs/);
  });
  it('buckets expiry and round-trips chain DER', () => {
    expect(expiryStatus(-1)).toBe('expired');
    expect(expiryStatus(10)).toBe('warning');
    expect(expiryStatus(400)).toBe('ok');
    expect(chainDerFromSummaries([leaf])[0].equals(der('leaf.pem'))).toBe(true);
  });
});
