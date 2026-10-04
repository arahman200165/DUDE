import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../server/test-helpers.js';
import { buildCsr, verifyCsr } from './csr.js';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const openssl = spawnSync('openssl', ['version'], { encoding: 'utf8' });
const hasOpenssl = openssl.status === 0;

describe('csr', () => {
  it('round-trips names and the public key through verifyCsr', () => {
    const { der, pem } = buildCsr({ names: ['hub.example.test', 'www.example.test', '203.0.113.7'], key: privateKey });
    expect(pem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n/);
    const verified = verifyCsr(der);
    expect(verified.names).toEqual(['hub.example.test', 'www.example.test', '203.0.113.7']);
    const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    expect(verified.publicKeySpkiSha256).toBe(createHash('sha256').update(spki).digest('hex'));
  });

  it('rejects a tampered signature, trailing data and a CSR without names', () => {
    const { der } = buildCsr({ names: ['a.example.test'], key: privateKey });
    const tampered = Buffer.from(der);
    tampered[40] = tampered[40]! ^ 0x01; // inside the subject / info region
    expect(() => verifyCsr(tampered)).toThrow();
    expect(() => verifyCsr(Buffer.concat([der, Buffer.from([0])]))).toThrow(/trailing/);
    expect(() => verifyCsr(der.subarray(0, der.length - 3))).toThrow();
    expect(() => buildCsr({ names: [], key: privateKey })).toThrow();
  });

  it.skipIf(!hasOpenssl)('is accepted by openssl req -verify with the expected SAN', () => {
    const dir = tempDir('acme-csr-');
    const file = path.join(dir, 'req.csr');
    writeFileSync(file, buildCsr({ names: ['hub.example.test', 'alt.example.test', '203.0.113.7'], key: privateKey }).pem);
    const result = spawnSync('openssl', ['req', '-in', file, '-verify', '-noout', '-text'], { encoding: 'utf8' });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toMatch(/verify OK/i);
    expect(output).toContain('DNS:hub.example.test');
    expect(output).toContain('DNS:alt.example.test');
    expect(output).toContain('IP Address:203.0.113.7');
    expect(output).toMatch(/ecdsa-with-SHA256/);
    expect(output).toMatch(/CN\s*=\s*hub\.example\.test/);
  });
});
