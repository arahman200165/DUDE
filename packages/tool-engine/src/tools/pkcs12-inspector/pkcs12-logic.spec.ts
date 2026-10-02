import { describe, expect, it } from 'vitest';
import { inspectPkcs12 } from "./pkcs12-logic.js";

/**
 * A real PKCS#12 file built with `openssl pkcs12 -export` (OpenSSL 3.2's
 * modern default: PBES2/PBKDF2/AES-256-CBC for both the key bag and the
 * cert SafeContents, not the legacy RC2/3DES scheme) — cross-validating
 * that node-forge's PBE decryption handles it without `-legacy` mode.
 * Contains the leaf certificate + its 2048-bit RSA key (friendlyName
 * "leaf-friendly") plus the intermediate CA certificate, password
 * "testpass123".
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const TEST_P12_BASE64 =
  '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';

const TEST_P12_BYTES = base64ToBytes(TEST_P12_BASE64);
const TEST_PASSWORD = 'testpass123';

describe('pkcs12-logic', () => {
  it('inspects a real OpenSSL-3.x-generated PKCS#12 file (modern PBES2/AES-256-CBC)', () => {
    const result = inspectPkcs12(TEST_P12_BYTES, TEST_PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);

    expect(result.contents.certificates).toHaveLength(2);
    expect(result.contents.privateKeys).toHaveLength(1);
  });

  it('extracts the leaf certificate with its friendlyName', () => {
    const result = inspectPkcs12(TEST_P12_BYTES, TEST_PASSWORD);
    if (!result.ok) throw new Error(result.error);

    const leaf = result.contents.certificates.find((c) => c.friendlyName === 'leaf-friendly');
    expect(leaf).toBeDefined();
    expect(leaf!.fields.subject).toEqual(expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'leaf.example.org' })]));
    expect(leaf!.pem).toMatch(/-----BEGIN CERTIFICATE-----/);
  });

  it('extracts the intermediate certificate without a friendlyName', () => {
    const result = inspectPkcs12(TEST_P12_BYTES, TEST_PASSWORD);
    if (!result.ok) throw new Error(result.error);

    const intermediate = result.contents.certificates.find((c) => c.friendlyName === null);
    expect(intermediate).toBeDefined();
    expect(intermediate!.fields.subject).toEqual(
      expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'Test Intermediate CA' })]),
    );
  });

  it('extracts the 2048-bit RSA private key with its friendlyName', () => {
    const result = inspectPkcs12(TEST_P12_BYTES, TEST_PASSWORD);
    if (!result.ok) throw new Error(result.error);

    expect(result.contents.privateKeys[0].bits).toBe(2048);
    expect(result.contents.privateKeys[0].friendlyName).toBe('leaf-friendly');
    expect(result.contents.privateKeys[0].pem).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
  });

  it('gives a friendly error for a wrong password (MAC verification failure)', () => {
    const result = inspectPkcs12(TEST_P12_BYTES, 'wrong-password');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toMatch(/wrong password/i);
  });

  it('rejects garbage bytes that are not valid ASN.1/DER', () => {
    const result = inspectPkcs12(new Uint8Array([0xff, 0x00, 0x01, 0x02]), 'anything');
    expect(result.ok).toBe(false);
  });
});
