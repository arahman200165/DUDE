import type { Readable } from 'node:stream';

/** Everything `put` accepts: a buffer, or any async-iterable of bytes (a Node `Readable` or a web `ReadableStream`). */
export type BlobSource = Uint8Array | AsyncIterable<Uint8Array>;

export interface BlobPutOptions {
  /** When given, the stored bytes must hash to this value or `put` throws `BlobHashMismatchError` and keeps nothing. */
  expectedSha256?: string;
  /** Ceiling in bytes; a longer body aborts with `BlobTooLargeError`. Default: none (uploads are bounded by free disk). */
  maxBytes?: number;
}

export interface BlobPutResult {
  sha256: string;
  size: number;
  /** False when the content was already stored (a dedupe hit): nothing new was written. */
  created: boolean;
}

export interface BlobRange {
  /** Inclusive byte offsets, as in an HTTP `Range` header. `end` defaults to the last byte. */
  start: number;
  end?: number;
}

export interface BlobStat {
  size: number;
  storedAt: string;
}

export type BlobVerifyResult = 'ok' | 'missing' | 'corrupt';

/**
 * Content-addressed blob storage (PD-118, PD-148). A blob is identified by the lowercase hex SHA-256 of its bytes, is written once
 * and never modified, and is never read whole into memory: every method streams. `delete` is for garbage collection only
 * (`blob-gc.ts`), never for a request handler. A later S3-compatible mirror (deferred) implements the same interface.
 */
export interface BlobStore {
  put(body: BlobSource, options?: BlobPutOptions): Promise<BlobPutResult>;
  /** A byte stream of the blob (or of `range`); throws `BlobNotFoundError` when it is not stored. */
  open(sha256: string, range?: BlobRange): Promise<Readable>;
  stat(sha256: string): Promise<BlobStat | null>;
  has(sha256: string): Promise<boolean>;
  /** Ascending by hash, strictly after `after`. */
  list(after?: string, limit?: number): Promise<Array<{ sha256: string; size: number }>>;
  /** Garbage collection only. Idempotent: deleting an absent blob is not an error. */
  delete(sha256: string): Promise<void>;
  /** Re-hashes the stored bytes (streaming). */
  verify(sha256: string): Promise<BlobVerifyResult>;
}

export class InvalidBlobHashError extends Error {
  constructor() {
    super('A blob hash must be 64 lowercase hexadecimal characters.');
    this.name = 'InvalidBlobHashError';
  }
}

export class BlobNotFoundError extends Error {
  constructor() {
    super('The blob is not stored.');
    this.name = 'BlobNotFoundError';
  }
}

export class BlobHashMismatchError extends Error {
  constructor() {
    super('The content does not match the expected SHA-256.');
    this.name = 'BlobHashMismatchError';
  }
}

export class BlobTooLargeError extends Error {
  constructor() {
    super('The content is larger than the allowed size.');
    this.name = 'BlobTooLargeError';
  }
}

export class InvalidBlobRangeError extends Error {
  constructor() {
    super('The byte range is outside the blob.');
    this.name = 'InvalidBlobRangeError';
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isBlobHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

/** The only gate between a caller-supplied hash and a filesystem path: strict lowercase hex, so no separator or dot can pass. */
export function assertBlobHash(value: unknown): asserts value is string {
  if (!isBlobHash(value)) throw new InvalidBlobHashError();
}
