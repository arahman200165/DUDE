import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createStreamingHasher, type HashAlgorithm, type NativeHasherFactory, type StreamingHasher } from "@dude/crypto/hash-compute";

/**
 * Streaming file hashing for the fs utility process (Phase 29). MD5/SHA-1/SHA-2 go through Node's
 * `crypto` (BoringSSL in Electron, several times faster than JS); SHA-3/BLAKE/XXH/CRC fall back to the
 * shared JS implementations — BoringSSL has no SHA-3, so `createHash('sha3-256')` would throw here.
 */
const NODE_ALGORITHMS: Partial<Record<HashAlgorithm, string>> = { MD5: 'md5', 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' };

export const nodeHasher: NativeHasherFactory = (algorithm) => {
  const name = NODE_ALGORITHMS[algorithm];
  if (!name) return null;
  const hash = createHash(name);
  return { update: (bytes) => void hash.update(bytes), digest: () => hash.digest('hex') };
};

export interface HashFileOptions {
  readonly signal?: AbortSignal;
  readonly start?: number;
  /** Inclusive end offset, as `createReadStream` takes it. */
  readonly end?: number;
  readonly onBytes?: (bytes: number) => void;
}

export async function hashFile(path: string, algorithms: readonly HashAlgorithm[], options: HashFileOptions = {}): Promise<Record<string, string>> {
  const hashers: [HashAlgorithm, StreamingHasher][] = await Promise.all(algorithms.map(async (algorithm) => [algorithm, await createStreamingHasher(algorithm, nodeHasher)] as [HashAlgorithm, StreamingHasher]));
  const stream = createReadStream(path, { start: options.start, end: options.end, highWaterMark: 1024 * 1024, signal: options.signal });
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    for (const [, hasher] of hashers) hasher.update(chunk);
    options.onBytes?.(chunk.length);
  }
  return Object.fromEntries(hashers.map(([algorithm, hasher]) => [algorithm, hasher.digest()]));
}
