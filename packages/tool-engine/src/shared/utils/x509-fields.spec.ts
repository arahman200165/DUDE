import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { certificateTimeStatus, extractX509Fields } from "./x509-fields.js";

function buildTestCertificate(): forge.pki.Certificate {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 512, workers: -1 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2020-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2030-01-01T00:00:00Z');

  const subjectAttrs = [
    { name: 'commonName', value: 'example.org' },
    { name: 'countryName', value: 'US' },
    { name: 'organizationName', value: 'Test Org' },
  ];
  cert.setSubject(subjectAttrs);
  cert.setIssuer(subjectAttrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 1 },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'example.org' },
        { type: 2, value: 'www.example.org' },
        { type: 7, ip: '127.0.0.1' },
        { type: 1, value: 'admin@example.org' },
      ],
    },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return cert;
}

describe('x509-fields', () => {
  const cert = buildTestCertificate();
  const fields = extractX509Fields(cert);

  it('extracts subject and issuer name fields', () => {
    expect(fields.subject).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shortName: 'CN', value: 'example.org' }),
        expect.objectContaining({ shortName: 'O', value: 'Test Org' }),
      ]),
    );
    expect(fields.issuer).toEqual(expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'example.org' })]));
  });

  it('extracts serial number, validity window, and signature algorithm name', () => {
    expect(fields.serialNumber).toBe('01');
    expect(fields.notBefore.getUTCFullYear()).toBe(2020);
    expect(fields.notAfter.getUTCFullYear()).toBe(2030);
    expect(fields.signatureAlgorithm).toBe('sha256WithRSAEncryption');
  });

  it('extracts the RSA public key bit length', () => {
    expect(fields.publicKeyBits).toBe(512);
  });

  it('extracts basicConstraints CA flag and path length', () => {
    expect(fields.isCA).toBe(true);
    expect(fields.pathLenConstraint).toBe(1);
  });

  it('extracts the set keyUsage flags only', () => {
    expect(fields.keyUsage).toEqual(expect.arrayContaining(['keyCertSign', 'digitalSignature', 'cRLSign']));
    expect(fields.keyUsage).not.toContain('keyEncipherment');
  });

  it('extracts extKeyUsage purposes', () => {
    expect(fields.extKeyUsage).toEqual(expect.arrayContaining(['serverAuth', 'clientAuth']));
  });

  it('formats subjectAltName entries by GeneralName type, including a dotted-quad IP', () => {
    expect(fields.subjectAltNames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeName: 'dNSName', value: 'example.org' }),
        expect.objectContaining({ typeName: 'dNSName', value: 'www.example.org' }),
        expect.objectContaining({ typeName: 'iPAddress', value: '127.0.0.1' }),
        expect.objectContaining({ typeName: 'rfc822Name (email)', value: 'admin@example.org' }),
      ]),
    );
  });

  it('extracts the subjectKeyIdentifier as hex', () => {
    expect(fields.subjectKeyIdentifier).toMatch(/^[0-9a-f]+$/);
  });
});

describe('certificateTimeStatus', () => {
  const notBefore = new Date('2024-01-01T00:00:00Z');
  const notAfter = new Date('2025-01-01T00:00:00Z');

  it('reports not-yet-valid before notBefore', () => {
    expect(certificateTimeStatus(notBefore, notAfter, new Date('2023-06-01T00:00:00Z'))).toBe('not-yet-valid');
  });

  it('reports valid within the validity window', () => {
    expect(certificateTimeStatus(notBefore, notAfter, new Date('2024-06-01T00:00:00Z'))).toBe('valid');
  });

  it('reports expired after notAfter', () => {
    expect(certificateTimeStatus(notBefore, notAfter, new Date('2025-06-01T00:00:00Z'))).toBe('expired');
  });
});
