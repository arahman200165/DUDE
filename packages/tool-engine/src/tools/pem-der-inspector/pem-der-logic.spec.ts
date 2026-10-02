import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { bytesToHex } from "../../shared/utils/byte-codec.js";
import { derToPem, parseDerBytes, parsePemOrDerFile, parsePemOrHexDer, parsePemText } from "./pem-der-logic.js";

function samplePkcs8PrivateKeyPem(): string {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 512, workers: -1 });
  const asn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(asn1);
  return forge.pki.privateKeyInfoToPem(pkcs8Asn1);
}

describe('pem-der-logic', () => {
  it('parses the checked-in ISRG Root X1 certificate accepted by Node X509Certificate', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/tool-engine/src/tools/x509-certificate-inspector/__fixtures__/isrg-root-x1.der'));
    const der = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    const pem = derToPem(der, 'CERTIFICATE');
    const independentCertificate = new X509Certificate(pem);

    expect(new Uint8Array(independentCertificate.raw)).toEqual(der);
    expect(independentCertificate.subject).toContain('CN=ISRG Root X1');

    const result = parsePemText(pem);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'pem') throw new Error('expected a parsed certificate PEM');
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].der).toEqual(der);
    expect(result.blocks[0].tree.typeName).toBe('SEQUENCE');
    expect(result.blocks[0].tree.children).toHaveLength(3);

    const derResult = parseDerBytes(der);
    expect(derResult.ok).toBe(true);
    if (!derResult.ok || derResult.kind !== 'der') throw new Error('expected a parsed certificate DER');
    expect(Array.from(derResult.der)).toEqual(Array.from(independentCertificate.raw));
    expect(derResult.tree.typeName).toBe('SEQUENCE');
    expect(derResult.tree.children).toHaveLength(3);
  });

  it('parses a PEM block into a SEQUENCE-rooted ASN.1 tree', () => {
    const pem = samplePkcs8PrivateKeyPem();
    const result = parsePemText(pem);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'pem') throw new Error('expected a pem result');
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe('PRIVATE KEY');
    expect(result.blocks[0].tree.typeName).toBe('SEQUENCE');
    expect(result.blocks[0].der.length).toBeGreaterThan(0);
  });

  it('parses multiple concatenated PEM blocks', () => {
    const pem = samplePkcs8PrivateKeyPem() + samplePkcs8PrivateKeyPem();
    const result = parsePemText(pem);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'pem') throw new Error('expected a pem result');
    expect(result.blocks).toHaveLength(2);
  });

  it('rejects text with no PEM blocks', () => {
    const result = parsePemText('just some text');
    expect(result.ok).toBe(false);
  });

  it('round-trips DER bytes back into an equivalent PEM block via derToPem', () => {
    const pem = samplePkcs8PrivateKeyPem();
    const parsed = parsePemText(pem);
    if (!parsed.ok || parsed.kind !== 'pem') throw new Error('expected a pem result');

    const reEncoded = derToPem(parsed.blocks[0].der, parsed.blocks[0].type);
    const reParsed = parsePemText(reEncoded);
    expect(reParsed.ok).toBe(true);
    if (!reParsed.ok || reParsed.kind !== 'pem') throw new Error('expected a pem result');
    expect(bytesToHex(reParsed.blocks[0].der)).toBe(bytesToHex(parsed.blocks[0].der));
  });

  it('parses raw DER bytes directly', () => {
    const pem = samplePkcs8PrivateKeyPem();
    const parsed = parsePemText(pem);
    if (!parsed.ok || parsed.kind !== 'pem') throw new Error('expected a pem result');

    const result = parseDerBytes(parsed.blocks[0].der);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'der') throw new Error('expected a der result');
    expect(result.tree.typeName).toBe('SEQUENCE');
  });

  it('rejects garbage DER bytes with a clear error', () => {
    const result = parseDerBytes(new Uint8Array([0xff, 0xff, 0xff]));
    expect(result.ok).toBe(false);
  });

  describe('parsePemOrHexDer', () => {
    it('auto-detects PEM text', () => {
      const result = parsePemOrHexDer(samplePkcs8PrivateKeyPem());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kind).toBe('pem');
    });

    it('auto-detects hex-encoded DER', () => {
      const pem = samplePkcs8PrivateKeyPem();
      const parsed = parsePemText(pem);
      if (!parsed.ok || parsed.kind !== 'pem') throw new Error('expected a pem result');

      const result = parsePemOrHexDer(bytesToHex(parsed.blocks[0].der));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kind).toBe('der');
    });

    it('rejects input that is neither PEM nor valid hex', () => {
      const result = parsePemOrHexDer('not pem, not hex, just text!!');
      expect(result.ok).toBe(false);
    });

    it('rejects empty input', () => {
      const result = parsePemOrHexDer('   ');
      expect(result.ok).toBe(false);
    });
  });

  describe('parsePemOrDerFile', () => {
    it('auto-detects a PEM text file', () => {
      const bytes = new TextEncoder().encode(samplePkcs8PrivateKeyPem());
      const result = parsePemOrDerFile(bytes);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kind).toBe('pem');
    });

    it('auto-detects a raw binary DER file', () => {
      const pem = samplePkcs8PrivateKeyPem();
      const parsed = parsePemText(pem);
      if (!parsed.ok || parsed.kind !== 'pem') throw new Error('expected a pem result');

      const result = parsePemOrDerFile(parsed.blocks[0].der);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kind).toBe('der');
    });
  });
});
