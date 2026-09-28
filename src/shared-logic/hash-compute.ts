import { md5 } from 'js-md5';
import { sha3_256, sha3_384, sha3_512 } from '@noble/hashes/sha3.js';
import { blake2b, blake2s } from '@noble/hashes/blake2.js';
import { blake3 } from '@noble/hashes/blake3.js';
import xxhash, { XXHashAPI } from 'xxhash-wasm';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { crc32, crc64, createCrc32, createCrc64 } from './crc';

/**
 * Pure(-ish) hash computation. Lives outside `src/app/` (see
 * `src/shared-logic/AGENTS.md`) because the Hash Generator/File Hash tools,
 * their workers, and `electron/hotkey-bridge.ts`'s clipboard quick-action
 * (Phase 8 Stage 5) all import it. Not framework-free in the strictest
 * sense — it depends on the ambient `crypto.subtle` global — but that
 * global exists in the main thread, worker scope, the jsdom test
 * environment, and Node (Electron's main process), so it needs no
 * Angular/DOM-specific glue. `hotkey-bridge.ts` only ever calls `computeHash`
 * with `'SHA-256'`, so the WASM-backed xxHash path below never has to run
 * there.
 */

export type HashAlgorithm =
  | 'MD5'
  | 'SHA-1'
  | 'SHA-256'
  | 'SHA-384'
  | 'SHA-512'
  | 'SHA3-256'
  | 'SHA3-384'
  | 'SHA3-512'
  | 'BLAKE2b'
  | 'BLAKE2s'
  | 'BLAKE3'
  | 'XXH32'
  | 'XXH64'
  | 'CRC32'
  | 'CRC64';

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = [
  'MD5',
  'SHA-1',
  'SHA-256',
  'SHA-384',
  'SHA-512',
  'SHA3-256',
  'SHA3-384',
  'SHA3-512',
  'BLAKE2b',
  'BLAKE2s',
  'BLAKE3',
  'XXH32',
  'XXH64',
  'CRC32',
  'CRC64',
];

export interface HashOutput {
  readonly algorithm: HashAlgorithm;
  readonly hex: string;
}

function toHex(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `xxhash-wasm`'s factory compiles its (inlined, no separate asset) WASM module
 * asynchronously — cache the resulting API instead of recompiling per call.
 */
let xxhashApiPromise: Promise<XXHashAPI> | null = null;
function getXxhashApi(): Promise<XXHashAPI> {
  if (!xxhashApiPromise) xxhashApiPromise = xxhash();
  return xxhashApiPromise;
}

async function digestBytes(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<string> {
  switch (algorithm) {
    case 'MD5':
      return md5(bytes);
    case 'SHA-1':
    case 'SHA-256':
    case 'SHA-384':
    case 'SHA-512':
      return toHex(await crypto.subtle.digest(algorithm, bytes as BufferSource));
    case 'SHA3-256':
      return toHex(sha3_256(bytes));
    case 'SHA3-384':
      return toHex(sha3_384(bytes));
    case 'SHA3-512':
      return toHex(sha3_512(bytes));
    case 'BLAKE2b':
      return toHex(blake2b(bytes));
    case 'BLAKE2s':
      return toHex(blake2s(bytes));
    case 'BLAKE3':
      return toHex(blake3(bytes));
    case 'XXH32': {
      const api = await getXxhashApi();
      return api.h32Raw(bytes).toString(16).padStart(8, '0');
    }
    case 'XXH64': {
      const api = await getXxhashApi();
      return api.h64Raw(bytes).toString(16).padStart(16, '0');
    }
    case 'CRC32':
      return crc32(bytes);
    case 'CRC64':
      return crc64(bytes);
  }
}

export async function computeHash(text: string, algorithm: HashAlgorithm): Promise<string> {
  return digestBytes(new TextEncoder().encode(text), algorithm);
}

export async function computeHashes(
  text: string,
  algorithms: readonly HashAlgorithm[],
): Promise<readonly HashOutput[]> {
  return Promise.all(algorithms.map(async (algorithm) => ({ algorithm, hex: await computeHash(text, algorithm) })));
}

/** Buffer-based sibling of `computeHash`, used by the File Hashing tool. */
export async function computeFileHash(buffer: ArrayBuffer, algorithm: HashAlgorithm): Promise<string> {
  return digestBytes(new Uint8Array(buffer), algorithm);
}

export async function computeFileHashes(
  buffer: ArrayBuffer,
  algorithms: readonly HashAlgorithm[],
): Promise<readonly HashOutput[]> {
  return Promise.all(
    algorithms.map(async (algorithm) => ({ algorithm, hex: await computeFileHash(buffer, algorithm) })),
  );
}

/** Incremental hasher for input that never fits in memory at once (Phase 29 tree/large-file hashing). */
export interface StreamingHasher {
  update(bytes: Uint8Array): void;
  digest(): string;
}

/**
 * A native hasher (e.g. Node's `crypto.createHash`) the caller can inject for the algorithms it
 * accelerates; the Electron fs worker passes one for MD5/SHA-1/SHA-2. Everything else falls back to
 * the same libraries `digestBytes` uses, so a streamed digest equals the one-shot digest.
 */
export type NativeHasherFactory = (algorithm: HashAlgorithm) => StreamingHasher | null;

export async function createStreamingHasher(algorithm: HashAlgorithm, native?: NativeHasherFactory): Promise<StreamingHasher> {
  const accelerated = native?.(algorithm);
  if (accelerated) return accelerated;
  const wrap = (hash: { update(bytes: Uint8Array): unknown; digest(): Uint8Array }): StreamingHasher => ({
    update: (bytes) => void hash.update(bytes),
    digest: () => toHex(hash.digest()),
  });
  switch (algorithm) {
    case 'MD5': {
      const hash = md5.create();
      return { update: (bytes) => void hash.update(bytes), digest: () => hash.hex() };
    }
    case 'SHA-1': return wrap(sha1.create());
    case 'SHA-256': return wrap(sha256.create());
    case 'SHA-384': return wrap(sha384.create());
    case 'SHA-512': return wrap(sha512.create());
    case 'SHA3-256': return wrap(sha3_256.create());
    case 'SHA3-384': return wrap(sha3_384.create());
    case 'SHA3-512': return wrap(sha3_512.create());
    case 'BLAKE2b': return wrap(blake2b.create());
    case 'BLAKE2s': return wrap(blake2s.create());
    case 'BLAKE3': return wrap(blake3.create());
    case 'XXH32': {
      const hash = (await getXxhashApi()).create32();
      return { update: (bytes) => void hash.update(bytes), digest: () => hash.digest().toString(16).padStart(8, '0') };
    }
    case 'XXH64': {
      const hash = (await getXxhashApi()).create64();
      return { update: (bytes) => void hash.update(bytes), digest: () => hash.digest().toString(16).padStart(16, '0') };
    }
    case 'CRC32': return createCrc32();
    case 'CRC64': return createCrc64();
  }
}
