import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { HostFacilityUnavailableError } from '@dude/crypto/host';

type HashFn = Parameters<typeof hmac>[0];
const HASHES: Readonly<Record<string, HashFn>> = { 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 };
type AlgorithmIdentifier = string | { readonly name: string; readonly hash?: AlgorithmIdentifier };
type Source = ArrayBuffer | ArrayBufferView;

export class UnsupportedSubtleOperationError extends HostFacilityUnavailableError {
  constructor(operation: string) { super(`crypto.subtle.${operation} (mobile supports only digest and HMAC)`); this.name = 'UnsupportedSubtleOperationError'; }
}

function algorithmName(algorithm: AlgorithmIdentifier): string { return (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase(); }
function hashFor(algorithm: AlgorithmIdentifier | undefined): { readonly name: string; readonly fn: HashFn } {
  if (algorithm === undefined) throw new TypeError('A hash algorithm is required.');
  const name = algorithmName(algorithm);
  const fn = HASHES[name];
  if (!fn) throw new UnsupportedSubtleOperationError(`hash ${name}`);
  return { name, fn };
}
type Bytes = Uint8Array<ArrayBuffer>;
function bytesOf(data: Source): Bytes {
  if (data instanceof ArrayBuffer || Object.prototype.toString.call(data) === '[object ArrayBuffer]') return new Uint8Array(data as ArrayBuffer) as Bytes;
  const view = data as ArrayBufferView;
  if (view && typeof view.byteLength === 'number' && view.buffer) return new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);
  throw new TypeError('Expected an ArrayBuffer or ArrayBufferView.');
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.slice().buffer as ArrayBuffer; }

interface HmacKey { readonly type: 'secret'; readonly extractable: boolean; readonly algorithm: { readonly name: 'HMAC'; readonly hash: { readonly name: string }; readonly length: number }; readonly usages: readonly string[] }
const keyBytes = new WeakMap<object, Uint8Array>();
function hmacKey(key: unknown): { readonly bytes: Uint8Array; readonly hash: HashFn } {
  const bytes = key && typeof key === 'object' ? keyBytes.get(key) : undefined;
  if (!bytes) throw new TypeError('Key was not created by this host.');
  return { bytes, hash: hashFor((key as HmacKey).algorithm.hash).fn };
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}
const unsupported = (operation: string) => () => Promise.reject(new UnsupportedSubtleOperationError(operation));

/** A WebCrypto SubtleCrypto subset (digest and HMAC) backed by @noble/hashes; everything else rejects explicitly. */
export function createSubtleSubset(): SubtleCrypto {
  const subset = {
    async digest(algorithm: AlgorithmIdentifier, data: Source): Promise<ArrayBuffer> { return toArrayBuffer(hashFor(algorithm).fn(bytesOf(data))); },
    async importKey(format: string, data: Source, algorithm: AlgorithmIdentifier, extractable: boolean, usages: readonly string[]): Promise<HmacKey> {
      if (format !== 'raw') throw new UnsupportedSubtleOperationError(`importKey(${format})`);
      if (algorithmName(algorithm) !== 'HMAC') throw new UnsupportedSubtleOperationError(`importKey(${algorithmName(algorithm)})`);
      const hash = hashFor(typeof algorithm === 'string' ? undefined : algorithm.hash);
      const bytes = bytesOf(data).slice();
      const key: HmacKey = { type: 'secret', extractable, algorithm: { name: 'HMAC', hash: { name: hash.name }, length: bytes.length * 8 }, usages: [...usages] };
      keyBytes.set(key, bytes);
      return key;
    },
    async sign(algorithm: AlgorithmIdentifier, key: unknown, data: Source): Promise<ArrayBuffer> {
      if (algorithmName(algorithm) !== 'HMAC') throw new UnsupportedSubtleOperationError(`sign(${algorithmName(algorithm)})`);
      const { bytes, hash } = hmacKey(key);
      return toArrayBuffer(hmac(hash, bytes, bytesOf(data)));
    },
    async verify(algorithm: AlgorithmIdentifier, key: unknown, signature: Source, data: Source): Promise<boolean> {
      if (algorithmName(algorithm) !== 'HMAC') throw new UnsupportedSubtleOperationError(`verify(${algorithmName(algorithm)})`);
      const { bytes, hash } = hmacKey(key);
      return equal(hmac(hash, bytes, bytesOf(data)), bytesOf(signature));
    },
    encrypt: unsupported('encrypt'), decrypt: unsupported('decrypt'), deriveBits: unsupported('deriveBits'), deriveKey: unsupported('deriveKey'),
    exportKey: unsupported('exportKey'), generateKey: unsupported('generateKey'), unwrapKey: unsupported('unwrapKey'), wrapKey: unsupported('wrapKey'),
  };
  return subset as unknown as SubtleCrypto;
}
