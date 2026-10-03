import { describe, it, expect } from 'vitest';
import { Value } from 'typebox/value';
import { TlsCertificatesResponse } from './tls-audit.schema.js';

const pinned = { spkiSha256: 'A'.repeat(43), certPem: '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n' };
const valid = { active: pinned, next: null, source: 'self-signed', caCertPem: null, leafNotAfter: '2027-11-04T00:00:00.000Z' };

describe('TlsCertificatesResponse', () => {
  it('accepts self-signed and local-ca responses (the CA root is public PEM or null)', () => {
    expect(Value.Check(TlsCertificatesResponse, valid)).toBe(true);
    expect(Value.Check(TlsCertificatesResponse, { ...valid, next: pinned, source: 'local-ca', caCertPem: pinned.certPem })).toBe(true);
  });
  it.each([
    ['missing source', { ...valid, source: undefined }],
    ['unknown source', { ...valid, source: 'acme' }],
    ['missing caCertPem', { ...valid, caCertPem: undefined }],
    ['non-string caCertPem', { ...valid, caCertPem: 5 }],
    ['missing leafNotAfter', { ...valid, leafNotAfter: undefined }],
  ])('rejects %s', (_name, body) => {
    expect(Value.Check(TlsCertificatesResponse, body)).toBe(false);
  });
});
