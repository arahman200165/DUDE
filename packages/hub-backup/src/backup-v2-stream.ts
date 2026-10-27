import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { BackupError } from './backup-error.js';
import { BACKUP_MAGIC, KEY_BYTES, NONCE_BYTES, TAG_BYTES, concatBytes, u32be } from './backup-format.js';
import {
  TRAILER_BYTES,
  V2_MAX_CHUNKS,
  checkMagic,
  encoder,
  equalBytes,
  headerLengthOf,
  parseHeaderJson,
  readU64be,
  u64be,
  type ParsedPrefix,
} from './backup-v2-format.js';

/** One write-once object being written. Each `write` resolves when the bytes are accepted (backpressure). */
export interface ObjectWriteStream {
  write(bytes: Uint8Array): Promise<void>;
  /** Makes the object visible under its name; until then it does not exist. */
  commit(): Promise<void>;
  /** Discards an uncommitted object; never throws for an already-closed stream. */
  abort(): Promise<void>;
}

/**
 * Where a backup writer puts objects (local directory, S3-compatible bucket, standby, drive). `create` MUST
 * refuse a name that already exists or is being written: write-once names are what make every (key, nonce)
 * pair unique across backups.
 */
export interface ObjectSink {
  create(name: string): Promise<ObjectWriteStream>;
}

/**
 * Where a backup reader gets objects. `read` streams an object's bytes from `start` (default 0) to its end.
 * A missing object should throw (`BackupError('integrity')` or the destination's own error, passed through).
 */
export interface ObjectSource {
  read(name: string, start?: number): AsyncIterable<Uint8Array>;
}

const EMPTY = new Uint8Array(0);

/** Pulls exact byte counts out of an async byte stream, holding at most one source piece. */
export class ByteReader {
  private readonly iterator: AsyncIterator<Uint8Array>;
  private head: Uint8Array = EMPTY;
  private finished = false;
  /** Bytes taken out of the source so far (for in-flight accounting in specs). */
  consumed = 0;

  constructor(source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>) {
    const asyncSource = source as AsyncIterable<Uint8Array>;
    if (typeof asyncSource[Symbol.asyncIterator] === 'function') this.iterator = asyncSource[Symbol.asyncIterator]();
    else {
      const sync = (source as Iterable<Uint8Array>)[Symbol.iterator]();
      this.iterator = { next: async () => sync.next(), return: async () => sync.return?.() ?? { done: true, value: undefined } };
    }
  }

  private async pull(): Promise<boolean> {
    while (this.head.length === 0) {
      if (this.finished) return false;
      const next = await this.iterator.next();
      if (next.done) {
        this.finished = true;
        return false;
      }
      if (!(next.value instanceof Uint8Array)) throw new BackupError('bad-input', 'A backup source yielded something other than bytes.');
      this.head = next.value;
      this.consumed += next.value.length;
    }
    return true;
  }

  /** Exactly `n` fresh bytes, or null when the stream ends first. */
  async readExact(n: number): Promise<Uint8Array | null> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      if (!(await this.pull())) return null;
      const take = Math.min(n - filled, this.head.length);
      out.set(this.head.subarray(0, take), filled);
      this.head = this.head.subarray(take);
      filled += take;
    }
    return out;
  }

  /** Everything left (at most `limit` bytes), or null when more than `limit` bytes remain. */
  async readAll(limit: number): Promise<Uint8Array | null> {
    const parts: Uint8Array[] = [];
    let total = 0;
    while (await this.pull()) {
      total += this.head.length;
      if (total > limit) return null;
      parts.push(this.head.slice());
      this.head = EMPTY;
    }
    return concatBytes(parts);
  }

  async atEnd(): Promise<boolean> {
    return !(await this.pull());
  }

  async close(): Promise<void> {
    this.head = EMPTY;
    if (!this.finished) {
      this.finished = true;
      await this.iterator.return?.();
    }
  }
}

/** Reads magic, length and header JSON from the start of an object and applies the version gate. */
export async function readPrefix(reader: ByteReader): Promise<ParsedPrefix> {
  const prefix = (await reader.readExact(BACKUP_MAGIC.length + 4)) ?? EMPTY;
  checkMagic(prefix);
  const headerBytes = await reader.readExact(headerLengthOf(prefix));
  if (headerBytes === null) throw new BackupError('truncated', 'The backup ends inside its header.');
  return parseHeaderJson(headerBytes);
}

/** HKDF-SHA256 subkey; `info` strings are fixed domain labels so subkeys never coincide. */
export function deriveSubkey(ikm: Uint8Array, salt: Uint8Array, info: string): Uint8Array {
  return hkdf(sha256, ikm, salt, encoder.encode(`dude-backup-v2 ${info}`), KEY_BYTES);
}

/** Per-object key: the kind key bound to the object's name, so a renamed or swapped object never decrypts. */
export function objectKey(kindKey: Uint8Array, name: string): Uint8Array {
  return hkdf(sha256, kindKey, undefined, encoder.encode(`dude-backup-v2 object ${name}`), KEY_BYTES);
}

/** 16-byte object id then a u64 big-endian chunk counter: unique per (object, counter) by construction. */
export function chunkNonceV2(prefix: Uint8Array, counter: number): Uint8Array {
  if (prefix.length !== 16 || !Number.isInteger(counter) || counter < 0 || counter > V2_MAX_CHUNKS) throw new BackupError('bad-input', 'Invalid chunk nonce input.');
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce.set(prefix, 0);
  nonce.set(u64be(counter), 16);
  return nonce;
}

/** SHA-256 of the exact header bytes, the u64 counter and the final-chunk flag. */
export function chunkAadV2(headerHash: Uint8Array, counter: number, final: boolean): Uint8Array {
  return concatBytes([headerHash, u64be(counter), new Uint8Array([final ? 1 : 0])]);
}

function chainStep(chain: Uint8Array, counter: number, tag: Uint8Array): Uint8Array {
  return sha256(concatBytes([chain, u64be(counter), tag]));
}

function tryOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array | null {
  try {
    return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
  } catch {
    return null;
  }
}

export interface SealedContext {
  /** Per-object key (`objectKey`). */
  key: Uint8Array;
  prefix: Uint8Array;
  headerHash: Uint8Array;
  chunkSize: number;
}

export interface SealedStats {
  chunks: number;
  bytes: number;
}

/**
 * Writes one sealed object: the header prefix, then `u32 length || ciphertext+tag` frames of exactly
 * `chunkSize` plaintext bytes (only the last data chunk may be short), then a final trailer chunk carrying the
 * data-chunk count, the plaintext byte count and a SHA-256 chain over every data chunk's tag. Holds one chunk.
 */
export class SealedWriter {
  private readonly buffer: Uint8Array;
  private filled = 0;
  private counter = 0;
  private sealedBytes = 0;
  private chain: Uint8Array;
  private done = false;

  private constructor(
    private readonly ctx: SealedContext,
    private readonly out: ObjectWriteStream,
  ) {
    this.buffer = new Uint8Array(ctx.chunkSize);
    this.chain = ctx.headerHash.slice();
  }

  static async open(sink: ObjectSink, name: string, headerPrefix: Uint8Array, ctx: SealedContext): Promise<SealedWriter> {
    const out = await sink.create(name);
    try {
      await out.write(headerPrefix);
    } catch (error) {
      await out.abort().catch(() => undefined);
      throw error;
    }
    return new SealedWriter(ctx, out);
  }

  /** Plaintext bytes written so far (the offset the next byte lands at). */
  get position(): number {
    return this.sealedBytes + this.filled;
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.done) throw new BackupError('bad-input', 'The backup object is already closed.');
    let offset = 0;
    while (offset < data.length) {
      const take = Math.min(this.ctx.chunkSize - this.filled, data.length - offset);
      this.buffer.set(data.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.ctx.chunkSize) await this.seal();
    }
  }

  private async seal(): Promise<void> {
    if (this.counter >= V2_MAX_CHUNKS) throw new BackupError('too-large', 'The backup object has too many chunks.');
    const plain = this.buffer.subarray(0, this.filled);
    const { key, prefix, headerHash } = this.ctx;
    const sealed = xchacha20poly1305(key, chunkNonceV2(prefix, this.counter), chunkAadV2(headerHash, this.counter, false)).encrypt(plain);
    this.chain = chainStep(this.chain, this.counter, sealed.subarray(sealed.length - TAG_BYTES));
    this.sealedBytes += this.filled;
    this.counter++;
    plain.fill(0);
    this.filled = 0;
    await this.out.write(concatBytes([u32be(sealed.length), sealed]));
  }

  /** Seals the last data chunk and the trailer, then commits the object. */
  async finish(): Promise<SealedStats> {
    if (this.done) throw new BackupError('bad-input', 'The backup object is already closed.');
    if (this.filled > 0) await this.seal();
    this.done = true;
    const trailer = concatBytes([u64be(this.counter), u64be(this.sealedBytes), this.chain]);
    const { key, prefix, headerHash } = this.ctx;
    const sealed = xchacha20poly1305(key, chunkNonceV2(prefix, this.counter), chunkAadV2(headerHash, this.counter, true)).encrypt(trailer);
    await this.out.write(concatBytes([u32be(sealed.length), sealed]));
    await this.out.commit();
    this.buffer.fill(0);
    return { chunks: this.counter, bytes: this.sealedBytes };
  }

  async abort(): Promise<void> {
    this.done = true;
    this.buffer.fill(0);
    await this.out.abort().catch(() => undefined);
  }
}

async function readFrame(reader: ByteReader, chunkSize: number): Promise<Uint8Array> {
  const lengthBytes = await reader.readExact(4);
  if (lengthBytes === null) throw new BackupError('truncated', 'The backup object ends inside a chunk.');
  const length = new DataView(lengthBytes.buffer).getUint32(0, false);
  if (length < TAG_BYTES || length > chunkSize + TAG_BYTES) throw new BackupError('integrity', 'The backup contains an invalid chunk.');
  const frame = await reader.readExact(length);
  if (frame === null) throw new BackupError('truncated', 'The backup object ends inside a chunk.');
  return frame;
}

/**
 * Streams and authenticates every chunk of a sealed object positioned just after its header, yielding each
 * data chunk's plaintext only after its tag verified. Ends cleanly only after the trailer matched the counts and
 * the tag chain and nothing follows it; a missing trailer is `truncated`, anything reordered, duplicated, dropped,
 * spliced or appended is `integrity`. `stats` receives the trailer counts.
 */
export async function* readSealed(reader: ByteReader, ctx: SealedContext, stats?: SealedStats): AsyncGenerator<Uint8Array> {
  const { key, prefix, headerHash, chunkSize } = ctx;
  let counter = 0;
  let bytes = 0;
  let chain: Uint8Array = headerHash.slice();
  let sawShort = false;
  for (;;) {
    if (await reader.atEnd()) throw new BackupError('truncated', 'The backup object ends before its final chunk.');
    const frame = await readFrame(reader, chunkSize);
    if (counter > V2_MAX_CHUNKS) throw new BackupError('integrity', 'The backup object has too many chunks.');
    const nonce = chunkNonceV2(prefix, counter);
    const plain = tryOpen(key, nonce, chunkAadV2(headerHash, counter, false), frame);
    if (plain !== null) {
      // Only the last data chunk may be short, and none may be empty: ranged reads depend on it.
      if (sawShort || plain.length === 0) throw new BackupError('integrity', 'The backup object has a malformed chunk layout.');
      if (plain.length < chunkSize) sawShort = true;
      chain = chainStep(chain, counter, frame.subarray(frame.length - TAG_BYTES));
      bytes += plain.length;
      counter++;
      yield plain;
      continue;
    }
    const trailer = tryOpen(key, nonce, chunkAadV2(headerHash, counter, true), frame);
    if (trailer === null) throw new BackupError('integrity', 'The backup failed its integrity check.');
    if (trailer.length !== TRAILER_BYTES || readU64be(trailer, 0) !== counter || readU64be(trailer, 8) !== bytes || !equalBytes(trailer.subarray(16), chain)) {
      throw new BackupError('integrity', 'The backup object trailer does not match its chunks.');
    }
    if (!(await reader.atEnd())) throw new BackupError('integrity', 'The backup object has data after its final chunk.');
    if (stats) {
      stats.chunks = counter;
      stats.bytes = bytes;
    }
    return;
  }
}

/** Byte offset of data chunk `index` in an object whose header occupies `headerLength` bytes. */
export function frameOffset(headerLength: number, chunkSize: number, index: number): number {
  return headerLength + index * (4 + chunkSize + TAG_BYTES);
}

/** Reads and authenticates the data chunk `index` at the reader's position; the trailer there is `integrity`. */
export async function readDataChunk(reader: ByteReader, ctx: SealedContext, index: number): Promise<Uint8Array> {
  if (await reader.atEnd()) throw new BackupError('truncated', 'The backup object ends before the referenced data.');
  const frame = await readFrame(reader, ctx.chunkSize);
  const plain = tryOpen(ctx.key, chunkNonceV2(ctx.prefix, index), chunkAadV2(ctx.headerHash, index, false), frame);
  if (plain === null) throw new BackupError('integrity', 'The backup failed its integrity check.');
  return plain;
}

export function headerHashOf(headerBytes: Uint8Array): Uint8Array {
  return sha256(headerBytes);
}
