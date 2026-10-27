import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { S3Client, normalizeEtag } from './s3-client.js';
import type { S3ClientOptions } from './s3-client.js';
import { FakeS3Server } from './fake-s3-server.js';
import type { FakeS3Options } from './fake-s3-server.js';
import type { S3Transport, S3TransportRequest, S3TransportResponse } from './s3-transport.js';

/**
 * The S3 client against the in-process fake server (Milestone 848). The fake verifies every SigV4 signature and body hash with its
 * own canonicalization, so a passing request proves the client signs what it sends (`authFailures` stays 0). Backoff sleeps are
 * recorded instead of waited for, and `random` is pinned so the waits are exact.
 */
const SECRET = 'fake/secret+key/for/the/spec/0123456789';

let fake: FakeS3Server;
let sleeps: number[];
const open: FakeS3Server[] = [];

async function startFake(options: FakeS3Options = {}): Promise<FakeS3Server> {
  const server = new FakeS3Server(options);
  await server.start();
  open.push(server);
  return server;
}

function clientFor(server: FakeS3Server, overrides: Partial<S3ClientOptions> = {}): S3Client {
  return new S3Client({
    endpoint: server.endpoint, region: server.options.region, bucket: server.options.bucket, allowPrivateNetwork: true, credentials: server.credentials,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); }, random: () => 0, retry: { attempts: 4, baseMs: 100, maxMs: 1000 }, idleTimeoutMs: 2000,
    ...overrides,
  });
}

beforeEach(async () => { sleeps = []; fake = await startFake(); });
afterEach(async () => { await Promise.all(open.splice(0).map((server) => server.close())); });

const bytes = (text: string): Uint8Array => Buffer.from(text);
const md5 = (data: Uint8Array): string => createHash('md5').update(data).digest('hex');
async function collect(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: Uint8Array[] = [];
  for await (const piece of stream) parts.push(piece);
  return Buffer.concat(parts).toString('utf8');
}
const isPut = (r: { method: string; query: Record<string, string> }): boolean => r.method === 'PUT' && r.query['partNumber'] === undefined;

describe('objects: put, head, get, range get, delete', () => {
  it('round-trips an object, and every request verifies as signed', async () => {
    const client = clientFor(fake);
    expect(await client.head('packs/a')).toBeNull();
    expect(await client.get('packs/a', 0)).toBeNull();
    const put = await client.put('packs/a', bytes('hello world'));
    expect(put).toEqual({ etag: md5(bytes('hello world')), retried: false, status: 200 });
    expect(await client.head('packs/a')).toEqual({ size: 11, etag: md5(bytes('hello world')) });
    const got = await client.get('packs/a', 0);
    expect(got).toMatchObject({ status: 200, total: 11, etag: md5(bytes('hello world')) });
    expect(await collect((got as NonNullable<typeof got>).body)).toBe('hello world');
    await client.delete('packs/a');
    expect(await client.head('packs/a')).toBeNull();
    await client.delete('packs/a'); // deleting a missing object is not an error
    expect(fake.authFailures).toBe(0);
    expect(sleeps).toEqual([]);
  });

  it('sends the payload hash of the body and signs it (the fake rejects any mismatch)', async () => {
    const client = clientFor(fake);
    await client.put('o', bytes('payload'));
    expect(fake.requests.find((r) => r.method === 'PUT')?.headers['x-amz-content-sha256']).toBe(createHash('sha256').update('payload').digest('hex'));
    expect(fake.authFailures).toBe(0);
  });

  it('reads from an offset with a Range request and reports the total', async () => {
    const client = clientFor(fake);
    await client.put('o', bytes('0123456789'));
    const got = await client.get('o', 4);
    expect(got).toMatchObject({ status: 206, total: 10 });
    expect(await collect((got as NonNullable<typeof got>).body)).toBe('456789');
    expect(fake.requests.at(-1)?.headers['range']).toBe('bytes=4-');
  });

  it('answers 416 as a status (not an error) when the offset is at or past the end', async () => {
    const client = clientFor(fake);
    await client.put('o', bytes('0123'));
    const got = await client.get('o', 4);
    expect(got?.status).toBe(416);
    expect(await collect((got as NonNullable<typeof got>).body)).toBe('');
  });

  it('refuses a stale If-Match as a rejection and does not retry it', async () => {
    const client = clientFor(fake);
    await client.put('o', bytes('v1'));
    const before = fake.requests.length;
    await expect(client.get('o', 0, 'deadbeef'.repeat(4))).rejects.toMatchObject({ code: 'rejected' });
    expect(fake.requests.length).toBe(before + 1);
    const matching = await client.get('o', 0, md5(bytes('v1')));
    expect(matching?.status).toBe(200);
    matching?.destroy();
  });

  it('encodes keys with spaces, unicode and reserved characters, and the signature still verifies', async () => {
    const client = clientFor(fake);
    const name = 'packs/odd name+&=?#café (1)!*\'';
    await client.put(name, bytes('x'));
    expect(fake.keys()).toEqual([name]);
    expect(await client.head(name)).toMatchObject({ size: 1 });
    const listed = await client.list('packs/');
    expect(listed).toEqual([{ key: name, size: 1 }]);
    expect(fake.authFailures).toBe(0);
  });

  it('works with a session token (it is sent and signed)', async () => {
    const sts = await startFake({ sessionToken: 'SESSION-TOKEN-VALUE' });
    const client = clientFor(sts);
    await client.put('o', bytes('x'));
    expect(sts.keys()).toEqual(['o']);
    expect(sts.authFailures).toBe(0);
    // Without the token the fake refuses the signature.
    const bare = clientFor(sts, { credentials: { accessKeyId: sts.options.accessKeyId, secretAccessKey: sts.options.secretAccessKey } });
    await expect(bare.head('o')).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('prefix and addressing', () => {
  it('keeps objects under the configured prefix and returns repository-relative names', async () => {
    const client = clientFor(fake, { prefix: '/backups/hub-1/' });
    expect(client.prefix).toBe('backups/hub-1');
    await client.put('packs/a', bytes('1'));
    await client.put('manifests/m', bytes('22'));
    expect(fake.keys()).toEqual(['backups/hub-1/manifests/m', 'backups/hub-1/packs/a']);
    expect(await client.list('packs/')).toEqual([{ key: 'packs/a', size: 1 }]);
    expect(await client.list('')).toEqual([{ key: 'manifests/m', size: 2 }, { key: 'packs/a', size: 1 }]);
    expect(client.keyOf('x')).toBe('backups/hub-1/x');
  });

  it('refuses an unsafe prefix', () => {
    for (const prefix of ['a/../b', 'a//b', 'a b', '../x']) {
      expect(() => clientFor(fake, { prefix }), prefix).toThrow(expect.objectContaining({ code: 'bad-endpoint' }));
    }
  });

  it('defaults to virtual-hosted addressing for amazonaws.com and path style elsewhere, and honours forcePathStyle', async () => {
    const urls: string[] = [];
    const capture: S3Transport = (request) => { urls.push(request.url.toString()); return Promise.resolve(stubResponse(200, { 'content-length': '3' })); };
    const aws = new S3Client({ endpoint: 'https://s3.eu-west-1.amazonaws.com', region: 'eu-west-1', bucket: 'my-bucket', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: capture });
    expect(aws.addressing).toBe('virtual-hosted');
    await aws.head('packs/a b');
    expect(urls.pop()).toBe('https://my-bucket.s3.eu-west-1.amazonaws.com/packs/a%20b');
    const forced = new S3Client({ endpoint: 'https://s3.eu-west-1.amazonaws.com', region: 'eu-west-1', bucket: 'my-bucket', forcePathStyle: true, credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: capture });
    expect(forced.addressing).toBe('path');
    await forced.head('packs/a');
    expect(urls.pop()).toBe('https://s3.eu-west-1.amazonaws.com/my-bucket/packs/a');
    const minio = new S3Client({ endpoint: 'https://minio.example.com:9000', region: 'us-east-1', bucket: 'my-bucket', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: capture });
    expect(minio.addressing).toBe('path');
    const virtual = new S3Client({ endpoint: 'https://minio.example.com:9000', region: 'us-east-1', bucket: 'my-bucket', forcePathStyle: false, credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: capture });
    await virtual.head('k');
    expect(urls.pop()).toBe('https://my-bucket.minio.example.com:9000/k');
    // A literal address can never be virtual-hosted.
    const literal = new S3Client({ endpoint: 'https://203.0.113.9', region: 'us-east-1', bucket: 'my-bucket', forcePathStyle: false, allowPrivateNetwork: true, credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: capture });
    expect(literal.addressing).toBe('path');
  });
});

describe('listing', () => {
  it('follows continuation tokens across pages and strips nothing without a prefix', async () => {
    const paged = await startFake({ pageSize: 2 });
    const client = clientFor(paged);
    for (const name of ['packs/a', 'packs/b', 'packs/c', 'packs/d', 'packs/e', 'manifests/m']) await client.put(name, bytes(name));
    const before = paged.count((r) => r.method === 'GET' && r.query['list-type'] === '2');
    const listed = await client.list('packs/');
    expect(listed.map((o) => o.key)).toEqual(['packs/a', 'packs/b', 'packs/c', 'packs/d', 'packs/e']);
    expect(listed.map((o) => o.size)).toEqual([7, 7, 7, 7, 7]);
    expect(paged.count((r) => r.method === 'GET' && r.query['list-type'] === '2') - before).toBe(3);
    expect(await client.list('nothing/')).toEqual([]);
    expect(paged.authFailures).toBe(0);
  });

  it('fails instead of looping when pagination does not advance', async () => {
    const stuck = stubTransportFor(() => ({ status: 200, body: '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>same</NextContinuationToken></ListBucketResult>' }));
    const client = new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: stuck });
    await expect(client.list('')).rejects.toMatchObject({ code: 'server' });
    expect(stuck.calls.length).toBe(2);
    const noToken = stubTransportFor(() => ({ status: 200, body: '<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: noToken }).list('')).rejects.toMatchObject({ code: 'server' });
  });

  it('lists in-progress multipart uploads across pages', async () => {
    const paged = await startFake({ pageSize: 2, minPartBytes: 1 });
    const client = clientFor(paged, { prefix: 'repo' });
    const ids = [await client.createMultipart('packs/a'), await client.createMultipart('packs/b'), await client.createMultipart('packs/c'), await client.createMultipart('other/z')];
    const listed = await client.listUploads('packs/');
    expect(listed.map((u) => u.key).sort()).toEqual(['packs/a', 'packs/b', 'packs/c']);
    expect(listed.map((u) => u.uploadId).sort()).toEqual(ids.slice(0, 3).sort());
    expect(listed.every((u) => u.initiated > 0)).toBe(true);
    expect(paged.authFailures).toBe(0);
  });
});

describe('multipart upload', () => {
  it('creates, uploads parts, completes and reads back the assembled object', async () => {
    const small = await startFake({ minPartBytes: 4 });
    const client = clientFor(small);
    const id = await client.createMultipart('packs/big');
    const etag1 = await client.uploadPart('packs/big', id, 1, bytes('aaaa'));
    const etag2 = await client.uploadPart('packs/big', id, 2, bytes('bb'));
    expect(etag1).toBe(md5(bytes('aaaa')));
    expect(small.keys()).toEqual([]);
    const done = await client.completeMultipart('packs/big', id, [{ partNumber: 1, etag: etag1 }, { partNumber: 2, etag: etag2 }]);
    expect(done.status).toBe(200);
    expect(await client.head('packs/big')).toMatchObject({ size: 6 });
    const got = await client.get('packs/big', 0);
    expect(await collect((got as NonNullable<typeof got>).body)).toBe('aaaabb');
    expect(small.uploads.size).toBe(0);
    expect(small.authFailures).toBe(0);
  });

  it('an If-None-Match completion over an existing object is a 412 status, and nothing is overwritten', async () => {
    const small = await startFake({ minPartBytes: 1 });
    const client = clientFor(small);
    await client.put('o', bytes('original'));
    const id = await client.createMultipart('o');
    const etag = await client.uploadPart('o', id, 1, bytes('replacement'));
    const done = await client.completeMultipart('o', id, [{ partNumber: 1, etag }], { ifNoneMatch: true });
    expect(done.status).toBe(412);
    expect((small.objects.get('o') as { bytes: Buffer }).bytes.toString()).toBe('original');
    await client.abortMultipart('o', id);
    expect(small.uploads.size).toBe(0);
    await client.abortMultipart('o', id); // an unknown upload is not an error
  });

  it('maps completion refusals (a missing part, a part too small) to a rejection', async () => {
    const small = await startFake({ minPartBytes: 10 });
    const client = clientFor(small);
    const id = await client.createMultipart('o');
    const etag = await client.uploadPart('o', id, 1, bytes('short'));
    const etag2 = await client.uploadPart('o', id, 2, bytes('tail'));
    await expect(client.completeMultipart('o', id, [{ partNumber: 1, etag }, { partNumber: 2, etag: etag2 }])).rejects.toMatchObject({ code: 'rejected' });
    await expect(client.completeMultipart('o', id, [{ partNumber: 7, etag: 'x' }])).rejects.toMatchObject({ code: 'rejected' });
    expect(small.requests.filter((r) => r.method === 'POST' && r.query['uploadId'] !== undefined).length).toBe(2);
  });

  it('treats a 200 answer carrying an <Error> body as a failure', async () => {
    const stub = stubTransportFor((request) => (request.method === 'POST'
      ? { status: 200, body: '<Error><Code>InternalError</Code><Message>boom</Message></Error>' }
      : { status: 200, body: '' }));
    const client = new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: stub });
    await expect(client.completeMultipart('o', 'u', [{ partNumber: 1, etag: 'e' }])).rejects.toMatchObject({ code: 'server', message: expect.stringContaining('InternalError') });
    const denied = stubTransportFor(() => ({ status: 200, body: '<Error><Code>AccessDenied</Code></Error>' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: denied }).completeMultipart('o', 'u', [{ partNumber: 1, etag: 'e' }])).rejects.toMatchObject({ code: 'auth' });
  });

  it('refuses a missing upload id and a missing part ETag', async () => {
    const noId = stubTransportFor(() => ({ status: 200, body: '<InitiateMultipartUploadResult></InitiateMultipartUploadResult>' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: noId }).createMultipart('o')).rejects.toMatchObject({ code: 'server' });
    const noEtag = stubTransportFor(() => ({ status: 200, body: '' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: noEtag }).uploadPart('o', 'u', 1, bytes('x'))).rejects.toMatchObject({ code: 'server' });
  });
});

describe('conditional put (If-None-Match: *)', () => {
  it('enforce: the second write is a 412 status and the object is unchanged', async () => {
    const client = clientFor(fake);
    expect(await client.put('o', bytes('first'), { ifNoneMatch: true })).toMatchObject({ status: 200 });
    const second = await client.put('o', bytes('second'), { ifNoneMatch: true });
    expect(second).toMatchObject({ status: 412, etag: undefined });
    expect((fake.objects.get('o') as { bytes: Buffer }).bytes.toString()).toBe('first');
    expect(fake.requests.filter(isPut).every((r) => r.headers['if-none-match'] === '*')).toBe(true);
    // An unconditional put overwrites.
    expect(await client.put('o', bytes('third'))).toMatchObject({ status: 200 });
    expect((fake.objects.get('o') as { bytes: Buffer }).bytes.toString()).toBe('third');
  });

  it('ignore: a provider that ignores the header overwrites and answers 200 (the caller must detect it by reading back)', async () => {
    const lax = await startFake({ conditional: 'ignore' });
    const client = clientFor(lax);
    await client.put('o', bytes('first'), { ifNoneMatch: true });
    expect(await client.put('o', bytes('second'), { ifNoneMatch: true })).toMatchObject({ status: 200 });
    expect((lax.objects.get('o') as { bytes: Buffer }).bytes.toString()).toBe('second');
  });

  it('unsupported: a 501 is returned as a status, not thrown or retried', async () => {
    const old = await startFake({ conditional: 'unsupported' });
    const client = clientFor(old);
    expect(await client.put('o', bytes('x'), { ifNoneMatch: true })).toMatchObject({ status: 501 });
    expect(old.count(isPut)).toBe(1);
    expect(sleeps).toEqual([]);
    expect(old.keys()).toEqual([]);
  });

  it('a 412 without ifNoneMatch is an ordinary error', async () => {
    fake.fail(isPut, { kind: 'status', status: 412, code: 'PreconditionFailed' });
    await expect(clientFor(fake).put('o', bytes('x'))).rejects.toMatchObject({ code: 'rejected' });
  });
});

describe('retries', () => {
  it('retries a 503 with exponential backoff, then succeeds and reports `retried`', async () => {
    fake.fail(isPut, { kind: 'status', status: 503, code: 'ServiceUnavailable' }, 2);
    const result = await clientFor(fake).put('o', bytes('x'));
    expect(result).toMatchObject({ status: 200, retried: true });
    expect(fake.count(isPut)).toBe(3);
    expect(sleeps).toEqual([50, 100]); // base 100 * 2^n * (0.5 + 0 / 2)
    expect(fake.keys()).toEqual(['o']);
  });

  it('caps the backoff and uses full jitter bounds', async () => {
    fake.fail(isPut, { kind: 'status', status: 500 }, 3);
    await clientFor(fake, { retry: { attempts: 5, baseMs: 400, maxMs: 500 }, random: () => 1 }).put('o', bytes('x'));
    expect(sleeps).toEqual([400, 500, 500]);
  });

  it('gives up after the configured attempts and maps a persistent 5xx to `server`, without leaking the request', async () => {
    fake.fail(isPut, { kind: 'status', status: 500, code: 'InternalError' }, 99);
    const error = (await clientFor(fake).put('secret-object-name', bytes('x')).catch((e: unknown) => e as Error)) as Error;
    expect(error).toMatchObject({ code: 'server', message: 'S3 PutObject failed (500 InternalError).' });
    expect(fake.count(isPut)).toBe(4);
    expect(sleeps.length).toBe(3);
    expect(error.message).not.toContain('secret-object-name');
    expect(error.message).not.toContain(fake.endpoint);
  });

  it('maps throttling (SlowDown on a 503, or a 429) to `throttled`, and honours Retry-After up to the cap', async () => {
    fake.fail(isPut, { kind: 'status', status: 503, code: 'SlowDown' }, 99);
    await expect(clientFor(fake).put('o', bytes('x'))).rejects.toMatchObject({ code: 'throttled', message: 'S3 PutObject failed (503 SlowDown).' });
    fake.clearFaults();
    sleeps.length = 0;
    fake.fail(isPut, { kind: 'status', status: 429, code: 'Throttling', headers: { 'retry-after': '2' } }, 1);
    await clientFor(fake, { retry: { attempts: 3, baseMs: 100, maxMs: 5000 } }).put('o', bytes('x'));
    expect(sleeps).toEqual([2000]);
    fake.clearFaults();
    sleeps.length = 0;
    fake.fail(isPut, { kind: 'status', status: 429, headers: { 'retry-after': '600' } }, 1);
    await clientFor(fake, { retry: { attempts: 3, baseMs: 100, maxMs: 5000 } }).put('o', bytes('x'));
    expect(sleeps).toEqual([5000]);
  });

  it('retries a retryable S3 code even on an unusual status, and a 408 ends as `timeout`', async () => {
    fake.fail(isPut, { kind: 'status', status: 400, code: 'RequestTimeout' }, 1);
    expect(await clientFor(fake).put('o', bytes('x'))).toMatchObject({ status: 200, retried: true });
    fake.fail(isPut, { kind: 'status', status: 408, code: 'RequestTimeout' }, 99);
    await expect(clientFor(fake).put('o2', bytes('x'))).rejects.toMatchObject({ code: 'timeout' });
  });

  it('retries a dropped connection, and reports `network` when it never recovers', async () => {
    fake.fail((r) => r.method === 'HEAD', { kind: 'drop' }, 1);
    expect(await clientFor(fake).head('missing')).toBeNull();
    expect(sleeps.length).toBe(1);
    fake.clearFaults();
    fake.fail((r) => r.method === 'HEAD', { kind: 'drop' }, 99);
    await expect(clientFor(fake).head('missing')).rejects.toMatchObject({ code: 'network', message: 'S3 HeadObject failed (network).' });
  });

  it('reports `timeout` when the server never answers within the idle limit', async () => {
    fake.fail((r) => r.method === 'HEAD', { kind: 'hang' }, 99);
    await expect(clientFor(fake, { idleTimeoutMs: 80, retry: { attempts: 2, baseMs: 1, maxMs: 1 } }).head('o')).rejects.toMatchObject({ code: 'timeout', message: 'S3 HeadObject failed (timeout).' });
    expect(fake.count((r) => r.method === 'HEAD')).toBe(2);
  });

  it('never retries an authorization or addressing failure', async () => {
    fake.fail(isPut, { kind: 'status', status: 403, code: 'AccessDenied' }, 99);
    await expect(clientFor(fake).put('o', bytes('x'))).rejects.toMatchObject({ code: 'auth', message: 'S3 PutObject failed (403 AccessDenied).' });
    expect(fake.count(isPut)).toBe(1);
    fake.clearFaults();
    const wrongBucket = clientFor(fake, { bucket: 'nonexistent' });
    expect(await wrongBucket.head('o')).toBeNull(); // a HEAD 404 has no body, so a missing bucket reads as a missing object
    await expect(wrongBucket.list('')).rejects.toMatchObject({ code: 'bad-endpoint' });
    fake.fail(isPut, { kind: 'status', status: 400, code: 'InvalidRequest' }, 99);
    await expect(clientFor(fake).put('o', bytes('x'))).rejects.toMatchObject({ code: 'rejected' });
    expect(sleeps).toEqual([]);
  });

  it('maps a wrong secret key to `auth` without ever carrying a credential in the message', async () => {
    const client = clientFor(fake, { credentials: { accessKeyId: fake.options.accessKeyId, secretAccessKey: 'definitely-the-wrong-secret' } });
    const error = (await client.put('o', bytes('x')).catch((e: unknown) => e as Error)) as Error;
    expect(error).toMatchObject({ code: 'auth', message: 'S3 PutObject failed (403 SignatureDoesNotMatch).' });
    expect(fake.authFailures).toBe(1);
    for (const text of [error.message, String(error.stack)]) {
      expect(text).not.toContain('definitely-the-wrong-secret');
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(fake.options.accessKeyId);
    }
  });

  it('never follows a redirect and maps it to `bad-endpoint`', async () => {
    fake.fail((r) => r.method === 'HEAD', { kind: 'redirect', location: 'http://169.254.169.254/latest/meta-data' }, 99);
    await expect(clientFor(fake).head('o')).rejects.toMatchObject({ code: 'bad-endpoint' });
    expect(fake.count((r) => r.method === 'HEAD')).toBe(1);
    const moved = stubTransportFor(() => ({ status: 301, headers: { location: 'https://elsewhere.example.com/' }, body: '' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: moved }).list('')).rejects.toMatchObject({ code: 'bad-endpoint' });
    expect(moved.calls.length).toBe(1);
  });

  it('re-sends an upload whose ETag disagrees with the bytes, and gives up with `mismatch`', async () => {
    fake.fail(isPut, { kind: 'wrong-etag' }, 1);
    expect(await clientFor(fake).put('o', bytes('x'))).toMatchObject({ status: 200, retried: true, etag: md5(bytes('x')) });
    expect(fake.count(isPut)).toBe(2);
    fake.fail(isPut, { kind: 'wrong-etag' }, 99);
    await expect(clientFor(fake).put('o2', bytes('y'))).rejects.toMatchObject({ code: 'mismatch' });
    expect(fake.count(isPut)).toBe(2 + 3);
  });

  it('does not compare a multipart-style or encrypted-object ETag with the MD5 of the bytes', async () => {
    for (const headers of <Record<string, string>[]>[{ etag: '"0123456789abcdef0123456789abcdef-3"' }, { etag: `"${'0'.repeat(32)}"`, 'x-amz-server-side-encryption': 'aws:kms' }]) {
      const stub = stubTransportFor(() => ({ status: 200, headers, body: '' }));
      const client = new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: stub });
      expect(await client.put('o', bytes('x'))).toMatchObject({ status: 200, retried: false });
    }
  });
});

describe('clock skew', () => {
  it('learns the provider clock from a RequestTimeTooSkewed answer and retries once', async () => {
    const ahead = await startFake({ now: () => Date.now() + 60 * 60_000 });
    const client = clientFor(ahead);
    expect(await client.put('o', bytes('x'))).toMatchObject({ status: 200 });
    expect(Math.abs(client.skewMs - 60 * 60_000)).toBeLessThan(2000);
    expect(ahead.authFailures).toBe(1);
    expect(ahead.count(isPut)).toBe(2);
    // The learned skew is kept for the next request: no second failure.
    await client.head('o');
    expect(ahead.authFailures).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('gives a clock hint when the skew cannot be corrected', async () => {
    const stub = stubTransportFor(() => ({ status: 403, body: '<Error><Code>RequestTimeTooSkewed</Code></Error>' }));
    const client = new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: stub });
    await expect(client.head('o')).rejects.toMatchObject({ code: 'auth' });
    const body = stubTransportFor(() => ({ status: 403, body: '<Error><Code>RequestTimeTooSkewed</Code></Error>' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: body }).put('o', bytes('x'))).rejects.toMatchObject({ message: expect.stringContaining('clock') });
  });

  it('reports the provider clock offset from a cheap HEAD', async () => {
    const ahead = await startFake({ now: () => Date.now() + 5 * 60_000 });
    const offset = await clientFor(ahead).serverClockOffsetMs();
    expect(Math.abs((offset as number) - 5 * 60_000)).toBeLessThan(2000);
    const none = stubTransportFor(() => ({ status: 200, body: '' }));
    expect(await new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: none }).serverClockOffsetMs()).toBeNull();
  });
});

describe('response handling', () => {
  it('surfaces a connection cut mid-download as an error while reading the body', async () => {
    const client = clientFor(fake);
    await client.put('o', bytes('0123456789'.repeat(100)));
    fake.fail((r) => r.method === 'GET' && r.path.endsWith('/o'), { kind: 'truncate' }, 1);
    const got = await client.get('o', 0);
    await expect(collect((got as NonNullable<typeof got>).body)).rejects.toMatchObject({ kind: 'network' });
  });

  it('refuses an endpoint that ignored the Range, or answered another range', async () => {
    const ignored = stubTransportFor(() => ({ status: 200, headers: { 'content-length': '10' }, body: 'x'.repeat(10) }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: ignored }).get('o', 3)).rejects.toMatchObject({ code: 'rejected' });
    const shifted = stubTransportFor(() => ({ status: 206, headers: { 'content-range': 'bytes 0-9/10' }, body: 'x'.repeat(10) }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: shifted }).get('o', 3)).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('refuses a HEAD answer without a usable size', async () => {
    const stub = stubTransportFor(() => ({ status: 200, body: '' }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: stub }).head('o')).rejects.toMatchObject({ code: 'server' });
  });

  it('refuses an error or list body larger than its bound', async () => {
    const huge = stubTransportFor(() => ({ status: 200, body: 'x'.repeat(9 * 1024 * 1024) }));
    await expect(new S3Client({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'A', secretAccessKey: 'S' }, transport: huge }).list('')).rejects.toMatchObject({ code: 'server' });
  });

  it('normalizes ETags', () => {
    expect(normalizeEtag('"abc"')).toBe('abc');
    expect(normalizeEtag('W/"abc"')).toBe('abc');
    expect(normalizeEtag('abc')).toBe('abc');
    expect(normalizeEtag(undefined)).toBeUndefined();
  });
});

interface StubReply { status: number; headers?: Record<string, string>; body?: string }
type StubTransport = S3Transport & { calls: S3TransportRequest[] };

function stubResponse(status: number, headers: Record<string, string> = {}, body = ''): S3TransportResponse {
  return {
    status, headers,
    body: (async function* () { if (body.length > 0) yield Buffer.from(body); })(),
    destroy: () => undefined,
  };
}

function stubTransportFor(reply: (request: S3TransportRequest) => StubReply): StubTransport {
  const calls: S3TransportRequest[] = [];
  const transport = ((request: S3TransportRequest) => {
    calls.push(request);
    const answer = reply(request);
    return Promise.resolve(stubResponse(answer.status, answer.headers, answer.body));
  }) as StubTransport;
  transport.calls = calls;
  return transport;
}
