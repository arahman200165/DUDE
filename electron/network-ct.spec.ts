import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CT_LOG_COUNT, decodeEmbeddedScts, decodeSct } from './network-ct';

const recorded = JSON.parse(readFileSync(join(__dirname, '__fixtures__/revocation/recorded.json'), 'utf8')) as { cases: Record<string, { leafDer: string }> };

describe('Certificate Transparency SCT decoding', () => {
  it('decodes embedded SCTs from a real leaf and names each log from the bundled list', () => {
    const scts = decodeEmbeddedScts(Buffer.from(recorded.cases['good'].leafDer, 'base64'));
    expect(scts.length).toBeGreaterThanOrEqual(2);
    expect(scts.every((sct) => sct.version === 0)).toBe(true);
    expect(scts.every((sct) => Date.parse(sct.timestamp) > 0)).toBe(true);
    expect(scts.some((sct) => sct.logName && sct.logOperator)).toBe(true);
    expect(CT_LOG_COUNT).toBeGreaterThan(10);
  });

  it('parses SCT fields and tolerates an unknown log id', () => {
    const sct = Buffer.concat([
      Buffer.from([0]), Buffer.alloc(32, 0x11), // version + 32-byte log id (unknown)
      (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(1_700_000_000_000n); return b; })(),
      Buffer.from([0, 0]), // extensions length 0
      Buffer.from([4, 3]), Buffer.alloc(8), // hash SHA-256, sig ECDSA, dummy signature bytes
    ]);
    const decoded = decodeSct(sct, 'embedded');
    expect(decoded.hashAlgorithm).toBe(4);
    expect(decoded.signatureAlgorithm).toBe(3);
    expect(decoded.logName).toBeNull();
    expect(decoded.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(() => decodeSct(Buffer.alloc(10), 'embedded')).toThrow(/too short/);
  });
});
