import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HashAlgorithm, computeFileHashes } from '../../../shared-logic/hash-compute';

/**
 * CROSSCHECK: verifies the digests the File Hash Generator's worker actually computes
 * (`computeFileHashes`) against Node's built-in `crypto` module — a wholly separate
 * implementation from the WebCrypto/js-md5/@noble/xxhash-wasm stack `hash-compute.ts` uses —
 * over arbitrary byte buffers, not just the fixed known-answer vectors already covered in
 * `src/shared-logic/hash-compute.spec.ts`. Limited to the algorithms Node's OpenSSL build
 * supports directly; BLAKE3/xxHash/CRC have no Node-crypto equivalent and are covered there
 * by known-answer vectors instead.
 */
const NODE_ALGORITHM: Partial<Record<HashAlgorithm, string>> = {
  MD5: 'md5',
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
  'SHA3-256': 'sha3-256',
  'SHA3-384': 'sha3-384',
  'SHA3-512': 'sha3-512',
  BLAKE2b: 'blake2b512',
  BLAKE2s: 'blake2s256',
};
const ALGORITHMS = Object.keys(NODE_ALGORITHM) as HashAlgorithm[];

describe('computeFileHashes (CROSSCHECK: Node crypto reference digests)', () => {
  it('matches Node crypto\'s digest for every algorithm it also supports, over arbitrary byte buffers', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 256 }), async (bytes) => {
        const buffer = Uint8Array.from(bytes).buffer;
        const results = await computeFileHashes(buffer, ALGORITHMS);

        for (const { algorithm, hex } of results) {
          const nodeAlgorithm = NODE_ALGORITHM[algorithm];
          if (!nodeAlgorithm) continue;
          expect(hex).toBe(createHash(nodeAlgorithm).update(Buffer.from(bytes)).digest('hex'));
        }
      }),
      { numRuns: 50 },
    );
  });

  it('never throws for arbitrary byte buffers, and always returns lowercase hex of the expected length per algorithm', async () => {
    const EXPECTED_HEX_LENGTH: Partial<Record<HashAlgorithm, number>> = {
      MD5: 32,
      'SHA-1': 40,
      'SHA-256': 64,
      'SHA-384': 96,
      'SHA-512': 128,
    };

    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 64 }), async (bytes) => {
        const buffer = Uint8Array.from(bytes).buffer;
        const algorithms = Object.keys(EXPECTED_HEX_LENGTH) as HashAlgorithm[];
        const results = await computeFileHashes(buffer, algorithms);

        for (const { algorithm, hex } of results) {
          expect(hex).toMatch(/^[0-9a-f]+$/);
          expect(hex).toHaveLength(EXPECTED_HEX_LENGTH[algorithm]!);
        }
      }),
      { numRuns: 50 },
    );
  });
});
