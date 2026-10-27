import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupError } from '@dude/hub-backup';
import type { HubBackupS3Destination } from '../../../config/hub-config.js';
import { DestinationError, assertObjectName, backupIdOfManifest, packIdOfObject } from '../destination.js';
import { openBackupDestination } from '../index.js';
import { createS3CredentialStore } from './s3-credentials.js';
import { FakeS3Server } from './fake-s3-server.js';
import type { FakeS3Options } from './fake-s3-server.js';
import { createS3Destination } from './s3-destination.js';
import type { S3BackupDestination, S3DestinationOptions } from './s3-destination.js';
import { createNodeTransport } from './s3-transport.js';

const servers: FakeS3Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); });

const PACK = `packs/${'a'.repeat(32)}`;
const PACK2 = `packs/${'c'.repeat(32)}`;
const MANIFEST = `manifests/20261027T120000Z-${'b'.repeat(32)}`;
const MANIFEST2 = `manifests/20261028T000000Z-${'d'.repeat(32)}`;
const PART = 64 * 1024;
const FAST = { sleep: async (): Promise<void> => undefined, retry: { attempts: 3, baseMs: 1, maxMs: 2 } };

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const piece of stream) parts.push(piece);
  return Buffer.concat(parts);
}

async function setup(serverOptions: FakeS3Options = {}, extra: Partial<S3DestinationOptions> & { prefix?: string | null } = {}) {
  const server = new FakeS3Server({ minPartBytes: 1024, ...serverOptions });
  servers.push(server);
  const endpoint = await server.start();
  const { prefix, ...rest } = extra;
  const definition: HubBackupS3Destination = {
    id: 'd-s3', kind: 's3', label: 'Spec bucket', endpoint, region: server.options.region, bucket: server.options.bucket,
    ...(prefix === null ? {} : { prefix: prefix ?? 'hub1' }), forcePathStyle: true, allowPrivateNetwork: true,
  };
  const destination = createS3Destination({ definition, credentials: server.credentials, partBytes: PART, minPartBytes: 1024, client: FAST, ...rest });
  const another = (): S3BackupDestination => createS3Destination({ definition, credentials: server.credentials, partBytes: PART, minPartBytes: 1024, client: FAST });
  const key = (name: string): string => `${definition.prefix === undefined ? '' : `${definition.prefix}/`}${name}`;
  return { server, destination, definition, another, key, endpoint };
}

async function put(destination: S3BackupDestination, name: string, bytes: Uint8Array, pieces = 1): Promise<void> {
  const out = await destination.sink().create(name);
  const size = Math.ceil(bytes.length / pieces);
  for (let offset = 0; offset < bytes.length; offset += size) await out.write(bytes.subarray(offset, offset + size));
  await out.commit();
}

describe('s3 destination: the write-once sink', () => {
  it('commits an object only at commit (single PutObject), signs everything it sends, and never overwrites', async () => {
    const { server, destination, key } = await setup();
    const sink = destination.sink();
    const out = await sink.create(PACK);
    await out.write(new Uint8Array([1, 2, 3]));
    expect(server.keys()).toEqual([]);
    expect(await destination.stat(PACK)).toBeNull();
    expect(await destination.list('packs/')).toEqual([]);
    // An object being written by this process cannot be created again, nor by a second instance once it is committed.
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' });
    await out.write(new Uint8Array([4]));
    await out.commit();
    expect(server.keys()).toEqual([key(PACK)]);
    expect(server.objects.get(key(PACK))!.bytes).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(server.uploads.size).toBe(0);
    expect(server.count((r) => r.method === 'PUT')).toBe(1);
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: 4 });
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 4 }]);
    await expect(sink.create(PACK)).rejects.toBeInstanceOf(DestinationError);
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' });
    await expect(out.write(new Uint8Array([9]))).rejects.toBeInstanceOf(BackupError);
    await expect(out.commit()).rejects.toBeInstanceOf(BackupError);
    expect(server.authFailures).toBe(0);
  });

  it('sends If-None-Match: * on the commit and an existing object is left unchanged', async () => {
    const { server, destination, key } = await setup();
    await put(destination, PACK, new Uint8Array([1, 1]));
    expect(server.requests.filter((r) => r.method === 'PUT').map((r) => r.headers['if-none-match'])).toEqual(['*']);
    const other = await destination.sink().create(PACK2);
    await other.write(new Uint8Array([5]));
    // A different writer lands the same name between create and commit (no HEAD in between sees it, the provider refuses with 412).
    server.objects.set(key(PACK2), { bytes: Buffer.from([9, 9, 9]), etag: 'x', modified: 0 });
    server.fail((r) => r.method === 'HEAD' && r.path.endsWith(PACK2), { kind: 'status', status: 404, code: 'NoSuchKey' }, 1, 0);
    await expect(other.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.objects.get(key(PACK2))!.bytes).toEqual(Buffer.from([9, 9, 9]));
    expect(server.uploads.size).toBe(0);
  });

  it('refuses an existing object found by the HEAD check when the provider ignores If-None-Match', async () => {
    const { server, destination, key } = await setup({ conditional: 'ignore' });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([1]));
    server.objects.set(key(PACK), { bytes: Buffer.from([7, 7]), etag: 'x', modified: 0 });
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.objects.get(key(PACK))!.bytes).toEqual(Buffer.from([7, 7]));
    await expect(destination.sink().create(PACK)).rejects.toMatchObject({ code: 'exists' });
  });

  it('falls back to HEAD-before-write once, remembering that the provider does not support the header', async () => {
    const { server, destination, key } = await setup({ conditional: 'unsupported' });
    await put(destination, PACK, new Uint8Array([1, 2]));
    expect(server.objects.get(key(PACK))!.bytes).toEqual(Buffer.from([1, 2]));
    const headerSent = (): number => server.count((r) => r.method === 'PUT' && r.headers['if-none-match'] !== undefined);
    expect(headerSent()).toBe(1); // the rejected attempt
    await put(destination, PACK2, new Uint8Array([3]), 1);
    expect(headerSent()).toBe(1); // remembered: no header any more
    const racing = await destination.sink().create(MANIFEST);
    await racing.write(new Uint8Array([1]));
    server.objects.set(key(MANIFEST), { bytes: Buffer.from([8]), etag: 'x', modified: 0 });
    await expect(racing.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.objects.get(key(MANIFEST))!.bytes).toEqual(Buffer.from([8]));
  });

  it('treats a retried write that already landed as its own success, not as a conflict', async () => {
    const { server, destination, key } = await setup();
    // The first PUT is stored but its answer carries a wrong ETag: the client re-sends it and the provider answers 412 (it exists).
    server.fail((r) => r.method === 'PUT' && r.path.endsWith(PACK), { kind: 'wrong-etag' }, 1);
    await put(destination, PACK, new Uint8Array([1, 2, 3, 4, 5]));
    expect(server.objects.get(key(PACK))!.bytes).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    expect(server.count((r) => r.method === 'PUT' && r.path.endsWith(PACK))).toBe(2);
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: 5 });
  });

  it('retries transient 5xx answers and gives up with a short code that names no credential', async () => {
    const { server, destination } = await setup();
    server.fail((r) => r.method === 'PUT', { kind: 'status', status: 503, code: 'ServiceUnavailable' }, 2);
    await put(destination, PACK, new Uint8Array([1]));
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: 1 });
    server.fail((r) => r.method === 'PUT' && r.path.endsWith(PACK2), { kind: 'status', status: 500 }, 10);
    const out = await destination.sink().create(PACK2);
    await out.write(new Uint8Array([2]));
    const error = await out.commit().then(() => null, (e: unknown) => e);
    expect(error).toMatchObject({ code: 'server' });
    expect(String((error as Error).message)).not.toContain(server.options.secretAccessKey);
    expect(String((error as Error).message)).not.toContain(server.options.accessKeyId);
    // The failed object is gone, so the name can be written again.
    expect(server.keys()).not.toContain(`hub1/${PACK2}`);
    server.clearFaults();
    await put(destination, PACK2, new Uint8Array([2]));
  });

  it('maps bad credentials to auth and a missing bucket to bad-endpoint', async () => {
    const { server, endpoint, definition } = await setup();
    const wrong = createS3Destination({ definition, credentials: { ...server.credentials, secretAccessKey: 'wrong/secret/value' }, client: FAST });
    await expect(wrong.sink().create(PACK)).rejects.toMatchObject({ code: 'auth' });
    expect(server.authFailures).toBeGreaterThan(0);
    const nobucket = createS3Destination({ definition: { ...definition, bucket: 'nonexistent' }, credentials: server.credentials, client: FAST });
    const out = await nobucket.sink().create(PACK);
    await out.write(new Uint8Array([1]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'bad-endpoint' });
    expect(endpoint).toContain('127.0.0.1');
  });

  it('refuses a stored object whose size is not what was written (verify-on-write) and deletes it', async () => {
    const { server, definition } = await setup();
    const inner = createNodeTransport({ policy: { allowPrivateNetwork: true } });
    const destination = createS3Destination({
      definition, credentials: server.credentials, partBytes: PART, minPartBytes: 1024,
      client: {
        ...FAST,
        transport: async (request) => {
          const response = await inner(request);
          if (request.method === 'PUT' && request.url.search === '') {
            const key = decodeURIComponent(request.url.pathname).split('/').slice(2).join('/');
            const stored = server.objects.get(key);
            if (stored !== undefined) server.objects.set(key, { ...stored, bytes: stored.bytes.subarray(1) }); // lose a byte after the answer
          }
          return response;
        },
      },
    });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([1, 2, 3]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'mismatch' });
    expect(server.keys()).toEqual([]);
  });

  it('abort leaves nothing visible, aborts an open multipart upload and is idempotent', async () => {
    const { server, destination } = await setup();
    const small = await destination.sink().create(MANIFEST);
    await small.write(new Uint8Array([7]));
    await small.abort();
    await small.abort();
    expect(server.requests.some((r) => r.method === 'PUT')).toBe(false);
    const large = await destination.sink().create(PACK);
    await large.write(new Uint8Array(randomBytes(PART * 2 + 10)));
    expect(server.uploads.size).toBe(1);
    await large.abort();
    expect(server.uploads.size).toBe(0);
    expect(server.keys()).toEqual([]);
    // The name is free again.
    await put(destination, PACK, new Uint8Array([1]));
  });

  it('accepts only repository object names and makes no request for another', async () => {
    const { server, destination } = await setup();
    for (const bad of ['../repo', 'packs/../../x', 'packs/ABC', `packs/${'a'.repeat(31)}`, 'manifests/x', 'repo/', 'other', '', 'packs\\x', '.dude-probe/x']) {
      expect(() => assertObjectName(bad), bad).toThrow(DestinationError);
      await expect(destination.sink().create(bad), bad).rejects.toMatchObject({ code: 'bad-name' });
      await expect(destination.stat(bad), bad).rejects.toMatchObject({ code: 'bad-name' });
      await expect(destination.deleteObject(bad), bad).rejects.toMatchObject({ code: 'bad-name' });
      expect(() => destination.source().read(bad), bad).toThrow(DestinationError);
    }
    expect(server.requests).toEqual([]);
    expect(backupIdOfManifest(MANIFEST)).toBe(`20261027T120000Z-${'b'.repeat(32)}`);
    expect(packIdOfObject(PACK)).toBe('a'.repeat(32));
  });

  it('rejects a part size below the provider minimum', async () => {
    const server = new FakeS3Server();
    servers.push(server);
    const endpoint = await server.start();
    const definition: HubBackupS3Destination = { id: 'd', kind: 's3', label: 'x', endpoint, region: 'us-east-1', bucket: 'backups', allowPrivateNetwork: true };
    expect(() => createS3Destination({ definition, credentials: server.credentials, partBytes: 1024 })).toThrow(DestinationError);
  });
});

describe('s3 destination: multipart for large objects', () => {
  it('uploads in parts, completes once, and the object reads back byte for byte', async () => {
    const { server, destination, key } = await setup();
    const bytes = new Uint8Array(randomBytes(PART * 3 + 12_345));
    await put(destination, PACK, bytes, 7); // uneven writes crossing part boundaries
    expect(server.objects.get(key(PACK))!.bytes.equals(Buffer.from(bytes))).toBe(true);
    expect(server.uploads.size).toBe(0);
    const partPuts = server.requests.filter((r) => r.method === 'PUT' && r.query['partNumber'] !== undefined);
    expect(partPuts.map((r) => r.query['partNumber'])).toEqual(['1', '2', '3', '4']);
    expect(partPuts.slice(0, 3).every((r) => r.bodyLength === PART)).toBe(true);
    expect(partPuts[3]!.bodyLength).toBe(12_345);
    expect(server.requests.filter((r) => r.method === 'POST' && r.query['uploadId'] !== undefined).map((r) => r.headers['if-none-match'])).toEqual(['*']);
    expect(server.requests.some((r) => r.method === 'PUT' && r.query['partNumber'] === undefined && r.path.endsWith(PACK))).toBe(false);
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: bytes.length });
    expect((await collect(destination.source().read(PACK))).equals(Buffer.from(bytes))).toBe(true);
    expect(server.authFailures).toBe(0);
  });

  it('an object of exactly one part size is still a multipart object with a full part and no empty tail', async () => {
    const { server, destination, key } = await setup();
    const bytes = new Uint8Array(randomBytes(PART));
    await put(destination, PACK, bytes);
    expect(server.objects.get(key(PACK))!.bytes.equals(Buffer.from(bytes))).toBe(true);
    expect(server.requests.filter((r) => r.method === 'PUT' && r.query['partNumber'] !== undefined).map((r) => r.bodyLength)).toEqual([]);
  });

  it('refuses a multipart commit when the name appeared meanwhile, keeping the other object and aborting the upload', async () => {
    const { server, destination, key } = await setup({ conditional: 'ignore' });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(randomBytes(PART + 5)));
    server.objects.set(key(PACK), { bytes: Buffer.from([4, 2]), etag: 'x', modified: 0 });
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.objects.get(key(PACK))!.bytes).toEqual(Buffer.from([4, 2]));
    expect(server.uploads.size).toBe(0);
  });

  it('enforced 412 on CompleteMultipartUpload is a conflict and aborts the upload', async () => {
    const { server, destination, key } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(randomBytes(PART + 5)));
    server.objects.set(key(PACK), { bytes: Buffer.from([4, 2]), etag: 'x', modified: 0 });
    server.fail((r) => r.method === 'HEAD' && r.path.endsWith(PACK), { kind: 'status', status: 404 }, 1, 0);
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.objects.get(key(PACK))!.bytes).toEqual(Buffer.from([4, 2]));
    expect(server.uploads.size).toBe(0);
  });

  it('falls back to a header-less CompleteMultipartUpload when the provider answers 501', async () => {
    const { server, destination, key } = await setup({ conditional: 'unsupported' });
    const bytes = new Uint8Array(randomBytes(PART + 99));
    await put(destination, PACK, bytes);
    expect(server.objects.get(key(PACK))!.bytes.equals(Buffer.from(bytes))).toBe(true);
    expect(server.uploads.size).toBe(0);
  });

  it('a part failure aborts the multipart upload and surfaces the error', async () => {
    const { server, destination } = await setup();
    server.fail((r) => r.method === 'PUT' && r.query['partNumber'] === '2', { kind: 'status', status: 400, code: 'InvalidArgument' }, 5);
    const out = await destination.sink().create(PACK);
    await expect(out.write(new Uint8Array(randomBytes(PART * 2 + 1)))).rejects.toMatchObject({ code: 'rejected' });
    expect(server.uploads.size).toBe(0);
    expect(server.keys()).toEqual([]);
    await expect(out.write(new Uint8Array([1]))).rejects.toBeInstanceOf(BackupError);
  });
});

describe('s3 destination: reads, listing and deletes', () => {
  it('streams from an offset, reports a missing object as an integrity error and stops at the end', async () => {
    const { destination } = await setup();
    await put(destination, MANIFEST, new Uint8Array([10, 11, 12, 13, 14]));
    expect([...(await collect(destination.source().read(MANIFEST, 2)))]).toEqual([12, 13, 14]);
    expect([...(await collect(destination.source().read(MANIFEST)))]).toEqual([10, 11, 12, 13, 14]);
    await expect(collect(destination.source().read(PACK))).rejects.toMatchObject({ code: 'integrity' });
    await expect(collect(destination.source().read(MANIFEST, 5))).rejects.toMatchObject({ code: 'integrity' });
  });

  it('resumes a dropped or truncated download from the byte already delivered (conditional range)', async () => {
    const { server, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(300_000));
    await put(destination, PACK, bytes);
    server.fail((r) => r.method === 'GET' && r.path.endsWith(PACK), { kind: 'truncate' }, 2);
    const got = await collect(destination.source().read(PACK));
    expect(got.equals(Buffer.from(bytes))).toBe(true);
    const gets = server.requests.filter((r) => r.method === 'GET' && r.path.endsWith(PACK));
    expect(gets.length).toBeGreaterThanOrEqual(2);
    expect(gets[0]!.headers['range']).toBeUndefined();
    expect(gets[1]!.headers['range']).toMatch(/^bytes=\d+-$/);
    expect(gets[1]!.headers['if-match']).toBeDefined();
  });

  it('gives up with a short error when the download keeps failing, and reports an object that changed mid-read', async () => {
    const { server, destination, key } = await setup();
    await put(destination, PACK, new Uint8Array(randomBytes(100_000)));
    server.fail((r) => r.method === 'GET' && r.path.endsWith(PACK), { kind: 'truncate' }, 100);
    await expect(collect(destination.source().read(PACK))).rejects.toMatchObject({ code: expect.stringMatching(/network|mismatch/) });
    server.clearFaults();
    server.fail((r) => r.method === 'GET' && r.path.endsWith(PACK), { kind: 'truncate' }, 1);
    const stream = destination.source().read(PACK)[Symbol.asyncIterator]();
    const first = await stream.next();
    expect(first.done).toBe(false);
    server.objects.set(key(PACK), { bytes: Buffer.from(randomBytes(100_000)), etag: 'changed', modified: 0 });
    let failure: unknown;
    try { for (;;) { const next = await stream.next(); if (next.done === true) break; } } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'mismatch' });
  });

  it('lists committed objects under a prefix sorted by name, ignoring foreign keys and following pagination', async () => {
    const { server, destination, key } = await setup({ pageSize: 2 });
    for (const name of [MANIFEST2, MANIFEST]) await put(destination, name, new Uint8Array([1]));
    for (const id of ['1', '2', '3']) await put(destination, `packs/${id.repeat(32)}`, new Uint8Array([1, 2]));
    server.objects.set(key('manifests/notes.txt'), { bytes: Buffer.from('x'), etag: 'x', modified: 0 });
    server.objects.set('other-prefix/manifests/20261029T000000Z-' + 'e'.repeat(32), { bytes: Buffer.from('x'), etag: 'x', modified: 0 });
    expect((await destination.list('manifests/')).map((o) => o.name)).toEqual([MANIFEST, MANIFEST2]);
    expect((await destination.list('packs/')).map((o) => o.name)).toEqual(['1', '2', '3'].map((id) => `packs/${id.repeat(32)}`));
    expect(server.count((r) => r.method === 'GET' && r.query['list-type'] === '2')).toBeGreaterThanOrEqual(3);
  });

  it('keeps repositories under different prefixes (and the bucket root) apart', async () => {
    const { server, destination, endpoint, definition } = await setup(undefined, { prefix: 'one' });
    await put(destination, PACK, new Uint8Array([1]));
    const root = createS3Destination({ definition: { ...definition, prefix: undefined as never }, credentials: server.credentials, client: FAST });
    expect(endpoint).toBeTruthy();
    expect(await root.list('packs/')).toEqual([]);
    await put(root, PACK, new Uint8Array([2, 2]));
    expect(server.keys()).toEqual([PACK, `one/${PACK}`].sort());
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 1 }]);
  });

  it('deletes idempotently and replaceRepo overwrites repo (the only overwrite) and checks its size', async () => {
    const { server, destination, key } = await setup();
    await put(destination, MANIFEST, new Uint8Array([1]));
    await destination.deleteObject(MANIFEST);
    await destination.deleteObject(MANIFEST);
    expect(await destination.stat(MANIFEST)).toBeNull();
    await put(destination, 'repo', new Uint8Array([1]));
    await destination.replaceRepo(new Uint8Array([2, 3]));
    expect(server.objects.get(key('repo'))!.bytes).toEqual(Buffer.from([2, 3]));
    expect(server.requests.filter((r) => r.method === 'PUT' && r.path.endsWith('/repo')).map((r) => r.headers['if-none-match'])).toEqual(['*', undefined]);
    await destination.replaceRepo(new Uint8Array([4]));
    expect(await destination.stat('repo')).toEqual({ name: 'repo', size: 1 });
    // A repo write on a fresh destination also works (re-wrap onto an empty location is the caller's rule, not this one's).
    const empty = await setup(undefined, { prefix: 'fresh' });
    await empty.destination.replaceRepo(new Uint8Array([5, 5]));
    expect(await empty.destination.stat('repo')).toEqual({ name: 'repo', size: 2 });
  });

  it('sweeps stale multipart uploads of repository objects and probes, never a fresh one or one this process is writing', async () => {
    let clock = Date.now();
    const { server, destination, key } = await setup({ now: () => clock });
    const mine = await destination.sink().create(PACK);
    await mine.write(new Uint8Array(randomBytes(PART + 1)));
    // A crashed process left these behind: a stale pack upload, a stale probe upload, a foreign key and a fresh one.
    const stale = Date.now() - 3 * 3_600_000;
    for (const [id, name, initiated] of [['u-stale', key(PACK2), stale], ['u-probe', 'hub1/.dude-probe/abc-mp', stale], ['u-foreign', 'hub1/unrelated/file', stale], ['u-fresh', key(MANIFEST), Date.now()]] as const) {
      server.uploads.set(id, { key: name, initiated, parts: new Map() });
    }
    expect(await destination.sweepIncomplete!(3_600_000, clock)).toBe(2);
    expect([...server.uploads.keys()].filter((id) => !id.startsWith('upload-')).sort()).toEqual(['u-foreign', 'u-fresh']);
    expect([...server.uploads.keys()].filter((id) => id.startsWith('upload-'))).toHaveLength(1); // the one this process is writing
    await mine.abort();
  });
});

describe('s3 destination: probe', () => {
  it('reports an enforced conditional write, multipart, delete and addressing, and leaves nothing behind', async () => {
    const { server, destination } = await setup();
    const report = await destination.probeDetailed();
    expect(report).toMatchObject({ ok: true, write: true, read: true, delete: true, multipart: true, conditionalWrites: 'enforced', addressing: 'path' });
    expect(report.failedStep).toBeUndefined();
    expect(report.reason).toBeUndefined();
    expect(report.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Math.abs(report.clockSkewSeconds!)).toBeLessThan(5);
    expect(server.keys()).toEqual([]);
    expect(server.uploads.size).toBe(0);
    expect(server.requests.every((r) => r.path.includes('/.dude-probe/') || r.method === 'HEAD' || r.path === '/backups')).toBe(true);
    expect(await destination.probe()).toEqual({ ok: true, freeBytes: null });
    expect(JSON.stringify(report)).not.toContain(server.options.secretAccessKey);
  });

  it('reports a provider that ignores or does not support If-None-Match', async () => {
    const ignored = await setup({ conditional: 'ignore' });
    expect(await ignored.destination.probeDetailed()).toMatchObject({ ok: true, conditionalWrites: 'ignored' });
    expect(ignored.server.keys()).toEqual([]);
    const unsupported = await setup({ conditional: 'unsupported' });
    expect(await unsupported.destination.probeDetailed()).toMatchObject({ ok: true, conditionalWrites: 'unsupported', write: true, delete: true });
    expect(unsupported.server.keys()).toEqual([]);
  });

  it('names the failed step and a short reason, and cleans up', async () => {
    const wrong = await setup();
    const denied = createS3Destination({ definition: wrong.definition, credentials: { ...wrong.server.credentials, secretAccessKey: 'wrong/secret/value' }, client: FAST });
    expect(await denied.probeDetailed()).toMatchObject({ ok: false, failedStep: 'write', reason: 'auth', write: false, read: false, delete: false, multipart: false });
    expect(await denied.probe()).toEqual({ ok: false, reason: 'auth' });

    const multipart = await setup();
    multipart.server.fail((r) => r.method === 'POST' && r.query['uploads'] !== undefined, { kind: 'status', status: 501, code: 'NotImplemented' }, 10);
    expect(await multipart.destination.probeDetailed()).toMatchObject({ ok: false, failedStep: 'multipart', reason: 'server', write: true, read: true, multipart: false, delete: false });
    expect(multipart.server.keys()).toEqual([]);

    const bucket = await setup();
    const missing = createS3Destination({ definition: { ...bucket.definition, bucket: 'nonexistent' }, credentials: bucket.server.credentials, client: FAST });
    expect(await missing.probeDetailed()).toMatchObject({ ok: false, failedStep: 'write', reason: 'bad-endpoint' });
  });

  it('reports the provider clock skew after correcting for it', async () => {
    const { destination } = await setup({ now: () => Date.now() + 3_600_000 });
    const report = await destination.probeDetailed();
    expect(report.ok).toBe(true);
    expect(report.clockSkewSeconds).toBeGreaterThan(3_590);
    expect(report.clockSkewSeconds).toBeLessThan(3_610);
  });

  it('reports virtual-hosted addressing for an AWS endpoint without any request being sent to it', async () => {
    const server = new FakeS3Server();
    servers.push(server);
    const destination = createS3Destination({
      definition: { id: 'd', kind: 's3', label: 'AWS', endpoint: 'https://s3.eu-west-1.amazonaws.com', region: 'eu-west-1', bucket: 'backups' }, credentials: server.credentials,
      client: { ...FAST, transport: async () => { throw new Error('offline'); } },
    });
    expect(await destination.probeDetailed()).toMatchObject({ ok: false, addressing: 'virtual-hosted', failedStep: 'write' });
  });
});

describe('s3 destination: opening from a definition', () => {
  const paths = { dataDir: '/data', configDir: '/config', tlsDir: '/config/tls', secretsDir: '/config/secrets', storageDir: '/data/storage' };
  const memoryStore = () => {
    const values = new Map<string, Buffer>();
    return createS3CredentialStore({
      get: (purpose) => { const value = values.get(purpose); return value === undefined ? null : Buffer.from(value); },
      put: (purpose, value) => { values.set(purpose, Buffer.from(value)); },
      delete: (purpose) => values.delete(purpose),
      status: () => ({ 'backup.s3.credentials': { present: values.has('backup.s3.credentials'), needsReentry: false } }) as never,
    });
  };

  it('reads the credentials from the store, never from the definition, and refuses a missing or link-local one', async () => {
    const { server, definition } = await setup();
    const store = memoryStore();
    expect(() => openBackupDestination(definition, paths, 'linux', { s3Credentials: store })).toThrow(/No S3 credentials/);
    store.put(definition.id, server.credentials);
    const destination = openBackupDestination(definition, paths, 'linux', { s3Credentials: store, s3: { client: FAST, partBytes: PART, minPartBytes: 1024 } });
    expect(destination.kind).toBe('s3');
    expect(JSON.stringify(definition)).not.toContain(server.options.secretAccessKey);
    await put(destination as S3BackupDestination, PACK, new Uint8Array([1]));
    expect(server.keys()).toEqual([`hub1/${PACK}`]);
    store.put('d-evil', server.credentials);
    for (const endpoint of ['https://169.254.169.254', 'https://[fd00:ec2::254]', 'https://168.63.129.16']) {
      expect(() => openBackupDestination({ ...definition, id: 'd-evil', endpoint, allowPrivateNetwork: true }, paths, 'linux', { s3Credentials: store }), endpoint).toThrow(/reserved|refused|link-local/i);
    }
    expect(() => openBackupDestination({ ...definition, id: 'd-evil', endpoint: 'https://127.0.0.1', allowPrivateNetwork: false }, paths, 'linux', { s3Credentials: store })).toThrow(/private/);
  });
});
