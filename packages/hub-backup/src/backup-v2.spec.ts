import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it, vi } from 'vitest';
import { toHex } from './backup-format.js';
import { manifestObjectName as manifestName, objectNoncePrefix, serializeObjectHeader } from './backup-v2-format.js';
import { encodeRecord } from './backup-v2-manifest.js';
import { repositoryKeys } from './backup-v2-repo.js';
import { SealedWriter, chunkNonceV2, headerHashOf, objectKey } from './backup-v2-stream.js';
import {
  BackupError,
  createBackupWriter,
  createMemoryBackupStore,
  createRepository,
  openBackup,
  openBackupFile,
  openBackupV2,
  openRepository,
  readBackupHeader,
  readRepositoryObject,
  rewrapRepository,
  sealBackup,
  writeBackupExport,
  type BackupDeps,
  type BackupErrorCode,
  type BackupV2Metadata,
  type ByteSource,
  type KdfParams,
  type MemoryBackupStore,
  type ObjectWriteStream,
} from './index.js';

const FIXED_NOW = new Date('2026-10-27T08:09:10.123Z');
const INSTANCE_ID = 'hub-instance-7c1e-secret-marker';
const PASSPHRASE = 'correct horse battery staple';
const encoder = new TextEncoder();

function makeDeps(seed = 1): BackupDeps & { deriveKey: ReturnType<typeof vi.fn> } {
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
      for (let i = 0; i < n; i += 32) {
        const block = sha256(new Uint8Array([seed, counter >>> 24, (counter >>> 16) & 255, (counter >>> 8) & 255, counter & 255]));
        counter++;
        out.set(block.subarray(0, Math.min(32, n - i)), i);
      }
      return out;
    },
    now: () => FIXED_NOW,
  };
}

const METADATA: BackupV2Metadata = {
  hubVersion: '2.1.0',
  source: { hubInstanceId: INSTANCE_ID, authorityEpoch: 3, schemaVersion: 12, dbMinReaderVersion: 4 },
  forTransfer: false,
  counts: { items: 42 },
};

function generated(size: number, seed: number, piece = 4096): Uint8Array[] {
  const out: Uint8Array[] = [];
  let x = seed >>> 0 || 1;
  for (let at = 0; at < size; at += piece) {
    const chunk = new Uint8Array(Math.min(piece, size - at));
    for (let i = 0; i < chunk.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      chunk[i] = x & 255;
    }
    out.push(chunk);
  }
  return out;
}

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const part of stream) parts.push(part.slice());
  return join(parts);
}

async function errorOf(work: () => Promise<unknown>): Promise<BackupErrorCode | 'ok' | string> {
  try {
    await work();
    return 'ok';
  } catch (error) {
    return error instanceof BackupError ? error.code : `non-backup-error: ${String(error)}`;
  }
}

const DB = join(generated(9000, 7));
const SS_DB = join(generated(2600, 8));
const HUB_JSON = encoder.encode('{"port":4100}');
const BLOBS = [new Uint8Array(0), join(generated(100, 9)), join(generated(5000, 10)), join(generated(20000, 11))];

interface Written {
  store: MemoryBackupStore;
  deps: ReturnType<typeof makeDeps>;
  backupId: string;
  packIds: string[];
  blobIds: string[];
}

async function writeSample(options: { chunkSize?: number; packBytes?: number; small?: boolean } = {}): Promise<Written> {
  const store = createMemoryBackupStore({ pieceBytes: 777 });
  const deps = makeDeps();
  const writer = await createBackupWriter({ passphrase: PASSPHRASE, sink: store.sink, deps, metadata: METADATA, chunkSize: options.chunkSize ?? 1024, packBytes: options.packBytes ?? 8192 });
  const blobIds: string[] = [];
  if (options.small) {
    await writer.addFile('dude.db', [DB.subarray(0, 2500)]);
    await writer.addFile('empty.bin', []);
    blobIds.push((await writer.addBlob([BLOBS[1]])).id);
  } else {
    await writer.addFile('dude.db', generated(DB.length, 7, 333));
    await writer.addFile('savesphere.db', [SS_DB]);
    await writer.addFile('hub.json', (async function* () {
      yield HUB_JSON;
    })());
    await writer.addFile('empty.bin', []);
    for (const blob of BLOBS) blobIds.push((await writer.addBlob([blob], { sha256: toHex(sha256(blob)), size: blob.length })).id);
  }
  const result = await writer.finish();
  return { store, deps, backupId: result.backupId, packIds: result.packIds, blobIds };
}

function cloneStore(store: MemoryBackupStore, pieceBytes = 777): MemoryBackupStore {
  const copy = createMemoryBackupStore({ pieceBytes });
  for (const [name, bytes] of store.objects) copy.objects.set(name, bytes.slice());
  return copy;
}

async function openAndVerify(store: MemoryBackupStore, backupId: string, passphrase = PASSPHRASE): Promise<void> {
  const reader = await openBackupV2(store.source, backupId, { passphrase }, makeDeps());
  try {
    await reader.verify();
  } finally {
    reader.close();
  }
}

function memoryFile(bytes: Uint8Array, pieceBytes = 1000): ByteSource {
  return {
    size: bytes.length,
    read(start: number, end: number) {
      return (async function* () {
        for (let at = start; at < end; at += pieceBytes) yield bytes.subarray(at, Math.min(end, at + pieceBytes));
      })();
    },
  };
}

function memoryOut(): ObjectWriteStream & { bytes(): Uint8Array } {
  const parts: Uint8Array[] = [];
  return {
    write: async bytes => void parts.push(bytes.slice()),
    commit: async () => undefined,
    abort: async () => undefined,
    bytes: () => join(parts),
  };
}

/** Splits a sealed object into its header prefix and frames. */
function framesOf(object: Uint8Array): { head: Uint8Array; frames: Uint8Array[] } {
  const view = new DataView(object.buffer, object.byteOffset, object.byteLength);
  const headLength = 12 + view.getUint32(8, false);
  const frames: Uint8Array[] = [];
  for (let at = headLength; at < object.length; ) {
    const length = view.getUint32(at, false);
    frames.push(object.subarray(at, at + 4 + length));
    at += 4 + length;
  }
  return { head: object.subarray(0, headLength), frames };
}

describe('backup v2 round trip', () => {
  it('streams files and blobs into packs and reads them back', async () => {
    const { store, backupId, packIds, blobIds } = await writeSample();
    expect(packIds.length).toBeGreaterThan(3);
    expect([...store.objects.keys()].sort()).toEqual(['repo', manifestName(backupId), ...packIds.map(id => `packs/${id}`)].sort());
    expect(backupId).toMatch(/^20261027T080910Z-[0-9a-f]{32}$/);

    const reader = await openBackupV2(store.source, backupId, { passphrase: PASSPHRASE }, makeDeps());
    expect(reader.head).toMatchObject({ formatVersion: 2, minReaderVersion: 2, backupId, createdAt: FIXED_NOW.toISOString(), hubVersion: '2.1.0', forTransfer: false, counts: { items: 42 } });
    expect(reader.head.source).toEqual(METADATA.source);
    const entries = [];
    for await (const entry of reader.listEntries()) entries.push(entry);
    expect(entries.map(e => (e.kind === 'file' ? e.name : e.id))).toEqual(['dude.db', 'savesphere.db', 'hub.json', 'empty.bin', ...blobIds]);
    expect(entries.find(e => e.kind === 'file' && e.name === 'dude.db')?.extents.length).toBeGreaterThan(1);

    expect(await collect(reader.readEntry('dude.db'))).toEqual(DB);
    expect(await collect(reader.readEntry('savesphere.db'))).toEqual(SS_DB);
    expect(await collect(reader.readEntry('hub.json'))).toEqual(HUB_JSON);
    expect(await collect(reader.readEntry('empty.bin'))).toEqual(new Uint8Array(0));
    for (const [index, id] of blobIds.entries()) expect(await collect(reader.readBlob(id))).toEqual(BLOBS[index]);
    expect(await errorOf(() => collect(reader.readEntry('missing.db')))).toBe('bad-input');

    const report = await reader.verify();
    expect(report).toEqual({ backupId, files: 4, blobs: 4, packs: packIds.length, bytes: DB.length + SS_DB.length + HUB_JSON.length + BLOBS.reduce((n, b) => n + b.length, 0) });
    reader.close();
  });

  it('keeps every byte of content and the authority fields out of the plaintext of every object', async () => {
    const { store } = await writeSample();
    const needles = [encoder.encode(INSTANCE_ID), encoder.encode('dude.db'), encoder.encode('savesphere.db'), DB.subarray(100, 132), BLOBS[3].subarray(0, 32), encoder.encode(toHex(sha256(BLOBS[2])))];
    for (const [name, bytes] of store.objects) {
      const text = Buffer.from(bytes);
      for (const needle of needles) expect(text.indexOf(Buffer.from(needle)), `${name} leaks`).toBe(-1);
    }
  });

  it('refuses invalid writer input without corrupting the backup', async () => {
    const store = createMemoryBackupStore();
    const writer = await createBackupWriter({ passphrase: PASSPHRASE, sink: store.sink, deps: makeDeps(), metadata: METADATA, chunkSize: 1024, packBytes: 4096 });
    await writer.addFile('Dude.db', [DB]);
    expect(await errorOf(() => writer.addFile('dude.DB', [DB]))).toBe('bad-input');
    expect(await errorOf(() => writer.addFile('../escape', [DB]))).toBe('bad-input');
    expect(await errorOf(() => writer.addFile('x'.repeat(129), []))).toBe('bad-input');
    expect(await errorOf(() => writer.addBlob([BLOBS[2]], { sha256: '0'.repeat(64) }))).toBe('integrity');
    expect(await errorOf(() => writer.addBlob([BLOBS[2]], { size: 1 }))).toBe('integrity');
    expect(await errorOf(() => writer.addBlob(['nope' as unknown as Uint8Array]))).toBe('bad-input');
    const busy = writer.addFile('a.bin', generated(5000, 3));
    expect(await errorOf(() => writer.addFile('b.bin', []))).toBe('bad-input');
    await busy;
    const blob = await writer.addBlob([BLOBS[2]]);
    const result = await writer.finish();
    expect(await errorOf(() => writer.addFile('late.bin', []))).toBe('bad-input');
    const reader = await openBackupV2(store.source, result.backupId, { passphrase: PASSPHRASE }, makeDeps());
    expect((await reader.verify()).files).toBe(2);
    expect(await collect(reader.readBlob(blob.id))).toEqual(BLOBS[2]);
    reader.close();
  });

  it('fails closed on a sink error and leaves no manifest after an abort', async () => {
    const store = createMemoryBackupStore();
    let failNext = false;
    const sink = {
      async create(name: string) {
        const inner = await store.sink.create(name);
        return { ...inner, write: async (bytes: Uint8Array) => (failNext ? Promise.reject(new Error('disk full')) : inner.write(bytes)) };
      },
    };
    const writer = await createBackupWriter({ passphrase: PASSPHRASE, sink, deps: makeDeps(), metadata: METADATA, chunkSize: 1024, packBytes: 4096 });
    await writer.addFile('dude.db', [DB.subarray(0, 3000)]);
    failNext = true;
    await expect(writer.addFile('more.db', [DB])).rejects.toThrow('disk full');
    failNext = false;
    expect(await errorOf(() => writer.finish())).toBe('bad-input');
    await writer.abort();
    expect([...store.objects.keys()].some(name => name.startsWith('manifests/'))).toBe(false);
  });
});

describe('backup v2 keys, dedupe and rewrap', () => {
  it('reuses a given master key across repositories while every subkey and dedupe identity still differs', async () => {
    const deps = makeDeps();
    const master = new Uint8Array(32).fill(7);
    const { repository: a, object: objectA } = await createRepository(PASSPHRASE, deps, undefined, { masterKey: master });
    const { repository: b } = await createRepository(PASSPHRASE, deps, undefined, { masterKey: master });
    expect(a.exportMasterKey()).toEqual(master);
    expect(b.exportMasterKey()).toEqual(master);
    expect(a.repoId).not.toBe(b.repoId);
    const plain = toHex(sha256(BLOBS[2]));
    expect(a.dedupeId(plain)).not.toBe(b.dedupeId(plain));
    const reopened = await openRepository(objectA, { masterKey: master }, deps);
    expect(reopened.repoId).toBe(a.repoId);
    master.fill(0);
    expect(a.exportMasterKey()).toEqual(new Uint8Array(32).fill(7));
    await expect(createRepository(PASSPHRASE, deps, undefined, { masterKey: new Uint8Array(16) })).rejects.toThrow(BackupError);
    for (const r of [a, b, reopened]) r.close();
  });

  it('derives a keyed dedupe identity that is not the plain SHA-256', async () => {
    const deps = makeDeps();
    const { repository: a } = await createRepository(PASSPHRASE, deps);
    const { repository: b } = await createRepository(PASSPHRASE, deps);
    const plain = toHex(sha256(BLOBS[2]));
    const id = a.dedupeId(plain);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toBe(plain);
    expect(id).not.toBe(toHex(sha256(sha256(BLOBS[2]))));
    expect(a.dedupeId(plain)).toBe(id);
    expect(b.dedupeId(plain)).not.toBe(id);
    expect(toHex(hmac(sha256, repositoryKeys(a).dedupe, sha256(BLOBS[2])))).toBe(id);
    expect(() => a.dedupeId('XYZ')).toThrow(BackupError);
    a.close();
    expect(() => a.dedupeId(plain)).toThrow(BackupError);
    b.close();
  });

  it('opens with the passphrase or the master key and refuses a wrong one', async () => {
    const { store, backupId } = await writeSample({ small: true });
    const repoObject = await readRepositoryObject(store.source);
    const repository = await openRepository(repoObject, { passphrase: PASSPHRASE }, makeDeps());
    const master = repository.exportMasterKey();
    repository.close();
    await openAndVerify(store, backupId);
    const byKey = await openBackupV2(store.source, backupId, { masterKey: master }, makeDeps());
    await byKey.verify();
    byKey.close();
    expect(await errorOf(() => openBackupV2(store.source, backupId, { passphrase: 'wrong' }, makeDeps()))).toBe('wrong-passphrase-or-corrupt');
    const wrongKey = master.slice();
    wrongKey[0] ^= 1;
    expect(await errorOf(() => openBackupV2(store.source, backupId, { masterKey: wrongKey }, makeDeps()))).toBe('wrong-passphrase-or-corrupt');
    expect(await errorOf(() => openBackupV2(store.source, backupId, { masterKey: new Uint8Array(5) }, makeDeps()))).toBe('bad-input');
    expect(await errorOf(() => openBackupV2(store.source, backupId, { passphrase: '' }, makeDeps()))).toBe('bad-input');
  });

  it('changes the passphrase by re-wrapping the master key only', async () => {
    const { store, backupId } = await writeSample({ small: true });
    const before = new Map([...store.objects].map(([name, bytes]) => [name, bytes.slice()]));
    const deps = makeDeps(9);
    const params: KdfParams = { m: 16384, t: 2, p: 1, len: 32 };
    const rewrapped = await rewrapRepository(store.objects.get('repo') as Uint8Array, { passphrase: PASSPHRASE }, 'a new passphrase', deps, params);
    store.objects.set('repo', rewrapped);
    for (const [name, bytes] of before) if (name !== 'repo') expect(store.objects.get(name)).toEqual(bytes);
    expect(await errorOf(() => openAndVerify(store, backupId))).toBe('wrong-passphrase-or-corrupt');
    await openAndVerify(store, backupId, 'a new passphrase');
    const reopened = await openRepository(rewrapped, { passphrase: 'a new passphrase' }, deps);
    expect(reopened.header.kdf).toMatchObject({ m: 16384, t: 2, p: 1 });
    expect(reopened.repoId).toBe((await openRepository(before.get('repo') as Uint8Array, { passphrase: PASSPHRASE }, deps)).repoId);
    reopened.close();
    expect(await errorOf(() => rewrapRepository(rewrapped, { passphrase: PASSPHRASE }, 'x', deps))).toBe('wrong-passphrase-or-corrupt');
  });
});

describe('backup v2 incremental backups', () => {
  it('references earlier packs by dedupe identity and verifies both scopes', async () => {
    const { store, backupId: first } = await writeSample();
    const deps = makeDeps(5);
    const repository = await openRepository(store.objects.get('repo') as Uint8Array, { passphrase: PASSPHRASE }, deps);
    const firstReader = await openBackupV2(store.source, first, { repository }, deps);
    const priorBlobs = [];
    for await (const entry of firstReader.listEntries()) if (entry.kind === 'blob') priorBlobs.push(entry);
    firstReader.close();

    const writer = await createBackupWriter({ repository, sink: store.sink, deps, metadata: { ...METADATA, forTransfer: true }, chunkSize: 1024, packBytes: 8192 });
    await writer.addFile('dude.db', [DB.subarray(0, 4000)]);
    for (const blob of priorBlobs) await writer.addBlobRef(blob);
    const fresh = await writer.addBlob([join(generated(3000, 99))]);
    const result = await writer.finish();
    expect(result.packIds).toHaveLength(1);

    const reader = await openBackupV2(store.source, result.backupId, { repository }, deps);
    expect(reader.head.forTransfer).toBe(true);
    expect(await collect(reader.readBlob(priorBlobs[3].id))).toEqual(BLOBS[3]);
    expect(await collect(reader.readBlob(fresh.id))).toEqual(join(generated(3000, 99)));
    const full = await reader.verify();
    const onlyNew = await reader.verify({ scope: 'new' });
    expect(full.packs).toBeGreaterThan(1);
    expect(onlyNew.packs).toBe(1);
    expect(onlyNew.bytes).toBe(4000 + 3000);
    reader.close();

    const { repository: other } = await createRepository(PASSPHRASE, makeDeps(77));
    const foreign = await createBackupWriter({ repository: other, sink: createMemoryBackupStore().sink, deps: makeDeps(78), metadata: METADATA });
    expect(await errorOf(() => foreign.addBlobRef(priorBlobs[1]))).toBe('bad-input');
    await foreign.abort();
    other.close();
    repository.close();
  });

  it('fails verification when an earlier pack is gone', async () => {
    const { store, backupId, packIds } = await writeSample();
    store.objects.delete(`packs/${packIds[0]}`);
    expect(await errorOf(() => openAndVerify(store, backupId))).toBe('integrity');
  });
});

describe('backup v2 versioning', () => {
  it('is refused by the v1 reader as unsupported-version', async () => {
    const { store, backupId } = await writeSample({ small: true });
    for (const bytes of store.objects.values()) {
      expect(() => readBackupHeader(bytes)).toThrow(expect.objectContaining({ code: 'unsupported-version' }));
      expect(await errorOf(() => openBackup(bytes, { passphrase: PASSPHRASE }, makeDeps()))).toBe('unsupported-version');
    }
    const reader = await openBackupV2(store.source, backupId, { passphrase: PASSPHRASE }, makeDeps());
    const out = memoryOut();
    await writeBackupExport(reader, out);
    reader.close();
    const deps = makeDeps();
    expect(await errorOf(() => openBackup(out.bytes(), { passphrase: PASSPHRASE }, deps))).toBe('unsupported-version');
    expect(deps.deriveKey).not.toHaveBeenCalled();
  });

  it('reads a v1 file through the v2 dispatcher with the v1 path unchanged', async () => {
    const deps = makeDeps();
    const v1 = await sealBackup(
      { files: [{ name: 'dude.db', bytes: DB }], hubVersion: '1.0.0', source: METADATA.source, forTransfer: false, counts: {} },
      { passphrase: PASSPHRASE },
      deps,
    );
    const opened = await openBackupFile(memoryFile(v1), { passphrase: PASSPHRASE }, makeDeps());
    expect(opened.formatVersion).toBe(1);
    if (opened.formatVersion === 1) expect(opened.backup.files.get('dude.db')).toEqual(DB);
    expect(await errorOf(() => openBackupFile(memoryFile(v1), { masterKey: new Uint8Array(32) }, makeDeps()))).toBe('bad-input');
    expect(await errorOf(() => openBackupFile(memoryFile(v1), { passphrase: 'wrong' }, makeDeps()))).toBe('wrong-passphrase-or-corrupt');
  });

  it('refuses a future minReaderVersion in any header before deriving a key', async () => {
    const { store, backupId, packIds } = await writeSample({ small: true });
    const bump = (bytes: Uint8Array): Uint8Array => {
      const text = Buffer.from(bytes).toString('latin1').replace('"minReaderVersion":2', '"minReaderVersion":9');
      return new Uint8Array(Buffer.from(text, 'latin1'));
    };
    for (const name of ['repo', manifestName(backupId), `packs/${packIds[0]}`]) {
      const copy = cloneStore(store);
      copy.objects.set(name, bump(copy.objects.get(name) as Uint8Array));
      const deps = makeDeps();
      const code = await errorOf(async () => {
        const reader = await openBackupV2(copy.source, backupId, { passphrase: PASSPHRASE }, deps);
        await reader.verify();
      });
      expect(code, name).toBe('unsupported-version');
      if (name === 'repo') expect(deps.deriveKey).not.toHaveBeenCalled();
    }
  });

  it('detects header downgrades and KDF weakening through the associated data', async () => {
    const { store, backupId, packIds } = await writeSample({ small: true });
    const edit = (bytes: Uint8Array, from: string, to: string): Uint8Array => {
      const text = Buffer.from(bytes).toString('latin1');
      expect(text).toContain(from);
      return new Uint8Array(Buffer.from(text.replace(from, to), 'latin1'));
    };
    const cases: Array<[string, string, string, BackupErrorCode]> = [
      ['repo', '"m":65536', '"m":16384', 'wrong-passphrase-or-corrupt'],
      ['repo', '"t":3', '"t":1', 'wrong-passphrase-or-corrupt'],
      ['repo', '"formatVersion":2', '"formatVersion":3', 'wrong-passphrase-or-corrupt'],
      ['repo', '"minReaderVersion":2', '"minReaderVersion":1', 'bad-header'],
      [`packs/${packIds[0]}`, '"formatVersion":2', '"formatVersion":3', 'integrity'],
      [manifestName(backupId), '"formatVersion":2', '"formatVersion":3', 'integrity'],
      [manifestName(backupId), '"minReaderVersion":2', '"minReaderVersion":1', 'bad-header'],
    ];
    for (const [name, from, to, code] of cases) {
      const copy = cloneStore(store);
      copy.objects.set(name, edit(copy.objects.get(name) as Uint8Array, from, to));
      expect(await errorOf(() => openAndVerify(copy, backupId)), `${name} ${from}`).toBe(code);
    }
  });

  it('ignores unknown manifest fields and record types, but refuses a newer manifest floor', async () => {
    const deps = makeDeps();
    const store = createMemoryBackupStore();
    const { repository, object } = await createRepository(PASSPHRASE, deps);
    store.objects.set('repo', object);
    const writeManifest = async (backupId: string, records: object[]): Promise<void> => {
      const name = manifestName(backupId);
      const { prefix, headerBytes } = serializeObjectHeader({ formatVersion: 2, minReaderVersion: 2, kind: 'manifest', repoId: repository.repoId, id: backupId, cipher: 'xchacha20poly1305', chunkSize: 1024 });
      const writer = await SealedWriter.open(store.sink, name, prefix, {
        key: objectKey(repositoryKeys(repository).manifest, name),
        prefix: objectNoncePrefix(backupId),
        headerHash: headerHashOf(headerBytes),
        chunkSize: 1024,
      });
      for (const record of records) await writer.write(encodeRecord(record));
      await writer.finish();
    };
    const head = (backupId: string, minReaderVersion: number) => ({
      t: 'head',
      formatVersion: 2,
      minReaderVersion,
      backupId,
      repoId: repository.repoId,
      createdAt: FIXED_NOW.toISOString(),
      hubVersion: '9.0.0',
      source: METADATA.source,
      forTransfer: false,
      counts: {},
      futureField: { anything: true },
    });
    const okId = `20261027T080910Z-${'a'.repeat(32)}`;
    await writeManifest(okId, [head(okId, 2), { t: 'future-thing', payload: 1 }, { t: 'end', files: 0, blobs: 0, packs: 0, bytes: 0, extra: 'x' }]);
    const reader = await openBackupV2(store.source, okId, { repository }, deps);
    expect(await reader.verify()).toMatchObject({ files: 0, blobs: 0, packs: 0 });
    reader.close();

    const newerId = `20261027T080910Z-${'b'.repeat(32)}`;
    await writeManifest(newerId, [head(newerId, 3), { t: 'end', files: 0, blobs: 0, packs: 0, bytes: 0 }]);
    expect(await errorOf(() => openBackupV2(store.source, newerId, { repository }, deps))).toBe('unsupported-version');

    const noEndId = `20261027T080910Z-${'c'.repeat(32)}`;
    await writeManifest(noEndId, [head(noEndId, 2)]);
    const noEnd = await openBackupV2(store.source, noEndId, { repository }, deps);
    expect(await errorOf(() => noEnd.verify())).toBe('integrity');
    noEnd.close();

    const badCountId = `20261027T080910Z-${'d'.repeat(32)}`;
    await writeManifest(badCountId, [head(badCountId, 2), { t: 'end', files: 1, blobs: 0, packs: 0, bytes: 0 }]);
    const badCount = await openBackupV2(store.source, badCountId, { repository }, deps);
    expect(await errorOf(() => badCount.verify())).toBe('integrity');
    badCount.close();
    repository.close();
  });
});

describe('backup v2 tamper detection', () => {
  it('fails verification for a flipped bit anywhere in any object', async () => {
    const { store, backupId } = await writeSample({ small: true, packBytes: 4096 });
    let attempts = 0;
    for (const [name, bytes] of store.objects) {
      for (let position = 0; position < bytes.length; position++) {
        const copy = cloneStore(store, 1 << 20);
        const tampered = copy.objects.get(name) as Uint8Array;
        tampered[position] ^= 1;
        const code = await errorOf(() => openAndVerify(copy, backupId));
        if (code === 'ok' || code.startsWith('non-backup-error')) throw new Error(`${name}@${position}: ${code}`);
        attempts++;
      }
    }
    expect(attempts).toBeGreaterThan(3000);
  }, 120_000);

  it('detects dropped, reordered, duplicated, truncated and appended chunks', async () => {
    const { store, backupId, packIds } = await writeSample({ packBytes: 16384 });
    const name = `packs/${packIds[0]}`;
    const { head, frames } = framesOf(store.objects.get(name) as Uint8Array);
    expect(frames.length).toBeGreaterThan(4);
    const last = frames.length - 1;
    const variants: Array<[string, Uint8Array, BackupErrorCode]> = [
      ['drop trailer', join([head, ...frames.slice(0, last)]), 'truncated'],
      ['cut mid-frame', join([head, ...frames]).subarray(0, head.length + 1500), 'truncated'],
      ['cut inside header', join([head]).subarray(0, 20), 'truncated'],
      ['append garbage', join([head, ...frames, new Uint8Array([0, 0, 0, 16, ...new Uint8Array(16)])]), 'integrity'],
      ['duplicate trailer', join([head, ...frames, frames[last]]), 'integrity'],
      ['drop middle', join([head, frames[0], ...frames.slice(2)]), 'integrity'],
      ['swap', join([head, frames[1], frames[0], ...frames.slice(2)]), 'integrity'],
      ['duplicate', join([head, frames[0], ...frames]), 'integrity'],
    ];
    for (const [label, bytes, code] of variants) {
      const copy = cloneStore(store);
      copy.objects.set(name, bytes);
      expect(await errorOf(() => openAndVerify(copy, backupId)), label).toBe(code);
    }
    const swapped = cloneStore(store);
    swapped.objects.set(name, store.objects.get(`packs/${packIds[1]}`) as Uint8Array);
    expect(await errorOf(() => openAndVerify(swapped, backupId)), 'pack substituted').toBe('integrity');
    const spliced = cloneStore(store);
    const other = framesOf(store.objects.get(`packs/${packIds[1]}`) as Uint8Array);
    spliced.objects.set(name, join([head, other.frames[0], ...frames.slice(1)]));
    expect(await errorOf(() => openAndVerify(spliced, backupId)), 'chunk spliced from another pack').toBe('integrity');
  });

  it('detects a manifest substituted from another backup or truncated', async () => {
    const { store, backupId } = await writeSample({ small: true });
    const repository = await openRepository(store.objects.get('repo') as Uint8Array, { passphrase: PASSPHRASE }, makeDeps());
    const writer = await createBackupWriter({ repository, sink: store.sink, deps: makeDeps(4), metadata: METADATA, chunkSize: 1024 });
    await writer.addFile('other.db', [DB.subarray(0, 10)]);
    const second = await writer.finish();
    const copy = cloneStore(store);
    copy.objects.set(manifestName(backupId), store.objects.get(manifestName(second.backupId)) as Uint8Array);
    expect(await errorOf(() => openAndVerify(copy, backupId))).toBe('integrity');
    const cut = cloneStore(store);
    const { head, frames } = framesOf(store.objects.get(manifestName(backupId)) as Uint8Array);
    cut.objects.set(manifestName(backupId), join([head, ...frames.slice(0, -1)]));
    expect(await errorOf(() => openAndVerify(cut, backupId))).toBe('truncated');
    repository.close();
  });
});

describe('backup v2 nonces', () => {
  it('derives distinct nonces for distinct (object, counter) pairs', () => {
    // Property: (id, counter) -> nonce is injective. Random pairs plus the edges where a carry or a shared
    // prefix could collide (counter 0, 2^32 - 1, ids differing in one bit).
    const deps = makeDeps(42);
    const seen = new Map<string, string>();
    const ids = [new Uint8Array(16), new Uint8Array(16).fill(255), ...Array.from({ length: 40 }, () => deps.randomBytes(16))];
    for (let bit = 0; bit < 128; bit += 9) {
      const flipped = new Uint8Array(16);
      flipped[bit >> 3] ^= 1 << (bit & 7);
      ids.push(flipped);
    }
    const counters = [0, 1, 255, 256, 65535, 65536, 2 ** 24, 2 ** 31, 2 ** 32 - 2, 2 ** 32 - 1];
    for (const id of ids) {
      for (const counter of counters) {
        const pair = `${toHex(id)}:${counter}`;
        const nonce = toHex(chunkNonceV2(id, counter));
        expect(nonce).toHaveLength(48);
        const previous = seen.get(nonce);
        if (previous !== undefined) expect(previous).toBe(pair);
        seen.set(nonce, pair);
      }
    }
    expect(seen.size).toBe(new Set(ids.map(toHex)).size * counters.length);
    expect(() => chunkNonceV2(new Uint8Array(16), 2 ** 32)).toThrow(BackupError);
  });

  it('never reuses an object id across backups and refuses a repeating random source', async () => {
    const store = createMemoryBackupStore();
    const deps = makeDeps(3);
    const { repository, object } = await createRepository(PASSPHRASE, deps);
    store.objects.set('repo', object);
    for (let run = 0; run < 3; run++) {
      const writer = await createBackupWriter({ repository, sink: store.sink, deps, metadata: METADATA, chunkSize: 1024, packBytes: 2048 });
      await writer.addFile('dude.db', [DB]);
      await writer.finish();
    }
    const prefixes = [...store.objects.keys()].filter(name => name !== 'repo').map(name => name.slice(-32));
    expect(new Set(prefixes).size).toBe(prefixes.length);

    const stuck: BackupDeps = { ...deps, randomBytes: (n: number) => new Uint8Array(n).fill(7) };
    const writer = await createBackupWriter({ repository, sink: createMemoryBackupStore().sink, deps: stuck, metadata: METADATA });
    expect(await errorOf(() => writer.addFile('dude.db', [DB]))).toBe('bad-input');
    await writer.abort();
    const sink = createMemoryBackupStore().sink;
    await sink.create('packs/x');
    expect(await errorOf(() => sink.create('packs/x'))).toBe('bad-input');
    repository.close();
  });
});

describe('backup v2 single-file export', () => {
  async function exportOf(written: Written, backupId = written.backupId): Promise<Uint8Array> {
    const reader = await openBackupV2(written.store.source, backupId, { passphrase: PASSPHRASE }, makeDeps());
    const out = memoryOut();
    const { bytes } = await writeBackupExport(reader, out);
    reader.close();
    expect(out.bytes().length).toBe(bytes);
    return out.bytes();
  }

  it('round-trips an incremental backup as one file holding exactly its packs', async () => {
    const written = await writeSample();
    const repository = await openRepository(written.store.objects.get('repo') as Uint8Array, { passphrase: PASSPHRASE }, makeDeps());
    const first = await openBackupV2(written.store.source, written.backupId, { repository }, makeDeps());
    const writer = await createBackupWriter({ repository, sink: written.store.sink, deps: makeDeps(6), metadata: METADATA, chunkSize: 1024, packBytes: 8192 });
    for await (const entry of first.listEntries()) if (entry.kind === 'blob' && entry.size > 10000) await writer.addBlobRef(entry);
    await writer.addFile('dude.db', [DB.subarray(0, 100)]);
    const second = await writer.finish();
    first.close();
    repository.close();

    const file = await exportOf(written, second.backupId);
    const opened = await openBackupFile(memoryFile(file), { passphrase: PASSPHRASE }, makeDeps());
    expect(opened.formatVersion).toBe(2);
    if (opened.formatVersion !== 2) return;
    const report = await opened.reader.verify();
    expect(report.blobs).toBe(1);
    expect(await collect(opened.reader.readEntry('dude.db'))).toEqual(DB.subarray(0, 100));
    expect(await collect(opened.reader.readBlob(written.blobIds[3]))).toEqual(BLOBS[3]);
    opened.reader.close();
    expect(await errorOf(() => openBackupFile(memoryFile(file.subarray(0, file.length - 5)), { passphrase: PASSPHRASE }, makeDeps()))).toBe('truncated');
    expect(await errorOf(() => openBackupFile(memoryFile(file), { passphrase: 'nope' }, makeDeps()))).toBe('wrong-passphrase-or-corrupt');
  });

  it('fails for a flipped bit in the export header, index or tail and at sampled object bytes', async () => {
    const written = await writeSample({ small: true, packBytes: 4096 });
    const file = await exportOf(written);
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const headerEnd = 12 + view.getUint32(8, false);
    const indexStart = file.length - 12 - view.getUint32(file.length - 12, false);
    const positions = new Set<number>();
    for (let p = 0; p < file.length; p++) if (p < headerEnd || p >= indexStart || p % 7 === 0) positions.add(p);
    for (const position of positions) {
      const tampered = file.slice();
      tampered[position] ^= 1;
      const code = await errorOf(async () => {
        const opened = await openBackupFile(memoryFile(tampered), { passphrase: PASSPHRASE }, makeDeps());
        if (opened.formatVersion === 2) await opened.reader.verify();
      });
      if (code === 'ok' || code.startsWith('non-backup-error')) throw new Error(`export@${position}: ${code}`);
    }
    expect(positions.size).toBeGreaterThan(500);
  }, 120_000);
});
