import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { pipelineStep } from "./pkcs12-inspector.pipeline-step.js";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildEmptyPasswordP12(): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 1000 * 60 * 60);
  const attrs = [{ name: 'commonName', value: 'test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], '');
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return Uint8Array.from(der, (c) => c.charCodeAt(0));
}

describe('pkcs12-inspector pipeline step', () => {
  it('inspects an empty-password .p12 file', async () => {
    const file = buildEmptyPasswordP12();
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'test.p12', mimeType: 'application/x-pkcs12', base64: bytesToBase64(file) },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { certificates: unknown[]; privateKeys: unknown[] };
      expect(value.certificates.length).toBe(1);
      expect(value.privateKeys.length).toBe(1);
    }
  });

  it('fails on a file that is not a valid PKCS#12 container', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'bad.p12', mimeType: 'application/x-pkcs12', base64: bytesToBase64(new Uint8Array([1, 2, 3, 4])) },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'PKCS#12 / PFX Inspector expects file input.', kind: 'invalid-input' } });
  });
});
