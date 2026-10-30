import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupError, REPO_OBJECT_NAME } from '@dude/hub-backup';
import type { HubBackupDriveDestination } from '../../../config/hub-config.js';
import { DestinationError, assertObjectName, backupIdOfManifest, packIdOfObject } from '../destination.js';
import { openBackupDestination } from '../index.js';
import { createDriveCredentialStore } from './drive-credentials.js';
import { createDriveDestination } from './drive-destination.js';
import type { DriveBackupDestination, DriveDestinationOptions } from './drive-destination.js';
import { FakeDriveServer } from './fake-drive-server.js';
import type { FakeDriveOptions } from './fake-drive-server.js';

/**
 * The Google Drive destination against the in-process fake (Milestone 856). The `describe('conformance')` block is the destination
 * contract every kind keeps (committed-object semantics, write-once names, sorted listings of committed objects only, ranged and
 * resumable reads, verify-on-write, atomic repo replacement, idempotent delete); the rest is Drive specific: resumable sessions and
 * their retries, token refresh and revocation, quota, and the scope rule (only the one folder is ever listed or touched).
 */
const servers: FakeDriveServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); });

const PACK = `packs/${'a'.repeat(32)}`;
const PACK2 = `packs/${'c'.repeat(32)}`;
const MANIFEST = `manifests/20261027T120000Z-${'b'.repeat(32)}`;
const MANIFEST2 = `manifests/20261028T000000Z-${'d'.repeat(32)}`;
const CHUNK = 256 * 1024;

const sleeps: number[] = [];
const FAST = { sleep: async (ms: number): Promise<void> => { sleeps.push(ms); }, retry: { attempts: 4, baseMs: 1, maxMs: 4 }, random: () => 1 };

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const piece of stream) parts.push(piece);
  return Buffer.concat(parts);
}

async function setup(serverOptions: FakeDriveOptions = {}, extra: Partial<DriveDestinationOptions> = {}) {
  sleeps.length = 0;
  const server = new FakeDriveServer(serverOptions);
  servers.push(server);
  await server.start();
  const folderId = server.createFolder();
  const refreshToken = server.issueRefreshToken();
  const definition: HubBackupDriveDestination = { id: 'd-drive', kind: 'drive', label: 'Spec Drive', folderId, clientId: server.options.clientId };
  const credentials = { clientSecret: server.options.clientSecret, refreshToken };
  const client = { endpoints: server.endpoints(), ...FAST };
  const make = (more: Partial<DriveDestinationOptions> = {}): DriveBackupDestination => createDriveDestination({ definition, credentials, chunkBytes: CHUNK, client, ...extra, ...more });
  return { server, folderId, definition, credentials, destination: make(), another: make, refreshToken };
}

async function put(destination: DriveBackupDestination, name: string, bytes: Uint8Array, pieces = 1): Promise<void> {
  const out = await destination.sink().create(name);
  const size = Math.max(1, Math.ceil(bytes.length / pieces));
  for (let offset = 0; offset < bytes.length; offset += size) await out.write(bytes.subarray(offset, offset + size));
  await out.commit();
}

describe('drive destination conformance', () => {
  it('names the object kinds the engine uses and refuses everything else', async () => {
    const { destination } = await setup();
    expect(destination).toMatchObject({ id: 'd-drive', kind: 'drive', label: 'Spec Drive' });
    for (const name of [REPO_OBJECT_NAME, PACK, MANIFEST]) expect(() => assertObjectName(name)).not.toThrow();
    for (const bad of ['', 'packs/x', '../repo', 'packs/' + 'A'.repeat(32), 'repo/x', '.dude-probe-aa']) {
      await expect(destination.sink().create(bad)).rejects.toMatchObject({ code: 'bad-name' });
      await expect(destination.stat(bad)).rejects.toMatchObject({ code: 'bad-name' });
      await expect(destination.deleteObject(bad)).rejects.toMatchObject({ code: 'bad-name' });
    }
    expect(backupIdOfManifest(MANIFEST)).toBe(`20261027T120000Z-${'b'.repeat(32)}`);
    expect(packIdOfObject(PACK)).toBe('a'.repeat(32));
  });

  it('commits an object only at commit and never overwrites (write-once names)', async () => {
    const { server, folderId, destination } = await setup();
    const sink = destination.sink();
    const out = await sink.create(PACK);
    await out.write(new Uint8Array([1, 2, 3]));
    expect(server.names(folderId)).toEqual([]);
    expect(await destination.stat(PACK)).toBeNull();
    expect(await destination.list('packs/')).toEqual([]);
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' }); // being written by this process
    await out.write(new Uint8Array([4]));
    await out.commit();
    expect(server.names(folderId)).toEqual([PACK]);
    expect(server.find(folderId, PACK)[0]!.bytes).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(server.sessions.size).toBe(1); // the session of the object that was written; nothing else is left open
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: 4 });
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 4 }]);
    await expect(sink.create(PACK)).rejects.toBeInstanceOf(DestinationError);
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' });
    await expect(out.write(new Uint8Array([9]))).rejects.toBeInstanceOf(BackupError);
    await expect(out.commit()).rejects.toBeInstanceOf(BackupError);
    expect(server.authFailures).toBe(0);
  });

  it('refuses a name another writer committed between create and commit, leaving theirs untouched', async () => {
    const { server, folderId, destination } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([5]));
    const id = 'other0000001';
    server.files.set(id, { id, name: PACK, mime: 'application/octet-stream', parents: [folderId], bytes: Buffer.from([9, 9, 9]) });
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.find(folderId, PACK)).toHaveLength(1);
    expect(server.find(folderId, PACK)[0]!.bytes).toEqual(Buffer.from([9, 9, 9]));
    await expect(destination.sink().create(PACK)).rejects.toMatchObject({ code: 'exists' }); // and the name is free to nobody
  });

  it('removes its own file when a concurrent writer landed the same name during the commit (duplicate names are legal in Drive)', async () => {
    const { server, folderId, destination } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([5, 5]));
    // A second file with the name appears as the last chunk is processed: the post-write lookup sees two and keeps the other writer's.
    const originalSet = server.files.set.bind(server.files);
    let injected = false;
    server.files.set = (key, value) => {
      const result = originalSet(key, value);
      if (!injected && value.name === PACK) { injected = true; originalSet('rival0000001', { id: 'rival0000001', name: PACK, mime: 'application/octet-stream', parents: [folderId], bytes: Buffer.from([7]) }); }
      return result;
    };
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.find(folderId, PACK).map((f) => f.id)).toEqual(['rival0000001']);
  });

  it('lists committed objects of one prefix only, sorted by name, ignoring anything that is not a backup object', async () => {
    const { server, folderId, destination } = await setup({ maxPageSize: 2 });
    await put(destination, PACK2, new Uint8Array([1]));
    await put(destination, MANIFEST2, new Uint8Array([2, 2]));
    await put(destination, PACK, new Uint8Array([3, 3, 3]));
    await put(destination, MANIFEST, new Uint8Array([4]));
    await put(destination, REPO_OBJECT_NAME, new Uint8Array([5]));
    const strayId = 'stray0000001';
    server.files.set(strayId, { id: strayId, name: 'packs/not-a-pack', mime: 'application/octet-stream', parents: [folderId], bytes: Buffer.from([6]) });
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 3 }, { name: PACK2, size: 1 }]);
    expect(await destination.list('manifests/')).toEqual([{ name: MANIFEST, size: 1 }, { name: MANIFEST2, size: 2 }]);
    expect(server.count((r) => r.method === 'GET' && r.path === '/drive/v3/files' && r.query.has('pageToken'))).toBeGreaterThan(0); // followed the page tokens
  });

  it('reads whole and from an offset, streaming; a missing object is an integrity error; reading past the end is empty', async () => {
    const { destination } = await setup();
    const bytes = new Uint8Array(randomBytes(3 * CHUNK + 1234));
    await put(destination, PACK, bytes, 7);
    expect(await collect(destination.source().read(PACK))).toEqual(Buffer.from(bytes));
    expect(await collect(destination.source().read(PACK, 1000))).toEqual(Buffer.from(bytes.subarray(1000)));
    expect(await collect(destination.source().read(PACK, bytes.length))).toEqual(Buffer.alloc(0));
    await expect(collect(destination.source().read(PACK2))).rejects.toMatchObject({ code: 'integrity' });
  });

  it('deletes idempotently and replaces the repository object atomically (the old or the new, never half)', async () => {
    const { server, folderId, destination } = await setup();
    await put(destination, PACK, new Uint8Array([1]));
    await destination.deleteObject(PACK);
    await destination.deleteObject(PACK);
    expect(await destination.stat(PACK)).toBeNull();
    expect(server.names(folderId)).toEqual([]);
    await destination.replaceRepo(new Uint8Array([1, 2, 3])); // no repo yet: created
    expect(await collect(destination.source().read(REPO_OBJECT_NAME))).toEqual(Buffer.from([1, 2, 3]));
    const before = server.find(folderId, REPO_OBJECT_NAME)[0]!.id;
    await destination.replaceRepo(new Uint8Array([9, 8]));
    expect(server.find(folderId, REPO_OBJECT_NAME)).toHaveLength(1);
    expect(server.find(folderId, REPO_OBJECT_NAME)[0]!.id).toBe(before);
    expect(await collect(destination.source().read(REPO_OBJECT_NAME))).toEqual(Buffer.from([9, 8]));
  });

  it('verify-on-write: a stored file whose MD5 differs from the bytes sent is removed and reported as a mismatch', async () => {
    const { server, folderId, destination } = await setup();
    server.fail((r) => r.method === 'PUT' && r.path.startsWith('/upload/session/'), { kind: 'wrong-md5' });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([1, 2]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'mismatch' });
    expect(server.names(folderId)).toEqual([]);
    await put(destination, PACK, new Uint8Array([1, 2])); // and the name is usable again
    await expect(destination.replaceRepo(new Uint8Array([1]))).resolves.toBeUndefined();
    server.fail((r) => r.method === 'PATCH', { kind: 'wrong-md5' });
    await expect(destination.replaceRepo(new Uint8Array([2, 2]))).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('probes connectivity, writes and removes a tiny file, reports the storage quota and leaves nothing behind', async () => {
    const { server, folderId, destination } = await setup({ quotaBytes: 15 * 1024 * 1024 * 1024 });
    await put(destination, PACK, new Uint8Array([1, 2, 3]));
    const before = server.names(folderId);
    expect(await destination.probe()).toEqual({ ok: true, freeBytes: 15 * 1024 * 1024 * 1024 - 3 });
    const report = await destination.probeDetailed();
    expect(report).toMatchObject({ ok: true, authorized: true, folder: true, write: true, read: true, delete: true, storage: { usage: 3, limit: 15 * 1024 * 1024 * 1024 } });
    expect(server.names(folderId)).toEqual(before);
    const unlimited = await setup();
    expect(await unlimited.destination.probe()).toEqual({ ok: true, freeBytes: null });
  });

  it('reports a probe failure as a short code and never throws', async () => {
    const { server, folderId, destination } = await setup();
    server.files.delete(folderId); // the folder was deleted in Drive
    expect(await destination.probe()).toEqual({ ok: false, reason: 'unavailable' });
    expect(await destination.probeDetailed()).toMatchObject({ ok: false, failedStep: 'folder', reason: 'unavailable', authorized: true, folder: false });
  });

  it('is built by the opener from the secret store and refuses to open without an authorization', async () => {
    const { definition, credentials } = await setup();
    const values = new Map<string, Buffer>();
    const store = createDriveCredentialStore({
      get: (purpose) => { const v = values.get(purpose); return v === undefined ? null : Buffer.from(v); }, put: (purpose, value) => { values.set(purpose, Buffer.from(value)); },
      delete: (purpose) => values.delete(purpose), status: () => ({ 'backup.drive.refreshToken': { present: values.has('backup.drive.refreshToken'), needsReentry: false } }) as never,
    });
    const paths = { dataDir: '/x/data', configDir: '/x/config', tlsDir: '/x/tls', secretsDir: '/x/secrets', storageDir: '/x/storage' };
    expect(() => openBackupDestination(definition, paths, 'linux', { driveCredentials: store })).toThrow(expect.objectContaining({ code: 'unavailable', message: expect.stringContaining('connect it again') }));
    store.put(definition.id, credentials);
    expect(openBackupDestination(definition, paths, 'linux', { driveCredentials: store })).toMatchObject({ kind: 'drive', id: definition.id });
  });
});

describe('drive destination: chunked resumable uploads', () => {
  it('sends 256 KiB-multiple chunks, the last one carrying the total, and stores identical bytes', async () => {
    const { server, folderId, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(3 * CHUNK + 777));
    await put(destination, PACK, bytes, 11);
    expect(server.find(folderId, PACK)[0]!.bytes).toEqual(Buffer.from(bytes));
    const puts = server.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/upload/session/'));
    expect(puts.map((r) => String(r.headers['content-range']))).toEqual([
      `bytes 0-${CHUNK - 1}/*`, `bytes ${CHUNK}-${2 * CHUNK - 1}/*`, `bytes ${2 * CHUNK}-${3 * CHUNK - 1}/*`, `bytes ${3 * CHUNK}-${3 * CHUNK + 776}/${3 * CHUNK + 777}`,
    ]);
    // The session URI is pre-authorized: no bearer goes to it.
    expect(puts.every((r) => r.headers['authorization'] === undefined)).toBe(true);
  });

  it('keeps the final chunk final when the object is an exact multiple of the chunk size, and stores an empty object', async () => {
    const { server, folderId, destination } = await setup();
    await put(destination, PACK, new Uint8Array(randomBytes(2 * CHUNK)), 3);
    const puts = server.requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/upload/session/'));
    expect(puts.map((r) => String(r.headers['content-range']))).toEqual([`bytes 0-${CHUNK - 1}/*`, `bytes ${CHUNK}-${2 * CHUNK - 1}/${2 * CHUNK}`]);
    await put(destination, PACK2, new Uint8Array(0));
    expect(server.find(folderId, PACK2)[0]!.bytes.length).toBe(0);
    expect(await destination.stat(PACK2)).toEqual({ name: PACK2, size: 0 });
  });

  it('holds at most one chunk in memory: the engine is held back until the chunk is acknowledged', async () => {
    const { server, destination } = await setup();
    const out = await destination.sink().create(PACK);
    const piece = new Uint8Array(randomBytes(CHUNK));
    await out.write(piece); // exactly one chunk: held, not sent (it may still be the last)
    expect(server.count((r) => r.method === 'PUT' && r.path.startsWith('/upload/session/'))).toBe(0);
    await out.write(new Uint8Array([1])); // more bytes: the held chunk is acknowledged before they are accepted
    expect(server.count((r) => r.method === 'PUT' && r.path.startsWith('/upload/session/'))).toBe(1);
    await out.abort();
  });

  it('resumes after a 503 on a chunk, asking the session what it holds', async () => {
    const { server, folderId, destination } = await setup();
    server.fail((r) => r.method === 'PUT' && r.path.startsWith('/upload/session/') && String(r.headers['content-range']).includes('/*'), { kind: 'status', status: 503 }, 2);
    const bytes = new Uint8Array(randomBytes(2 * CHUNK + 5));
    await put(destination, PACK, bytes, 4);
    expect(server.find(folderId, PACK)[0]!.bytes).toEqual(Buffer.from(bytes));
    expect(sleeps.length).toBeGreaterThan(0);
    expect(server.requests.some((r) => r.method === 'PUT' && String(r.headers['content-range']).startsWith('bytes */'))).toBe(true);
  });

  it('honours Retry-After on 429 and gives up with a throttled error after bounded retries', async () => {
    const { server, destination } = await setup();
    server.fail((r) => r.method === 'POST' && r.path === '/upload/drive/v3/files', { kind: 'status', status: 429, retryAfter: 3 }, 1);
    await put(destination, PACK, new Uint8Array([1]));
    expect(sleeps).toContain(3000 > 4 ? 4 : 3000); // capped at maxMs of the (test) retry policy
    server.fail((r) => r.method === 'POST' && r.path === '/upload/drive/v3/files', { kind: 'status', status: 429 }, 100);
    const out = await destination.sink().create(PACK2);
    await out.write(new Uint8Array([2]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'throttled' });
  });

  it('treats the 403 rate-limit reasons as retryable and any other 403 as an auth refusal', async () => {
    const { server, destination } = await setup();
    server.fail((r) => r.method === 'GET' && r.path === '/drive/v3/files', { kind: 'status', status: 403, reason: 'userRateLimitExceeded' }, 2);
    expect(await destination.list('packs/')).toEqual([]);
    server.fail((r) => r.method === 'GET' && r.path === '/drive/v3/files', { kind: 'status', status: 403, reason: 'insufficientPermissions' }, 1);
    await expect(destination.list('packs/')).rejects.toMatchObject({ code: 'auth' });
  });

  it('survives a connection that dropped after Drive stored the chunk (no duplicate bytes) and after the final chunk landed', async () => {
    const { server, folderId, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(2 * CHUNK + 99));
    server.fail((r) => r.method === 'PUT' && String(r.headers['content-range']).startsWith(`bytes 0-`), { kind: 'drop-after' }, 1);
    server.fail((r) => r.method === 'PUT' && String(r.headers['content-range']).includes(`/${bytes.length}`) && !String(r.headers['content-range']).startsWith('bytes */'), { kind: 'drop-after' }, 1);
    await put(destination, PACK, bytes, 5);
    expect(server.find(folderId, PACK)).toHaveLength(1);
    expect(server.find(folderId, PACK)[0]!.bytes).toEqual(Buffer.from(bytes));
  });

  it('a Drive that is full is `quota`, nothing is left behind and the object is not reported committed', async () => {
    const { server, folderId, destination } = await setup({ quotaBytes: 10 });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(20));
    await expect(out.commit()).rejects.toMatchObject({ code: 'quota' });
    expect(server.names(folderId)).toEqual([]);
    expect(await destination.stat(PACK)).toBeNull();
    await expect(out.commit()).rejects.toBeInstanceOf(BackupError);
  });

  it('fails a session that expired with a server error instead of guessing', async () => {
    const { server, destination } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(randomBytes(CHUNK + 1)));
    server.sessions.clear();
    await expect(out.commit()).rejects.toMatchObject({ code: 'server' });
  });

  it('aborts cancel the session and free the name; a failed write frees it too', async () => {
    const { server, destination } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(randomBytes(CHUNK + 1)));
    await out.abort();
    await out.abort();
    expect(server.sessions.size).toBe(0);
    await put(destination, PACK, new Uint8Array([1]));
    server.fail((r) => r.method === 'POST' && r.path === '/upload/drive/v3/files', { kind: 'status', status: 400, reason: 'badRequest' }, 1);
    const failing = await destination.sink().create(PACK2);
    await failing.write(new Uint8Array([1]));
    await expect(failing.commit()).rejects.toMatchObject({ code: 'rejected' });
    await put(destination, PACK2, new Uint8Array([1])); // the name is free again
  });

  it('refuses an upload session that points at another host, without sending any bytes there', async () => {
    const { server, destination, definition, credentials } = await setup();
    const sent: string[] = [];
    const wrapped = createDriveDestination({
      definition, credentials, chunkBytes: CHUNK,
      client: {
        endpoints: server.endpoints(), ...FAST,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (init?.method === 'POST' && input.includes('uploadType=resumable')) return new Response(null, { status: 200, headers: { location: 'https://evil.example.com/upload/session/x' } });
          if (input.includes('evil.example.com')) sent.push(input);
          return response;
        },
      },
    });
    const out = await wrapped.sink().create(PACK);
    await out.write(new Uint8Array([1]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'bad-endpoint' });
    expect(sent).toEqual([]);
  });
});

describe('drive destination: reads', () => {
  it('resumes a download whose connection dropped, from the byte already delivered', async () => {
    const { server, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(4 * CHUNK + 5));
    await put(destination, PACK, bytes, 3);
    server.fail((r) => r.method === 'GET' && r.query.get('alt') === 'media', { kind: 'truncate' }, 2);
    expect(await collect(destination.source().read(PACK))).toEqual(Buffer.from(bytes));
    const ranges = server.requests.filter((r) => r.query.get('alt') === 'media').map((r) => r.headers['range']);
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0]).toBeUndefined();
    expect(ranges.slice(1).every((value) => /^bytes=\d+-$/.test(String(value)))).toBe(true);
  });

  it('gives up with a network error when the download keeps failing', async () => {
    const { server, destination } = await setup();
    await put(destination, PACK, new Uint8Array(randomBytes(2 * CHUNK)));
    server.fail((r) => r.method === 'GET' && r.query.get('alt') === 'media', { kind: 'truncate' }, 100);
    await expect(collect(destination.source().read(PACK))).rejects.toMatchObject({ code: 'network' });
  });
});

describe('drive destination: authorization', () => {
  it('refreshes the access token on demand, once a minute before it expires, and once on a 401', async () => {
    const { server, destination } = await setup();
    await destination.list('packs/');
    await destination.list('packs/');
    expect(server.tokenRefreshes).toBe(1);
    server.expireAccessTokens(); // Google invalidated it early: one 401, one refresh, the request repeated
    expect(await destination.list('packs/')).toEqual([]);
    expect(server.tokenRefreshes).toBe(2);
    expect(server.authFailures).toBe(1);
  });

  it('a revoked consent is `reauth` with a plain instruction, from every operation, and no secret appears in any message', async () => {
    const { server, destination, credentials } = await setup();
    await put(destination, PACK, new Uint8Array([1]));
    server.revokeAll();
    const failures: unknown[] = [];
    for (const attempt of [() => destination.list('packs/'), () => destination.stat(PACK), () => collect(destination.source().read(PACK)), () => put(destination, PACK2, new Uint8Array([1])), () => destination.deleteObject(PACK)]) {
      try { await attempt(); } catch (error) { failures.push(error); }
    }
    expect(failures).toHaveLength(5);
    for (const error of failures) {
      expect(error).toBeInstanceOf(DestinationError);
      expect((error as DestinationError).code).toBe('reauth');
      expect((error as Error).message).toMatch(/revoked or has expired; connect the Drive destination again/);
      expect(`${(error as Error).message}${(error as Error).stack ?? ''}`).not.toContain(credentials.refreshToken);
      expect(`${(error as Error).message}`).not.toContain(credentials.clientSecret);
    }
    expect(await destination.probe()).toEqual({ ok: false, reason: 'reauth' });
  });

  it('a wrong client id or secret is `auth`, and an unreachable Google is a retried network error', async () => {
    const { server, definition, credentials } = await setup();
    const wrong = createDriveDestination({ definition, credentials: { ...credentials, clientSecret: 'GOCSPX-not-the-secret-0123456789' }, client: { endpoints: server.endpoints(), ...FAST } });
    await expect(wrong.list('packs/')).rejects.toMatchObject({ code: 'auth' });
    server.fail((r) => r.path === '/token', { kind: 'drop' }, 100);
    const down = createDriveDestination({ definition, credentials, client: { endpoints: server.endpoints(), ...FAST } });
    await expect(down.list('packs/')).rejects.toMatchObject({ code: 'network' });
  });

  it('never calls anything but the one folder: no listing of the rest of the Drive and every query is scoped to the folder id', async () => {
    const { server, folderId, destination } = await setup();
    const strangerFolder = server.createFolder('someone elses folder');
    server.files.set('stranger0001', { id: 'stranger0001', name: PACK, mime: 'application/octet-stream', parents: [strangerFolder], bytes: Buffer.from([1]) });
    await put(destination, MANIFEST, new Uint8Array([1]));
    expect(await destination.list('packs/')).toEqual([]);
    expect(await destination.stat(PACK)).toBeNull();
    for (const request of server.requests.filter((r) => r.path === '/drive/v3/files' && r.method === 'GET')) expect(request.query.get('q')).toContain(`'${folderId}' in parents`);
    expect(server.requests.some((r) => r.path.startsWith('/drive/v3/files/') && r.method === 'GET' && r.path.endsWith('stranger0001'))).toBe(false);
  });
});
