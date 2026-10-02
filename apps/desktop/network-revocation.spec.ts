import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { certificateParts } from './der';
import { buildOcspRequest, extractIssuerDer, parseCrl, parseOcspResponse } from './network-revocation';

const tlsFixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name));
const pem = (name: string) => Buffer.from(tlsFixture(name).toString('utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
const recorded = JSON.parse(readFileSync(join(__dirname, '__fixtures__/revocation/recorded.json'), 'utf8')) as { cases: Record<string, { leafDer: string; issuerDer: string; ocspBase64: string; ocspUrl: string; expectedStatus: string }> };

describe('OCSP (recorded real response)', () => {
  it('parses a good status and verifies the responder signature', () => {
    const entry = recorded.cases['good'];
    const result = parseOcspResponse(Buffer.from(entry.ocspBase64, 'base64'), Buffer.from(entry.issuerDer, 'base64'), 'responder', entry.ocspUrl);
    expect(result.responseStatus).toBe('successful');
    expect(result.certStatus).toBe('good');
    expect(result.signatureValid).toBe(true);
    expect(Date.parse(result.thisUpdate!)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(result.nextUpdate!)).toBeGreaterThan(Date.parse(result.thisUpdate!));
  });

  it('builds a CertID whose serial matches the leaf', () => {
    const entry = recorded.cases['good'];
    const request = buildOcspRequest(Buffer.from(entry.leafDer, 'base64'), Buffer.from(entry.issuerDer, 'base64'));
    expect(request[0]).toBe(0x30); // SEQUENCE (OCSPRequest)
    expect(request.length).toBeGreaterThan(40);
    // A tampered issuer changes the key hash, so the responder's status no longer applies to our CertID,
    // but the request must still encode our leaf's serial.
    const serial = certificateParts(Buffer.from(entry.leafDer, 'base64')).serialHex;
    expect(request.toString('hex').toUpperCase()).toContain(serial.replace(/^0+/, ''));
  });
});

describe('CRL', () => {
  it('finds a revoked serial and verifies the CRL signature against the issuer', () => {
    const crl = tlsFixture('revoked.crl');
    const der = crl[0] === 0x30 ? crl : Buffer.from(crl.toString('latin1').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
    const leafSerial = certificateParts(pem('leaf.pem')).serialHex;
    const result = parseCrl(der, leafSerial, pem('int.pem'), 'http://127.0.0.1/int.crl');
    expect(result.revoked).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.entries).toBe(1);
    expect(Date.parse(result.thisUpdate)).toBeLessThanOrEqual(Date.now());
    // A serial that is not on the CRL is reported not revoked, signature still valid.
    const other = parseCrl(der, 'DEADBEEF', pem('int.pem'), 'http://127.0.0.1/int.crl');
    expect(other.revoked).toBe(false);
    expect(other.signatureValid).toBe(true);
  });
});

describe('AIA issuer extraction', () => {
  it('returns a bare DER certificate unchanged', () => {
    const issuer = pem('int.pem');
    expect(extractIssuerDer(issuer).equals(issuer)).toBe(true);
  });
});
