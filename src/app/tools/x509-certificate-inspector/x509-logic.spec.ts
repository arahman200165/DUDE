import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCertificateBytes, parseCertificateText } from './x509-logic';

/**
 * A real self-signed certificate generated with `openssl req -x509` (SAN +
 * basicConstraints + keyUsage + extKeyUsage extensions), with fingerprints
 * read back via `openssl x509 -noout -fingerprint -sha1`/`-sha256` —
 * cross-validating this tool's `crypto.subtle`-based fingerprint calculation
 * against a real, independent implementation.
 */
const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDojCCAoqgAwIBAgIUaJp0+MfQZDRY7wo1XhN//DTbW14wDQYJKoZIhvcNAQEL
BQAwNjEUMBIGA1UEAwwLZXhhbXBsZS5vcmcxETAPBgNVBAoMCFRlc3QgT3JnMQsw
CQYDVQQGEwJVUzAeFw0yNjA5MjMwMjEwMzhaFw0zNjA5MjAwMjEwMzhaMDYxFDAS
BgNVBAMMC2V4YW1wbGUub3JnMREwDwYDVQQKDAhUZXN0IE9yZzELMAkGA1UEBhMC
VVMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDC7vza4oNiaGsYWcQb
475zTBoRrU533+wXwBaqg35vvkO6WkDqwjljJKRJ0vO2PP+cvPS+s9lskQaL+IAp
JAmwDwEXnNkU1jd1WGqKBQ/3r5qjVSZFdGbUDe9DHvY1dv2sbjEXaDs776Hu/zzs
M6SDyu0nvYN2MhB+0FyMMqL0m1YutE7BcueCGYoMljRQ+PYX8yQ3g4JOLGRmlZBt
c5asflnHNMAnXZ/LE8fmeNzPHu/Oa4fg16pDL7WrwZoTVRxWYYoRa8Rdiq0BQ/WG
oHpGKoe7HoQA4RXLgSBp/kO4qNPDCTaRsbrhRnSrVwzmQIGGkznVp9pxOGJLTnxC
uyQFAgMBAAGjgacwgaQwQAYDVR0RBDkwN4ILZXhhbXBsZS5vcmeCD3d3dy5leGFt
cGxlLm9yZ4cEfwAAAYERYWRtaW5AZXhhbXBsZS5vcmcwEgYDVR0TAQH/BAgwBgEB
/wIBATAOBgNVHQ8BAf8EBAMCAYYwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUF
BwMCMB0GA1UdDgQWBBTNkO4JusPa3D2x560fvdp/cPFFijANBgkqhkiG9w0BAQsF
AAOCAQEAO3fMYnbSiGqZMYdrHdV6iiXsRvDqyk4gCpZXkjVPhTKynpodylWcab5b
g58IeHvdRBeEWNCd/jrdYCOyUZhIvXCmiqEmYdEqNiPiUojPs6DoHhDGY1j26WsY
DfFTa6XBoOVPNxsR48gPdSSvE6KCc+GPo9Ya48tOl/fcV2PednbtbDjYTq45j353
OCRTI5I+axl6km2jKyhpnQByim4eLk+zMQtKmzZEBar/gEMWXwdD7+6glrgamCXy
Ge7vZv9Jv5dnMOYhvCYdVmsXqGuGlKIOevQpyFr55Clm7ZrerRFF1dazhm1AgL36
1NXBIt8DpBKTEn0LfI8i1zTkuFtDAQ==
-----END CERTIFICATE-----`;

const EXPECTED_SHA1 = 'f7:85:1a:73:65:37:05:6e:e5:47:e6:8b:7c:25:d0:45:88:c5:08:14';
const EXPECTED_SHA256 = 'a7:0d:41:fd:e1:e5:3f:3d:5d:fb:41:db:70:d6:22:1a:14:d2:08:1d:72:71:6e:25:1a:ab:4a:7d:b7:3a:81:3f';
const EXPECTED_SERIAL = '689a74f8c7d0643458ef0a355e137ffc34db5b5e';

describe('x509-logic', () => {
  it('parses the real ISRG Root X1 DER golden corpus against Windows certificate-store values', async () => {
    const bytes = readFileSync(resolve(process.cwd(), 'src/app/tools/x509-certificate-inspector/__fixtures__/isrg-root-x1.der'));
    const result = await parseCertificateBytes(new Uint8Array(bytes));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const { fields } = result.certificate;
    expect(result.certificate.fingerprintSha1).toBe('ca:bd:2a:79:a1:07:6a:31:f2:1d:25:36:35:cb:03:9d:43:29:a5:e8');
    expect(result.certificate.fingerprintSha256).toBe('96:bc:ec:06:26:49:76:f3:74:60:77:9a:cf:28:c5:a7:cf:e8:a3:c0:aa:e1:1a:8f:fc:ee:05:c0:bd:df:08:c6');
    expect(fields.serialNumber.toLowerCase()).toBe('008210cfb0d240e3594463e0bb63828b00');
    expect(fields.subject).toEqual(expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'ISRG Root X1' })]));
    expect(fields.issuer).toEqual(expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'ISRG Root X1' })]));
    expect(fields.isCA).toBe(true);
    expect(fields.keyUsage).toEqual(expect.arrayContaining(['keyCertSign', 'cRLSign']));
  });
  it('parses a real openssl-generated certificate and matches its openssl fingerprints', async () => {
    const result = await parseCertificateText(TEST_CERT_PEM);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);

    expect(result.certificate.fingerprintSha1).toBe(EXPECTED_SHA1);
    expect(result.certificate.fingerprintSha256).toBe(EXPECTED_SHA256);
    expect(result.certificate.fields.serialNumber.toLowerCase()).toBe(EXPECTED_SERIAL);
  });

  it('extracts subject, SAN, basicConstraints, keyUsage, and extKeyUsage from the real certificate', async () => {
    const result = await parseCertificateText(TEST_CERT_PEM);
    if (!result.ok) throw new Error(result.error);
    const { fields } = result.certificate;

    expect(fields.subject).toEqual(expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'example.org' })]));
    expect(fields.isCA).toBe(true);
    expect(fields.pathLenConstraint).toBe(1);
    expect(fields.keyUsage).toEqual(expect.arrayContaining(['keyCertSign', 'digitalSignature', 'cRLSign']));
    expect(fields.extKeyUsage).toEqual(expect.arrayContaining(['serverAuth', 'clientAuth']));
    expect(fields.subjectAltNames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeName: 'dNSName', value: 'example.org' }),
        expect.objectContaining({ typeName: 'dNSName', value: 'www.example.org' }),
        expect.objectContaining({ typeName: 'iPAddress', value: '127.0.0.1' }),
        expect.objectContaining({ typeName: 'rfc822Name (email)', value: 'admin@example.org' }),
      ]),
    );
    expect(fields.publicKeyBits).toBe(2048);
  });

  it('produces identical fingerprints whether parsed from PEM or from re-encoded raw DER bytes', async () => {
    const pemResult = await parseCertificateText(TEST_CERT_PEM);
    if (!pemResult.ok) throw new Error(pemResult.error);

    const derResult = await parseCertificateBytes(pemResult.certificate.der);
    expect(derResult.ok).toBe(true);
    if (!derResult.ok) throw new Error(derResult.error);
    expect(derResult.certificate.fingerprintSha256).toBe(pemResult.certificate.fingerprintSha256);
  });

  it('auto-detects hex-encoded raw DER pasted as text', async () => {
    const pemResult = await parseCertificateText(TEST_CERT_PEM);
    if (!pemResult.ok) throw new Error(pemResult.error);
    const hex = Array.from(pemResult.certificate.der, (b) => b.toString(16).padStart(2, '0')).join('');

    const result = await parseCertificateText(hex);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.certificate.fingerprintSha256).toBe(EXPECTED_SHA256);
  });

  it('rejects empty input', async () => {
    const result = await parseCertificateText('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed PEM', async () => {
    const result = await parseCertificateText('-----BEGIN CERTIFICATE-----\nnotbase64!!!\n-----END CERTIFICATE-----');
    expect(result.ok).toBe(false);
  });

  it('rejects garbage that is neither PEM nor valid hex', async () => {
    const result = await parseCertificateText('definitely not a certificate');
    expect(result.ok).toBe(false);
  });
});
