import { createHash } from 'node:crypto';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import { ensureTlsIdentity, generateSelfSigned, spkiSha256 } from './self-signed.js';

const ID = '0192f3c4-aaaa-7bbb-8ccc-1234567890ab';

describe('self-signed certificate', () => {
  const { certPem, keyPem } = generateSelfSigned({ hubInstanceId: ID, extraNames: ['hub.example.test'] });
  const x509 = new X509Certificate(certPem);

  it('parses as a valid X.509 leaf with the expected names and validity', () => {
    const san = x509.subjectAltName ?? '';
    for (const expected of ['DNS:localhost', `DNS:${os.hostname()}`, 'IP Address:127.0.0.1', 'IP Address:0:0:0:0:0:0:0:1', 'DNS:hub.example.test']) expect(san).toContain(expected);
    expect(x509.subject).toContain('CN=DUDE Hub 0192f3c4');
    expect(x509.ca).toBe(false);
    expect(x509.verify(x509.publicKey)).toBe(true);
    expect(x509.checkIP('127.0.0.1')).toBe('127.0.0.1');
    expect(x509.checkHost('localhost')).toBe('localhost');
    const years = (new Date(x509.validTo).getTime() - Date.now()) / (365.25 * 86400_000);
    expect(years).toBeGreaterThan(9.9);
    expect(years).toBeLessThan(10.1);
    expect(new Date(x509.validFrom).getTime()).toBeLessThan(Date.now());
    expect(x509.serialNumber.length).toBeGreaterThan(20);
  });

  it('computes the SPKI pin as 43 base64url characters', () => {
    const expected = createHash('sha256').update(x509.publicKey.export({ type: 'spki', format: 'der' })).digest('base64url');
    expect(spkiSha256(certPem)).toBe(expected);
    expect(spkiSha256(x509)).toBe(expected);
    expect(spkiSha256(keyPem)).toBe(expected);
    expect(expected).toHaveLength(43);
  });

  it('is accepted by a real TLS handshake only when trusted', async () => {
    const server = https.createServer({ key: keyPem, cert: certPem }, (_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const connect = (options: tls.ConnectionOptions) => new Promise<tls.TLSSocket>((resolve, reject) => {
      const socket = tls.connect({ host: '127.0.0.1', port, servername: 'localhost', ...options }, () => resolve(socket));
      socket.on('error', reject);
    });
    try {
      const trusted = await connect({ ca: certPem });
      expect(trusted.authorized).toBe(true);
      trusted.destroy();
      await expect(connect({})).rejects.toThrow(/self[- ]signed|unable to verify/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('ensureTlsIdentity', () => {
  it('creates once and reloads the same identity', () => {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'hub-tls-')), 'tls');
    const first = ensureTlsIdentity(dir, { hubInstanceId: ID });
    expect(readFileSync(path.join(dir, 'key.pem'), 'utf8')).toBe(first.keyPem);
    const second = ensureTlsIdentity(dir, { hubInstanceId: ID });
    expect(second).toEqual(first);
    expect(first.spkiSha256).toHaveLength(43);
  });
});
