import { generateKeyPairSync } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { bytesToHex } from "@dude/tool-engine/shared/utils/byte-codec";
import { derToPem, parseDerBytes, parsePemOrHexDer, parsePemText } from "@dude/tool-engine/tools/pem-der-inspector/pem-der-logic";

/**
 * CROSSCHECK: real PEM-encoded keys produced by Node's built-in `crypto` module (OpenSSL) --
 * a reference implementation wholly separate from the `node-forge` library `pem-der-logic.ts`
 * wraps -- across several real-world key types and PEM encodings, plus an independently
 * written PEM-body base64 extractor (not reusing `forge.pem.decode`) so a body-decoding bug
 * in forge itself would still surface here.
 */
interface KeySample {
  readonly label: string;
  readonly pem: string;
  readonly pemType: string;
}

function independentPemBodyBytes(pem: string): Buffer {
  const base64 = pem
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('-----'))
    .join('');
  return Buffer.from(base64, 'base64');
}

function buildSamples(): KeySample[] {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 512 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ed25519 = generateKeyPairSync('ed25519');

  return [
    { label: 'rsa-pkcs1-private', pem: rsa.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string, pemType: 'RSA PRIVATE KEY' },
    { label: 'rsa-pkcs8-private', pem: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, pemType: 'PRIVATE KEY' },
    { label: 'rsa-pkcs1-public', pem: rsa.publicKey.export({ type: 'pkcs1', format: 'pem' }) as string, pemType: 'RSA PUBLIC KEY' },
    { label: 'rsa-spki-public', pem: rsa.publicKey.export({ type: 'spki', format: 'pem' }) as string, pemType: 'PUBLIC KEY' },
    { label: 'ec-sec1-private', pem: ec.privateKey.export({ type: 'sec1', format: 'pem' }) as string, pemType: 'EC PRIVATE KEY' },
    { label: 'ec-pkcs8-private', pem: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, pemType: 'PRIVATE KEY' },
    { label: 'ec-spki-public', pem: ec.publicKey.export({ type: 'spki', format: 'pem' }) as string, pemType: 'PUBLIC KEY' },
    { label: 'ed25519-pkcs8-private', pem: ed25519.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, pemType: 'PRIVATE KEY' },
    { label: 'ed25519-spki-public', pem: ed25519.publicKey.export({ type: 'spki', format: 'pem' }) as string, pemType: 'PUBLIC KEY' },
  ];
}

const SAMPLES = buildSamples();

describe('parsePemText (CROSSCHECK: Node/OpenSSL-generated real keys, independent base64 extraction)', () => {
  it.each(SAMPLES.map((s) => [s.label, s] as const))('parses a Node-crypto-generated %s PEM to the expected type and byte-identical DER', (_label, sample) => {
    const result = parsePemText(sample.pem);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'pem') throw new Error('expected a pem result');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe(sample.pemType);
    expect(result.blocks[0].tree.typeName).toBe('SEQUENCE');

    const expectedDer = independentPemBodyBytes(sample.pem);
    expect(bytesToHex(result.blocks[0].der)).toBe(expectedDer.toString('hex'));
  });

  it.each(SAMPLES.map((s) => [s.label, s] as const))('round-trips %s DER back to an equivalent PEM body via derToPem', (_label, sample) => {
    const parsed = parsePemText(sample.pem);
    if (!parsed.ok || parsed.kind !== 'pem') throw new Error('expected a pem result');

    const reEncoded = derToPem(parsed.blocks[0].der, parsed.blocks[0].type);
    const reEncodedBody = independentPemBodyBytes(reEncoded);
    expect(reEncodedBody.toString('hex')).toBe(independentPemBodyBytes(sample.pem).toString('hex'));

    const reParsed = parsePemText(reEncoded);
    expect(reParsed.ok).toBe(true);
    if (reParsed.ok && reParsed.kind === 'pem') {
      expect(bytesToHex(reParsed.blocks[0].der)).toBe(bytesToHex(parsed.blocks[0].der));
    }
  });

  it.each(SAMPLES.map((s) => [s.label, s] as const))('auto-detects hex-encoded DER for %s via parsePemOrHexDer', (_label, sample) => {
    const parsed = parsePemText(sample.pem);
    if (!parsed.ok || parsed.kind !== 'pem') throw new Error('expected a pem result');

    const result = parsePemOrHexDer(bytesToHex(parsed.blocks[0].der));
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'der') {
      expect(result.tree.typeName).toBe('SEQUENCE');
      expect(bytesToHex(result.der)).toBe(bytesToHex(parsed.blocks[0].der));
    }
  });
});

describe('parsePemOrHexDer / parseDerBytes (FUZZ: never throws on garbage input)', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((s: string) => parsePemOrHexDer(s), fc.string({ maxLength: 500 }));
  });

  it('never throws for arbitrary byte arrays', () => {
    neverThrows((bytes: Uint8Array) => parseDerBytes(bytes), fc.uint8Array({ maxLength: 500 }));
  });

  it('rejects arbitrary non-hex, non-PEM text with an error rather than throwing', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }).filter((s) => s.trim() !== '' && !/-----BEGIN/.test(s) && !/^[0-9a-fA-F\s:,-]+$/.test(s)), (s) => {
        expect(parsePemOrHexDer(s).ok).toBe(false);
      }),
    );
  });
});
