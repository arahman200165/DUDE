import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FILE_PATTERN,
  BackupError,
  DEFAULT_KDF_PARAMS,
  MAX_BACKUP_PLAINTEXT_BYTES,
  backupFileName,
  deriveBackupKey,
  openBackup,
  readBackupHeader,
  sealBackup,
  type BackupDeps,
  type BackupErrorCode,
  type BackupInput,
  type KdfParams,
} from './index.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAGIC_LENGTH = 8;
const FIXED_NOW = new Date('2026-10-04T12:34:56.789Z');
const INSTANCE_ID = 'hub-instance-0f3a9c1e-secret-marker';

function makeDeps(): BackupDeps & { deriveKey: ReturnType<typeof vi.fn> } {
  let counter = 0;
  const deriveKey = vi.fn(async (passphrase: Uint8Array, salt: Uint8Array, params: KdfParams) => {
    let state = new Uint8Array([...salt, ...passphrase, params.m & 255, params.t, params.p]);
    for (let round = 0; round < 3; round++) state = sha256(state);
    return state;
  });
  return {
    deriveKey,
    randomBytes: (n: number) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = (counter++ * 37 + 11) & 255;
      return out;
    },
    now: () => FIXED_NOW,
  };
}

function patterned(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 255;
  return out;
}

function makeInput(overrides: Partial<BackupInput> = {}): BackupInput {
  return {
    files: [
      { name: 'hub.sqlite', bytes: patterned(210 * 1024, 1) },
      { name: 'empty.bin', bytes: new Uint8Array(0) },
      { name: 'settings.json', bytes: encoder.encode('{"a":1}') },
    ],
    hubVersion: '1.2.3',
    source: { hubInstanceId: INSTANCE_ID, authorityEpoch: 4, schemaVersion: 9, dbMinReaderVersion: 2 },
    forTransfer: false,
    counts: { devices: 3, items: 120 },
    ...overrides,
  };
}

async function codeOf(promise: Promise<unknown> | (() => unknown)): Promise<BackupErrorCode> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    if (error instanceof BackupError) return error.code;
    throw error;
  }
  throw new Error('Expected a BackupError');
}

interface Parts {
  headerJson: Record<string, unknown>;
  chunks: Uint8Array[]; // each includes its 4-byte length prefix
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function split(file: Uint8Array): Parts {
  const headerLength = view(file).getUint32(MAGIC_LENGTH, false);
  const headerEnd = MAGIC_LENGTH + 4 + headerLength;
  const headerJson = JSON.parse(decoder.decode(file.subarray(MAGIC_LENGTH + 4, headerEnd))) as Record<string, unknown>;
  const chunks: Uint8Array[] = [];
  let position = headerEnd;
  while (position < file.length) {
    const length = view(file).getUint32(position, false);
    chunks.push(file.slice(position, position + 4 + length));
    position += 4 + length;
  }
  return { headerJson, chunks };
}

function join(headerJson: Record<string, unknown>, chunks: Uint8Array[]): Uint8Array {
  const header = encoder.encode(JSON.stringify(headerJson));
  const length = new Uint8Array(4);
  view(length).setUint32(0, header.length, false);
  const parts = [encoder.encode('DUDEBKUP'), length, header, ...chunks];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe('sealBackup / openBackup', () => {
  it('round-trips several files including an empty one and a multi-chunk one', async () => {
    const deps = makeDeps();
    const input = makeInput();
    const sealed = await sealBackup(input, { passphrase: 'correct horse' }, deps);
    expect(split(sealed).chunks.length).toBeGreaterThan(3);
    const opened = await openBackup(sealed, { passphrase: 'correct horse' }, deps);
    expect([...opened.files.keys()]).toEqual(['hub.sqlite', 'empty.bin', 'settings.json']);
    for (const file of input.files) expect(opened.files.get(file.name)).toEqual(file.bytes);
    expect(opened.manifest).toMatchObject({
      formatVersion: 1,
      minReaderVersion: 1,
      createdAt: FIXED_NOW.toISOString(),
      hubVersion: '1.2.3',
      source: input.source,
      forTransfer: false,
      counts: { devices: 3, items: 120 },
    });
    expect(opened.manifest.files.map(file => file.size)).toEqual([210 * 1024, 0, 7]);
    expect(opened.header).toMatchObject({ formatVersion: 1, cipher: 'xchacha20poly1305', chunkSize: 65536 });
    expect(opened.header.kdf).toMatchObject({ name: 'argon2id', ...DEFAULT_KDF_PARAMS });
  });

  it('seals an empty backup (no files) as a single final chunk', async () => {
    const deps = makeDeps();
    const sealed = await sealBackup(makeInput({ files: [] }), { passphrase: 'x' }, deps);
    expect(split(sealed).chunks).toHaveLength(1);
    const opened = await openBackup(sealed, { passphrase: 'x' }, deps);
    expect(opened.files.size).toBe(0);
    expect(opened.manifest.counts).toEqual({ devices: 3, items: 120 });
  });

  it('fails with wrong-passphrase-or-corrupt for a wrong passphrase', async () => {
    const deps = makeDeps();
    const sealed = await sealBackup(makeInput(), { passphrase: 'right' }, deps);
    expect(await codeOf(openBackup(sealed, { passphrase: 'wrong' }, deps))).toBe('wrong-passphrase-or-corrupt');
  });

  it('keeps the manifest and Hub data out of the plaintext header and file bytes', async () => {
    const deps = makeDeps();
    const sealed = await sealBackup(makeInput(), { passphrase: 'pw' }, deps);
    expect(indexOfBytes(sealed, encoder.encode(INSTANCE_ID))).toBe(-1);
    expect(indexOfBytes(sealed, encoder.encode('hubInstanceId'))).toBe(-1);
    expect(indexOfBytes(sealed, encoder.encode('hub.sqlite'))).toBe(-1);
    const { headerJson } = split(sealed);
    expect(Object.keys(headerJson).sort()).toEqual(['chunkSize', 'cipher', 'formatVersion', 'kdf', 'minReaderVersion', 'streamId']);
    const text = JSON.stringify(headerJson);
    for (const key of ['hubVersion', 'source', 'files', 'counts', 'createdAt', 'forTransfer', 'hubInstanceId', 'sha256']) expect(text).not.toContain(key);
    expect(readBackupHeader(sealed)).toEqual(headerJson);
  });

  it('never repeats a stream id and reuses a derived key across backups', async () => {
    const deps = makeDeps();
    const derived = await deriveBackupKey('shared secret', deps);
    expect(deps.deriveKey).toHaveBeenCalledTimes(1);
    const keyBefore = derived.key.slice();
    const first = await sealBackup(makeInput(), { derived }, deps);
    const second = await sealBackup(makeInput({ forTransfer: true }), { derived }, deps);
    expect(deps.deriveKey).toHaveBeenCalledTimes(1);
    expect(derived.key).toEqual(keyBefore); // a caller-supplied key is not zeroed
    const a = readBackupHeader(first);
    const b = readBackupHeader(second);
    expect(a.streamId).not.toBe(b.streamId);
    expect(a.kdf.salt).toBe(b.kdf.salt);
    expect((await openBackup(first, { passphrase: 'shared secret' }, deps)).manifest.forTransfer).toBe(false);
    expect((await openBackup(second, { passphrase: 'shared secret' }, deps)).manifest.forTransfer).toBe(true);
    expect((await openBackup(second, { derived }, deps)).files.size).toBe(3);
  });

  it('zeroes the keys and passphrase bytes it created', async () => {
    const deps = makeDeps();
    const seen: Uint8Array[] = [];
    const spy: BackupDeps = {
      ...deps,
      deriveKey: async (passphrase, salt, params) => {
        const key = await deps.deriveKey(passphrase, salt, params);
        seen.push(passphrase, key);
        return key;
      },
    };
    const sealed = await sealBackup(makeInput({ files: [] }), { passphrase: 'zero me' }, spy);
    await openBackup(sealed, { passphrase: 'zero me' }, spy);
    expect(seen).toHaveLength(4);
    for (const bytes of seen) expect(bytes.every(byte => byte === 0)).toBe(true);
  });

  it('opens backups sealed with an NFKC-equivalent passphrase', async () => {
    const deps = makeDeps();
    const composed = 'café Ａ'; // e-acute and a fullwidth A
    const decomposed = 'café A';
    const sealed = await sealBackup(makeInput({ files: [] }), { passphrase: composed }, deps);
    expect((await openBackup(sealed, { passphrase: decomposed }, deps)).files.size).toBe(0);
    expect(await codeOf(openBackup(sealed, { passphrase: 'cafe A' }, deps))).toBe('wrong-passphrase-or-corrupt');
  });

  it('rejects an empty passphrase and invalid KDF output', async () => {
    const deps = makeDeps();
    expect(await codeOf(sealBackup(makeInput(), { passphrase: '' }, deps))).toBe('bad-input');
    const short: BackupDeps = { ...deps, deriveKey: async () => new Uint8Array(16) };
    expect(await codeOf(deriveBackupKey('x', short))).toBe('bad-input');
    expect(await codeOf(deriveBackupKey('x', deps, { m: 1, t: 1, p: 1, len: 32 }))).toBe('bad-input');
  });
});

describe('tamper detection', () => {
  async function sealed(): Promise<{ deps: ReturnType<typeof makeDeps>; file: Uint8Array }> {
    const deps = makeDeps();
    return { deps, file: await sealBackup(makeInput(), { passphrase: 'pw' }, deps) };
  }
  const open = (file: Uint8Array, deps: BackupDeps) => openBackup(file, { passphrase: 'pw' }, deps);

  it('rejects a flipped header byte', async () => {
    const { deps, file } = await sealed();
    const headerLength = view(file).getUint32(MAGIC_LENGTH, false);
    const text = decoder.decode(file.subarray(MAGIC_LENGTH + 4, MAGIC_LENGTH + 4 + headerLength));
    // Change one salt character to another valid base64url character: the header stays well-formed, authentication fails.
    const saltIndex = MAGIC_LENGTH + 4 + text.indexOf('"salt":"') + '"salt":"'.length;
    const salted = file.slice();
    salted[saltIndex] = salted[saltIndex] === 0x41 ? 0x42 : 0x41;
    expect(await codeOf(open(salted, deps))).toBe('wrong-passphrase-or-corrupt');
    // Any single-bit flip anywhere in the header is rejected one way or another.
    for (let offset = 0; offset < headerLength; offset++) {
      const tampered = file.slice();
      tampered[MAGIC_LENGTH + 4 + offset] ^= 0x01;
      await expect(open(tampered, deps)).rejects.toBeInstanceOf(BackupError);
    }
    const magic = file.slice();
    magic[0] ^= 0x01;
    expect(await codeOf(open(magic, deps))).toBe('bad-magic');
  });

  it('rejects a changed streamId, chunkSize or whitespace-only header edit', async () => {
    const { deps, file } = await sealed();
    const { headerJson, chunks } = split(file);
    expect(await codeOf(open(join({ ...headerJson, chunkSize: 65537 }, chunks), deps))).toBe('wrong-passphrase-or-corrupt');
    const streamId = String(headerJson['streamId']);
    const changed = (streamId[0] === 'A' ? 'B' : 'A') + streamId.slice(1);
    expect(await codeOf(open(join({ ...headerJson, streamId: changed }, chunks), deps))).toBe('wrong-passphrase-or-corrupt');
    expect(await codeOf(open(join({ ...headerJson, extra: 1 }, chunks), deps))).toBe('wrong-passphrase-or-corrupt');
  });

  it('rejects a flipped ciphertext byte (first and later chunks)', async () => {
    const { deps, file } = await sealed();
    const { headerJson, chunks } = split(file);
    const first = chunks.map(chunk => chunk.slice());
    first[0][10] ^= 0x80;
    expect(await codeOf(open(join(headerJson, first), deps))).toBe('wrong-passphrase-or-corrupt');
    const later = chunks.map(chunk => chunk.slice());
    later[2][10] ^= 0x80;
    expect(await codeOf(open(join(headerJson, later), deps))).toBe('integrity');
    const tag = chunks.map(chunk => chunk.slice());
    tag[tag.length - 1][tag[tag.length - 1].length - 1] ^= 0x01;
    expect(await codeOf(open(join(headerJson, tag), deps))).toBe('integrity');
  });

  it('rejects a dropped final chunk as truncated, and dropping every chunk', async () => {
    const { deps, file } = await sealed();
    const { headerJson, chunks } = split(file);
    expect(await codeOf(open(join(headerJson, chunks.slice(0, -1)), deps))).toBe('truncated');
    expect(await codeOf(open(join(headerJson, chunks.slice(0, 1)), deps))).toBe('truncated');
    expect(await codeOf(open(join(headerJson, []), deps))).toBe('truncated');
    expect(await codeOf(open(file.subarray(0, file.length - 5), deps))).toBe('truncated');
    expect(await codeOf(open(file.subarray(0, MAGIC_LENGTH + 10), deps))).toBe('truncated');
  });

  it('rejects swapped, duplicated and dropped-middle chunks', async () => {
    const { deps, file } = await sealed();
    const { headerJson, chunks } = split(file);
    const swapped = [...chunks];
    [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    expect(await codeOf(open(join(headerJson, swapped), deps))).toBe('integrity');
    const duplicated = [chunks[0], chunks[1], chunks[1], ...chunks.slice(2)];
    expect(await codeOf(open(join(headerJson, duplicated), deps))).toBe('integrity');
    const dropped = [chunks[0], ...chunks.slice(2)];
    expect(await codeOf(open(join(headerJson, dropped), deps))).toBe('integrity');
  });

  it('rejects appended trailing bytes', async () => {
    const { deps, file } = await sealed();
    const garbage = new Uint8Array(file.length + 5);
    garbage.set(file);
    garbage.set([0, 0, 0, 32, 1], file.length);
    expect(await codeOf(open(garbage, deps))).toBe('truncated');
    garbage.set([1, 2, 3, 4, 5], file.length);
    expect(await codeOf(open(garbage, deps))).toBe('integrity');
    const zeros = new Uint8Array(file.length + 4);
    zeros.set(file);
    expect(await codeOf(open(zeros, deps))).toBe('integrity');
    // A whole extra valid-looking chunk: the previous final chunk no longer authenticates as final.
    const { headerJson, chunks } = split(file);
    expect(await codeOf(open(join(headerJson, [...chunks, chunks[chunks.length - 1]]), deps))).toBe('integrity');
  });

  it('rejects a non-DUDE file', async () => {
    const deps = makeDeps();
    expect(await codeOf(openBackup(encoder.encode('PK\u0003\u0004 not a backup at all'), { passphrase: 'pw' }, deps))).toBe('bad-magic');
    expect(await codeOf(() => readBackupHeader(new Uint8Array(0)))).toBe('truncated');
    expect(await codeOf(() => readBackupHeader(encoder.encode('DUDEBK')))).toBe('truncated');
    expect(await codeOf(() => readBackupHeader(encoder.encode('XUDEBKUP')))).toBe('bad-magic');
  });
});

describe('header validation', () => {
  async function base(): Promise<{ deps: ReturnType<typeof makeDeps>; headerJson: Record<string, unknown>; chunks: Uint8Array[] }> {
    const deps = makeDeps();
    const file = await sealBackup(makeInput({ files: [] }), { passphrase: 'pw' }, deps);
    deps.deriveKey.mockClear();
    return { deps, ...split(file) };
  }

  it('refuses a newer minReaderVersion before deriving a key', async () => {
    const { deps, headerJson, chunks } = await base();
    const file = join({ ...headerJson, minReaderVersion: 2 }, chunks);
    expect(await codeOf(openBackup(file, { passphrase: 'pw' }, deps))).toBe('unsupported-version');
    expect(await codeOf(() => readBackupHeader(file))).toBe('unsupported-version');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  });

  it('refuses a manifest with a newer minReaderVersion even though it authenticates', async () => {
    const deps = makeDeps();
    const future = { ...deps };
    // Seal through a patched Date so the manifest is otherwise valid, then rewrite via the internal path: a manifest
    // minReaderVersion cannot be forged without the key, so seal a tweaked manifest by monkey-patching JSON.stringify once.
    const original = JSON.stringify;
    let patched = false;
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation((value: unknown, ...rest: unknown[]) => {
      if (!patched && value !== null && typeof value === 'object' && 'createdAt' in (value as object)) {
        patched = true;
        return (original as (v: unknown, ...r: unknown[]) => string)({ ...(value as object), minReaderVersion: 2 }, ...rest);
      }
      return (original as (v: unknown, ...r: unknown[]) => string)(value, ...rest);
    });
    let file: Uint8Array;
    try {
      file = await sealBackup(makeInput({ files: [] }), { passphrase: 'pw' }, future);
    } finally {
      spy.mockRestore();
    }
    expect(readBackupHeader(file).minReaderVersion).toBe(1);
    expect(await codeOf(openBackup(file, { passphrase: 'pw' }, deps))).toBe('unsupported-version');
  });

  it('refuses unknown ciphers and KDFs', async () => {
    const { deps, headerJson, chunks } = await base();
    const kdf = headerJson['kdf'] as Record<string, unknown>;
    expect(await codeOf(openBackup(join({ ...headerJson, cipher: 'aes-256-gcm' }, chunks), { passphrase: 'pw' }, deps))).toBe('unsupported-version');
    expect(await codeOf(openBackup(join({ ...headerJson, kdf: { ...kdf, name: 'scrypt' } }, chunks), { passphrase: 'pw' }, deps))).toBe('unsupported-version');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  });

  it.each([
    ['huge memory', { m: 4 * 1024 * 1024 }],
    ['tiny memory', { m: 1024 }],
    ['zero passes', { t: 0 }],
    ['many passes', { t: 11 }],
    ['zero lanes', { p: 0 }],
    ['many lanes', { p: 17 }],
    ['wrong key length', { len: 64 }],
    ['fractional memory', { m: 65536.5 }],
    ['string memory', { m: '65536' }],
  ])('rejects hostile KDF parameters (%s) before calling deriveKey', async (_label, override) => {
    const { deps, headerJson, chunks } = await base();
    const kdf = headerJson['kdf'] as Record<string, unknown>;
    const file = join({ ...headerJson, kdf: { ...kdf, ...override } }, chunks);
    expect(await codeOf(openBackup(file, { passphrase: 'pw' }, deps))).toBe('bad-header');
    expect(await codeOf(() => readBackupHeader(file))).toBe('bad-header');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  });

  it('rejects malformed salts, stream ids, chunk sizes and JSON', async () => {
    const { deps, headerJson, chunks } = await base();
    const kdf = headerJson['kdf'] as Record<string, unknown>;
    for (const bad of [
      { ...headerJson, chunkSize: 0 },
      { ...headerJson, chunkSize: 2 ** 31 },
      { ...headerJson, streamId: 'short' },
      { ...headerJson, kdf: { ...kdf, salt: 'AAAA' } },
      { ...headerJson, formatVersion: 'one' },
      { ...headerJson, minReaderVersion: 0 },
    ]) {
      expect(await codeOf(openBackup(join(bad, chunks), { passphrase: 'pw' }, deps))).toBe('bad-header');
    }
    const garbage = new Uint8Array([...encoder.encode('DUDEBKUP'), 0, 0, 0, 3, ...encoder.encode('{{{'), 0, 0, 0, 16]);
    expect(await codeOf(openBackup(garbage, { passphrase: 'pw' }, deps))).toBe('bad-header');
    const huge = new Uint8Array([...encoder.encode('DUDEBKUP'), 0xff, 0xff, 0xff, 0xff]);
    expect(await codeOf(openBackup(huge, { passphrase: 'pw' }, deps))).toBe('bad-header');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  });
});

describe('file names and limits', () => {
  it.each([
    ['empty', ''],
    ['dot', '.'],
    ['dot-dot', '..'],
    ['leading dot', '.hidden'],
    ['traversal', '../etc/passwd'],
    ['slash', 'a/b'],
    ['backslash', 'a\\b'],
    ['space', 'a b'],
    ['colon', 'C:evil'],
    ['too long', 'a'.repeat(65)],
    ['non-ascii', 'café.db'],
  ])('rejects the unsafe file name (%s)', async (_label, name) => {
    const deps = makeDeps();
    const input = makeInput({ files: [{ name, bytes: new Uint8Array(1) }] });
    expect(await codeOf(sealBackup(input, { passphrase: 'pw' }, deps))).toBe('bad-input');
  });

  it('accepts a 64-character name and rejects duplicates, including case-folded ones', async () => {
    const deps = makeDeps();
    const longest = 'a'.repeat(64);
    const ok = await sealBackup(makeInput({ files: [{ name: longest, bytes: new Uint8Array(1) }] }), { passphrase: 'pw' }, deps);
    expect((await openBackup(ok, { passphrase: 'pw' }, deps)).files.has(longest)).toBe(true);
    const duplicate = makeInput({ files: [{ name: 'a.db', bytes: new Uint8Array(1) }, { name: 'a.db', bytes: new Uint8Array(1) }] });
    expect(await codeOf(sealBackup(duplicate, { passphrase: 'pw' }, deps))).toBe('bad-input');
    const folded = makeInput({ files: [{ name: 'a.db', bytes: new Uint8Array(1) }, { name: 'A.DB', bytes: new Uint8Array(1) }] });
    expect(await codeOf(sealBackup(folded, { passphrase: 'pw' }, deps))).toBe('bad-input');
  });

  it('allows at most 32 files', async () => {
    const deps = makeDeps();
    const files = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `f${i}.bin`, bytes: new Uint8Array(1) }));
    const sealed = await sealBackup(makeInput({ files: files(32) }), { passphrase: 'pw' }, deps);
    expect((await openBackup(sealed, { passphrase: 'pw' }, deps)).files.size).toBe(32);
    expect(await codeOf(sealBackup(makeInput({ files: files(33) }), { passphrase: 'pw' }, deps))).toBe('too-large');
  });

  it('rejects a backup larger than the plaintext limit on create, before deriving a key', async () => {
    const deps = makeDeps();
    const input = makeInput({ files: [{ name: 'big.bin', bytes: new Uint8Array(MAX_BACKUP_PLAINTEXT_BYTES + 1) }] });
    expect(await codeOf(sealBackup(input, { passphrase: 'pw' }, deps))).toBe('too-large');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  });

  it('rejects an oversize chunk stream on open before deriving a key', async () => {
    const deps = makeDeps();
    const sealed = await sealBackup(makeInput({ files: [] }), { passphrase: 'pw' }, deps);
    const { headerJson } = split(sealed);
    deps.deriveKey.mockClear();
    const chunkSize = 1024 * 1024;
    const frame = chunkSize + 16;
    const count = Math.floor(MAX_BACKUP_PLAINTEXT_BYTES / chunkSize) + 1;
    const header = encoder.encode(JSON.stringify({ ...headerJson, chunkSize }));
    const file = new Uint8Array(MAGIC_LENGTH + 4 + header.length + count * (4 + frame));
    file.set(encoder.encode('DUDEBKUP'), 0);
    view(file).setUint32(MAGIC_LENGTH, header.length, false);
    file.set(header, MAGIC_LENGTH + 4);
    let position = MAGIC_LENGTH + 4 + header.length;
    for (let i = 0; i < count; i++) {
      view(file).setUint32(position, frame, false);
      position += 4 + frame;
    }
    expect(await codeOf(openBackup(file, { passphrase: 'pw' }, deps))).toBe('too-large');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  }, 60000);

  it('rejects invalid sealing input', async () => {
    const deps = makeDeps();
    const input = makeInput();
    expect(await codeOf(sealBackup({ ...input, source: { ...input.source, authorityEpoch: -1 } }, { passphrase: 'pw' }, deps))).toBe('bad-input');
    expect(await codeOf(sealBackup({ ...input, counts: { a: Number.NaN } }, { passphrase: 'pw' }, deps))).toBe('bad-input');
    expect(await codeOf(sealBackup({ ...input, hubVersion: 3 as unknown as string }, { passphrase: 'pw' }, deps))).toBe('bad-input');
    const wrongSalt = { key: new Uint8Array(32), salt: new Uint8Array(8), params: DEFAULT_KDF_PARAMS };
    expect(await codeOf(sealBackup(input, { derived: wrongSalt }, deps))).toBe('bad-input');
  });
});

describe('backupFileName', () => {
  it('formats a UTC timestamp', () => {
    expect(backupFileName(new Date('2026-10-04T12:34:56.789Z'))).toBe('dude-hub-20261004T123456Z.dudebackup');
    expect(backupFileName(new Date('2026-01-02T03:04:05Z'))).toBe('dude-hub-20260102T030405Z.dudebackup');
  });

  it('is matched by BACKUP_FILE_PATTERN, which rejects everything else', () => {
    for (const iso of ['2026-10-04T12:34:56Z', '2026-12-31T23:59:59Z', '2000-01-01T00:00:00Z']) {
      expect(BACKUP_FILE_PATTERN.test(backupFileName(new Date(iso)))).toBe(true);
    }
    for (const name of [
      'dude-hub-20261004T123456Z.dudebackup.bak',
      'x/dude-hub-20261004T123456Z.dudebackup',
      '../dude-hub-20261004T123456Z.dudebackup',
      'dude-hub-20261304T123456Z.dudebackup',
      'dude-hub-20261004T246000Z.dudebackup',
      'dude-hub-20261004T123456.dudebackup',
      'dude-hub-20261004T123456Z.dudebackup\n',
      'DUDE-HUB-20261004T123456Z.dudebackup',
    ]) {
      expect(BACKUP_FILE_PATTERN.test(name)).toBe(false);
    }
  });

  it('rejects an invalid date', () => {
    expect(() => backupFileName(new Date(Number.NaN))).toThrow(BackupError);
  });
});
