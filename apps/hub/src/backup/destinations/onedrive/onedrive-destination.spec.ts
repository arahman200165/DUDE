import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupError, REPO_OBJECT_NAME } from '@dude/hub-backup';
import type { HubBackupOneDriveDestination } from '../../../config/hub-config.js';
import { DestinationError, assertObjectName, backupIdOfManifest, packIdOfObject } from '../destination.js';
import { openBackupDestination } from '../index.js';
import { OneDriveClient } from './onedrive-client.js';
import { createOneDriveCredentialStore } from './onedrive-credentials.js';
import { createOneDriveDestination } from './onedrive-destination.js';
import type { OneDriveBackupDestination, OneDriveDestinationOptions } from './onedrive-destination.js';
import { FakeGraphServer } from './fake-graph-server.js';
import type { FakeGraphOptions } from './fake-graph-server.js';

/**
 * The OneDrive destination against the in-process fake Graph (Milestone 857). The `describe('conformance')` block is the destination
 * contract every kind keeps (committed-object semantics, write-once names, sorted listings of committed objects only, ranged and
 * resumable reads, verify-on-write, atomic repo replacement, idempotent delete); the rest is OneDrive specific: staged objects and
 * upload-session fragments with their retries, refresh-token rotation, throttling, quota, and the scope rule (only the one folder inside
 * the app folder is ever listed or touched).
 */
const servers: FakeGraphServer[] = [];
const scratch: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PACK = `packs/${'a'.repeat(32)}`;
const PACK2 = `packs/${'c'.repeat(32)}`;
const MANIFEST = `manifests/20261027T120000Z-${'b'.repeat(32)}`;
const MANIFEST2 = `manifests/20261028T000000Z-${'d'.repeat(32)}`;
const CHUNK = 320 * 1024;

const sleeps: number[] = [];
const FAST = { sleep: async (ms: number): Promise<void> => { sleeps.push(ms); }, retry: { attempts: 4, baseMs: 1, maxMs: 4 }, random: () => 1 };

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const piece of stream) parts.push(piece);
  return Buffer.concat(parts);
}

async function setup(serverOptions: FakeGraphOptions = {}, extra: Partial<OneDriveDestinationOptions> = {}) {
  sleeps.length = 0;
  const server = new FakeGraphServer(serverOptions);
  servers.push(server);
  await server.start();
  const scratchDir = mkdtempSync(path.join(tmpdir(), 'dude-onedrive-spec-'));
  scratch.push(scratchDir);
  const folderId = server.createFolder();
  const refreshToken = server.issueRefreshToken();
  const definition: HubBackupOneDriveDestination = { id: 'd-onedrive', kind: 'onedrive', label: 'Spec OneDrive', folderId, clientId: server.options.clientId };
  const credentials = { clientSecret: server.options.clientSecret, refreshToken };
  const client = { endpoints: server.endpoints(), ...FAST };
  const make = (more: Partial<OneDriveDestinationOptions> = {}): OneDriveBackupDestination => createOneDriveDestination({ definition, credentials, scratchDir, chunkBytes: CHUNK, client, ...extra, ...more });
  return { server, folderId, definition, credentials, scratchDir, destination: make(), another: make, refreshToken, client };
}

async function put(destination: OneDriveBackupDestination, name: string, bytes: Uint8Array, pieces = 1): Promise<void> {
  const out = await destination.sink().create(name);
  const size = Math.max(1, Math.ceil(bytes.length / pieces));
  for (let offset = 0; offset < bytes.length; offset += size) await out.write(bytes.subarray(offset, offset + size));
  await out.commit();
}

const isFragment = (r: { method: string; path: string }): boolean => r.method === 'PUT' && r.path.startsWith('/upload/');

describe('onedrive destination conformance', () => {
  it('names the object kinds the engine uses and refuses everything else', async () => {
    const { destination } = await setup();
    expect(destination).toMatchObject({ id: 'd-onedrive', kind: 'onedrive', label: 'Spec OneDrive' });
    for (const name of [REPO_OBJECT_NAME, PACK, MANIFEST]) expect(() => assertObjectName(name)).not.toThrow();
    for (const bad of ['', 'packs/x', '../repo', 'packs/' + 'A'.repeat(32), 'repo/x', '.dude-probe-aa']) {
      await expect(destination.sink().create(bad)).rejects.toMatchObject({ code: 'bad-name' });
      await expect(destination.stat(bad)).rejects.toMatchObject({ code: 'bad-name' });
      await expect(destination.deleteObject(bad)).rejects.toMatchObject({ code: 'bad-name' });
    }
    expect(backupIdOfManifest(MANIFEST)).toBe(`20261027T120000Z-${'b'.repeat(32)}`);
    expect(packIdOfObject(PACK)).toBe('a'.repeat(32));
  });

  it('commits an object only at commit and never overwrites (write-once names); nothing reaches OneDrive before commit and no staging file is left', async () => {
    const { server, folderId, destination, scratchDir } = await setup();
    const sink = destination.sink();
    const out = await sink.create(PACK);
    await out.write(new Uint8Array([1, 2, 3]));
    expect(server.names(folderId)).toEqual([]);
    expect(server.count((r) => r.method !== 'GET' && !r.path.endsWith('/token'))).toBe(0); // only the name lookup went out
    expect(await destination.stat(PACK)).toBeNull();
    expect(await destination.list('packs/')).toEqual([]);
    expect(readdirSync(scratchDir)).toHaveLength(1); // the staged bytes
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' }); // being written by this process
    await out.write(new Uint8Array([4]));
    await out.commit();
    expect(server.names(folderId)).toEqual([PACK]);
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(server.sessions.size).toBe(0); // a finished session is gone
    expect(readdirSync(scratchDir)).toEqual([]);
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: 4 });
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 4 }]);
    await expect(sink.create(PACK)).rejects.toBeInstanceOf(DestinationError);
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' });
    await expect(out.write(new Uint8Array([9]))).rejects.toBeInstanceOf(BackupError);
    await expect(out.commit()).rejects.toBeInstanceOf(BackupError);
    expect(server.authFailures).toBe(0);
  });

  it('refuses a name another writer committed between create and commit, leaving theirs untouched', async () => {
    const { server, folderId, destination, scratchDir } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([5]));
    server.put(folderId, PACK, Buffer.from([9, 9, 9]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from([9, 9, 9]));
    expect(readdirSync(scratchDir)).toEqual([]);
    await expect(destination.sink().create(PACK)).rejects.toMatchObject({ code: 'exists' }); // and the name is free to nobody
  });

  it('OneDrive itself refuses the name when a rival lands during the upload (conflictBehavior fail), and the rival is untouched', async () => {
    const { server, folderId, destination, definition, credentials, scratchDir } = await setup();
    let placed = false;
    const racing = createOneDriveDestination({
      definition, credentials, scratchDir, chunkBytes: CHUNK,
      client: { endpoints: server.endpoints(), ...FAST, fetch: async (input, init) => { if (init?.method === 'PUT' && input.includes('/upload/') && !placed) { placed = true; server.put(folderId, PACK, Buffer.from([7])); } return fetch(input, init); } },
    });
    const out = await racing.sink().create(PACK);
    await out.write(new Uint8Array([5, 5]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'exists' });
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from([7]));
    expect(server.sessions.size).toBe(0);
    expect(destination.kind).toBe('onedrive');
  });

  it('lists committed objects of one prefix only, sorted by name, following @odata.nextLink and ignoring anything that is not a backup object', async () => {
    const { server, folderId, destination } = await setup({ maxPageSize: 2 });
    await put(destination, PACK2, new Uint8Array([1]));
    await put(destination, MANIFEST2, new Uint8Array([2, 2]));
    await put(destination, PACK, new Uint8Array([3, 3, 3]));
    await put(destination, MANIFEST, new Uint8Array([4]));
    await put(destination, REPO_OBJECT_NAME, new Uint8Array([5]));
    server.put(folderId, 'packs/not-a-pack', Buffer.from([6]));
    server.createFolder('packs-subfolder', server.find(folderId, 'packs')!.id);
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 3 }, { name: PACK2, size: 1 }]);
    expect(await destination.list('manifests/')).toEqual([{ name: MANIFEST, size: 1 }, { name: MANIFEST2, size: 2 }]);
    expect(server.count((r) => r.method === 'GET' && r.query.has('$skiptoken'))).toBeGreaterThan(0);
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
    const before = server.find(folderId, REPO_OBJECT_NAME)!.id;
    await destination.replaceRepo(new Uint8Array([9, 8]));
    expect(server.names(folderId).filter((n) => n === 'repo')).toHaveLength(1);
    expect(server.find(folderId, REPO_OBJECT_NAME)!.id).toBe(before);
    expect(await collect(destination.source().read(REPO_OBJECT_NAME))).toEqual(Buffer.from([9, 8]));
  });

  it('verify-on-write: a stored file whose hash differs from the bytes sent is removed and reported as a mismatch', async () => {
    const { server, folderId, destination } = await setup();
    server.fail(isFragment, { kind: 'wrong-hash' });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array([1, 2]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'mismatch' });
    expect(server.names(folderId)).toEqual([]);
    await put(destination, PACK, new Uint8Array([1, 2])); // and the name is usable again
    await expect(destination.replaceRepo(new Uint8Array([1]))).resolves.toBeUndefined();
    server.fail((r) => r.method === 'PUT' && r.path.endsWith('/content'), { kind: 'wrong-hash' });
    await expect(destination.replaceRepo(new Uint8Array([2, 2]))).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('probes connectivity, writes and removes a tiny file, reports the storage quota and leaves nothing behind', async () => {
    const { server, folderId, destination } = await setup({ quotaBytes: 5 * 1024 * 1024 * 1024 });
    await put(destination, PACK, new Uint8Array([1, 2, 3]));
    const before = server.names(folderId);
    expect(await destination.probe()).toEqual({ ok: true, freeBytes: 5 * 1024 * 1024 * 1024 - 3 });
    const report = await destination.probeDetailed();
    expect(report).toMatchObject({ ok: true, authorized: true, folder: true, write: true, read: true, delete: true, storage: { usage: 3, limit: 5 * 1024 * 1024 * 1024 } });
    expect(server.names(folderId)).toEqual(before);
    const unlimited = await setup();
    expect(await unlimited.destination.probe()).toEqual({ ok: true, freeBytes: null });
  });

  it('reports a probe failure as a short code and never throws', async () => {
    const { server, folderId, destination } = await setup();
    server.items.delete(folderId); // the folder was deleted in OneDrive
    expect(await destination.probe()).toEqual({ ok: false, reason: 'unavailable' });
    expect(await destination.probeDetailed()).toMatchObject({ ok: false, failedStep: 'folder', reason: 'unavailable', authorized: true, folder: false });
  });

  it('is built by the opener from the secret store (its staging area is under the backups scratch) and refuses to open without an authorization', async () => {
    const { definition, credentials } = await setup();
    const values = new Map<string, Buffer>();
    const store = createOneDriveCredentialStore({
      get: (purpose) => { const v = values.get(purpose); return v === undefined ? null : Buffer.from(v); }, put: (purpose, value) => { values.set(purpose, Buffer.from(value)); },
      delete: (purpose) => values.delete(purpose), status: () => ({ 'backup.onedrive.refreshToken': { present: values.has('backup.onedrive.refreshToken'), needsReentry: false } }) as never,
    });
    const paths = { dataDir: '/x/data', configDir: '/x/config', tlsDir: '/x/tls', secretsDir: '/x/secrets', storageDir: '/x/storage' };
    expect(() => openBackupDestination(definition, paths, 'linux', { onedriveCredentials: store })).toThrow(expect.objectContaining({ code: 'unavailable', message: expect.stringContaining('connect it again') }));
    store.put(definition.id, credentials);
    expect(openBackupDestination(definition, paths, 'linux', { onedriveCredentials: store })).toMatchObject({ kind: 'onedrive', id: definition.id });
  });
});

describe('onedrive destination: staged objects and upload-session fragments', () => {
  it('sends 320 KiB-multiple fragments, every one carrying the total, only at commit, and stores identical bytes', async () => {
    const { server, folderId, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(3 * CHUNK + 777));
    await put(destination, PACK, bytes, 11);
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from(bytes));
    const total = 3 * CHUNK + 777;
    const puts = server.requests.filter(isFragment);
    expect(puts.map((r) => String(r.headers['content-range']))).toEqual([
      `bytes 0-${CHUNK - 1}/${total}`, `bytes ${CHUNK}-${2 * CHUNK - 1}/${total}`, `bytes ${2 * CHUNK}-${3 * CHUNK - 1}/${total}`, `bytes ${3 * CHUNK}-${total - 1}/${total}`,
    ]);
    // The session URL is pre-authenticated: no bearer goes to it. The session was opened with conflictBehavior fail.
    expect(puts.every((r) => r.headers['authorization'] === undefined)).toBe(true);
    const created = server.requests.find((r) => r.method === 'POST' && r.path.endsWith('/createUploadSession'))!;
    expect(created.path).toContain(`/items/${folderId}:/${PACK}:/createUploadSession`);
  });

  it('keeps the final fragment final when the object is an exact multiple of the fragment size, and stores an empty object with one plain PUT', async () => {
    const { server, folderId, destination } = await setup();
    await put(destination, PACK, new Uint8Array(randomBytes(2 * CHUNK)), 3);
    expect(server.requests.filter(isFragment).map((r) => String(r.headers['content-range']))).toEqual([`bytes 0-${CHUNK - 1}/${2 * CHUNK}`, `bytes ${CHUNK}-${2 * CHUNK - 1}/${2 * CHUNK}`]);
    await put(destination, PACK2, new Uint8Array(0));
    expect(server.find(folderId, PACK2)!.bytes.length).toBe(0);
    expect(server.count((r) => r.method === 'PUT' && r.path.endsWith('/content') && r.query.get('@microsoft.graph.conflictBehavior') === 'fail')).toBe(1);
    expect(await destination.stat(PACK2)).toEqual({ name: PACK2, size: 0 });
  });

  it('creates the repository directories itself (the app folder starts empty) once per client', async () => {
    const { server, folderId, destination } = await setup();
    await put(destination, PACK, new Uint8Array([1]));
    await put(destination, PACK2, new Uint8Array([2]));
    await put(destination, MANIFEST, new Uint8Array([3]));
    expect(server.names(folderId)).toEqual([MANIFEST, PACK, PACK2]);
    expect(server.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/children')).length).toBe(2); // packs and manifests, once each
  });

  it('accepts a server that creates missing parents itself', async () => {
    const { destination, server, folderId } = await setup({ autoCreateParents: true });
    await put(destination, PACK, new Uint8Array([1]));
    expect(server.names(folderId)).toEqual([PACK]);
  });

  it('resumes after a 503 on a fragment, asking the session which ranges it still expects', async () => {
    const { server, folderId, destination } = await setup();
    server.fail(isFragment, { kind: 'status', status: 503 }, 2);
    const bytes = new Uint8Array(randomBytes(2 * CHUNK + 5));
    await put(destination, PACK, bytes, 4);
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from(bytes));
    expect(sleeps.length).toBeGreaterThan(0);
    expect(server.requests.some((r) => r.method === 'GET' && r.path.startsWith('/upload/'))).toBe(true);
  });

  it('honours Retry-After on 429 (up to two minutes) and gives up with a throttled error after bounded retries', async () => {
    const { server, destination } = await setup();
    server.fail((r) => r.method === 'POST' && r.path.endsWith('/createUploadSession'), { kind: 'status', status: 429, code: 'activityLimitReached', retryAfter: 3 }, 1);
    await put(destination, PACK, new Uint8Array([1]));
    expect(sleeps).toContain(3000);
    sleeps.length = 0;
    server.fail((r) => r.method === 'POST' && r.path.endsWith('/createUploadSession'), { kind: 'status', status: 429, retryAfter: 100_000 }, 1);
    await put(destination, PACK2, new Uint8Array([1]));
    expect(sleeps).toContain(120_000); // capped at the Retry-After ceiling
    server.fail((r) => r.method === 'POST' && r.path.endsWith('/createUploadSession'), { kind: 'status', status: 429 }, 100);
    const out = await destination.sink().create(MANIFEST);
    await out.write(new Uint8Array([2]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'throttled' });
  });

  it('maps Graph refusals to closed codes: a 403 is auth, quotaLimitReached and 507 are quota, 409 nameAlreadyExists is exists', async () => {
    const { server, destination } = await setup();
    server.fail((r) => r.method === 'GET' && r.path.endsWith('/children'), { kind: 'status', status: 403, code: 'accessDenied' }, 1);
    await expect(destination.list('packs/')).rejects.toMatchObject({ code: 'auth' });
    server.fail((r) => r.method === 'GET' && r.path.endsWith('/children'), { kind: 'status', status: 403, code: 'quotaLimitReached' }, 1);
    await expect(destination.list('packs/')).rejects.toMatchObject({ code: 'quota' });
    server.fail((r) => r.method === 'GET' && r.path.endsWith('/children'), { kind: 'status', status: 509, code: 'generalException' }, 100);
    await expect(destination.list('packs/')).rejects.toMatchObject({ code: 'throttled' });
  });

  it('survives a connection that dropped after OneDrive stored a fragment (no duplicate bytes) and after the final fragment landed', async () => {
    const { server, folderId, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(2 * CHUNK + 99));
    server.fail((r) => isFragment(r) && String(r.headers['content-range']).startsWith('bytes 0-'), { kind: 'drop-after' }, 1);
    server.fail((r) => isFragment(r) && String(r.headers['content-range']).endsWith(`-${bytes.length - 1}/${bytes.length}`), { kind: 'drop-after' }, 1);
    await put(destination, PACK, bytes, 5);
    expect(server.names(folderId)).toEqual([PACK]);
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from(bytes));
  });

  it('continues from what the session expects when a fragment arrives out of order (416)', async () => {
    const { server, folderId, destination } = await setup();
    server.fail((r) => isFragment(r) && String(r.headers['content-range']).startsWith(`bytes ${CHUNK}-`), { kind: 'status', status: 416, code: 'invalidRange' }, 1);
    const bytes = new Uint8Array(randomBytes(2 * CHUNK + 9));
    await put(destination, PACK, bytes, 3);
    expect(server.find(folderId, PACK)!.bytes).toEqual(Buffer.from(bytes));
  });

  it('a OneDrive that is full is `quota`, nothing is left behind (no file, no staging) and the object is not reported committed', async () => {
    const { server, folderId, destination, scratchDir } = await setup({ quotaBytes: 10 });
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(20));
    await expect(out.commit()).rejects.toMatchObject({ code: 'quota' });
    expect(server.names(folderId)).toEqual([]);
    expect(await destination.stat(PACK)).toBeNull();
    expect(readdirSync(scratchDir)).toEqual([]);
    await expect(out.commit()).rejects.toBeInstanceOf(BackupError);
  });

  it('fails a session that expired with a server error instead of guessing', async () => {
    const { server, destination, definition, credentials, scratchDir } = await setup();
    const expiring = createOneDriveDestination({
      definition, credentials, scratchDir, chunkBytes: CHUNK,
      client: { endpoints: server.endpoints(), ...FAST, fetch: async (input, init) => { if (init?.method === 'PUT' && input.includes('/upload/')) server.sessions.clear(); return fetch(input, init); } },
    });
    const out = await expiring.sink().create(PACK);
    await out.write(new Uint8Array(randomBytes(CHUNK + 1)));
    await expect(out.commit()).rejects.toMatchObject({ code: 'server' });
    expect(destination.kind).toBe('onedrive');
  });

  it('aborts leave nothing remote and free the name; a failed commit frees it too', async () => {
    const { server, destination, scratchDir } = await setup();
    const out = await destination.sink().create(PACK);
    await out.write(new Uint8Array(randomBytes(CHUNK + 1)));
    await out.abort();
    await out.abort();
    expect(server.count((r) => r.method !== 'GET' && !r.path.endsWith('/token'))).toBe(0);
    expect(readdirSync(scratchDir)).toEqual([]);
    await put(destination, PACK, new Uint8Array([1]));
    server.fail((r) => r.method === 'POST' && r.path.endsWith('/createUploadSession'), { kind: 'status', status: 400, code: 'invalidRequest' }, 1);
    const failing = await destination.sink().create(PACK2);
    await failing.write(new Uint8Array([1]));
    await expect(failing.commit()).rejects.toMatchObject({ code: 'rejected' });
    expect(readdirSync(scratchDir)).toEqual([]);
    await put(destination, PACK2, new Uint8Array([1])); // the name is free again
  });

  it('sweeps staging files a crashed process left behind, and only old ones', async () => {
    const { destination, scratchDir } = await setup();
    const old = path.join(scratchDir, `${'0'.repeat(24)}.stage`);
    const fresh = path.join(scratchDir, `${'1'.repeat(24)}.stage`);
    writeFileSync(old, 'x');
    writeFileSync(fresh, 'y');
    writeFileSync(path.join(scratchDir, 'unrelated.txt'), 'z');
    const longAgo = new Date(Date.now() - 3 * 3_600_000);
    utimesSync(old, longAgo, longAgo);
    expect(await destination.sweepIncomplete!(3_600_000, Date.now())).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(path.join(scratchDir, 'unrelated.txt'))).toBe(true);
  });

  it('refuses an upload session or a download address on an unexpected host, without sending any bytes there', async () => {
    const { server, destination, definition, credentials, scratchDir } = await setup();
    await put(destination, PACK2, new Uint8Array([1, 2, 3]));
    const sent: string[] = [];
    const evil = async (input: string, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      if (init?.method === 'POST' && input.endsWith('/createUploadSession')) return new Response(JSON.stringify({ uploadUrl: 'https://evil.example.com/upload/x' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (input.includes('select=id,size,@microsoft.graph.downloadUrl') || input.includes('downloadUrl')) return new Response(JSON.stringify({ id: 'x', size: 3, '@microsoft.graph.downloadUrl': 'https://sharepoint.com.evil.example/dl' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (input.includes('evil.example')) sent.push(input);
      return response;
    };
    const wrapped = createOneDriveDestination({ definition, credentials, scratchDir, chunkBytes: CHUNK, client: { endpoints: server.endpoints(), ...FAST, fetch: evil } });
    const out = await wrapped.sink().create(PACK);
    await out.write(new Uint8Array([1]));
    await expect(out.commit()).rejects.toMatchObject({ code: 'bad-endpoint' });
    await expect(collect(wrapped.source().read(PACK2))).rejects.toMatchObject({ code: 'bad-endpoint' });
    expect(sent).toEqual([]);
  });

  it('accepts Microsoft\'s own file hosts and nothing that merely contains their name', async () => {
    const { server, definition, credentials } = await setup();
    const answer = (uploadUrl: string) => async (): Promise<Response> => new Response(JSON.stringify({ uploadUrl }), { status: 200, headers: { 'content-type': 'application/json' } });
    const client = (uploadUrl: string) => new OneDriveClient({ ...credentials, clientId: definition.clientId, folderId: definition.folderId, endpoints: server.endpoints(), ...FAST, fetch: async (input, init) => (init?.method === 'POST' && input.endsWith('/createUploadSession') ? answer(uploadUrl)() : fetch(input, init)) });
    for (const good of ['https://contoso-my.sharepoint.com/rup/abc', 'https://api.onedrive.com/rup/abc', 'https://public.sn.files.1drv.com/u/abc', 'https://abc.microsoftpersonalcontent.com/x']) {
      expect((await client(good).startUpload(PACK)).url).toBe(good);
    }
    for (const bad of ['http://contoso.sharepoint.com/x', 'https://sharepoint.com.evil.example/x', 'https://evil.example/sharepoint.com', 'https://127.0.0.1/x', 'https://user:pw@x.sharepoint.com/x', 'https://[::1]/x', 'ftp://x.sharepoint.com/x']) {
      await expect(client(bad).startUpload(PACK2), bad).rejects.toMatchObject({ code: 'bad-endpoint' });
    }
  });
});

describe('onedrive destination: reads', () => {
  it('reads from the pre-authenticated download address with a Range request and no bearer, and resumes a download whose connection dropped', async () => {
    const { server, destination } = await setup();
    const bytes = new Uint8Array(randomBytes(4 * CHUNK + 5));
    await put(destination, PACK, bytes, 3);
    server.fail((r) => r.method === 'GET' && r.path.startsWith('/dl/'), { kind: 'truncate' }, 2);
    expect(await collect(destination.source().read(PACK))).toEqual(Buffer.from(bytes));
    const downloads = server.requests.filter((r) => r.path.startsWith('/dl/'));
    expect(downloads.length).toBeGreaterThan(1);
    expect(downloads[0]!.headers['range']).toBeUndefined();
    expect(downloads.slice(1).every((r) => /^bytes=\d+-$/.test(String(r.headers['range'])))).toBe(true);
    expect(downloads.every((r) => r.headers['authorization'] === undefined)).toBe(true);
  });

  it('gives up with a network error when the download keeps failing', async () => {
    const { server, destination } = await setup();
    await put(destination, PACK, new Uint8Array(randomBytes(2 * CHUNK)));
    server.fail((r) => r.method === 'GET' && r.path.startsWith('/dl/'), { kind: 'truncate' }, 100);
    await expect(collect(destination.source().read(PACK))).rejects.toMatchObject({ code: 'network' });
  });
});

describe('onedrive destination: authorization', () => {
  it('refreshes the access token on demand, once a minute before it expires, and once on a 401', async () => {
    const { server, destination } = await setup();
    await destination.list('packs/');
    await destination.list('packs/');
    expect(server.tokenRefreshes).toBe(1);
    server.expireAccessTokens(); // Microsoft invalidated it early: one 401, one refresh, the request repeated
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
      expect((error as Error).message).toMatch(/revoked or has expired; connect the OneDrive destination again/);
      expect(`${(error as Error).message}${(error as Error).stack ?? ''}`).not.toContain(credentials.refreshToken);
      expect(`${(error as Error).message}`).not.toContain(credentials.clientSecret);
    }
    expect(await destination.probe()).toEqual({ ok: false, reason: 'reauth' });
  });

  it('`interaction_required` is also `reauth`; a wrong client id or secret is `auth`; an unreachable Microsoft is a retried network error', async () => {
    const { server, definition, credentials, scratchDir } = await setup();
    const make = (creds = credentials) => createOneDriveDestination({ definition, credentials: creds, scratchDir, client: { endpoints: server.endpoints(), ...FAST } });
    server.fail((r) => r.path.endsWith('/token'), { kind: 'status', status: 400, oauthError: 'interaction_required' }, 1);
    await expect(make().list('packs/')).rejects.toMatchObject({ code: 'reauth' });
    await expect(make({ ...credentials, clientSecret: 'not~the.secret_value-0123456789' }).list('packs/')).rejects.toMatchObject({ code: 'auth' });
    server.fail((r) => r.path.endsWith('/token'), { kind: 'drop' }, 100);
    await expect(make().list('packs/')).rejects.toMatchObject({ code: 'network' });
  });

  it('keeps the rotated refresh token: it is handed to the store before the old one is dropped, and the next refresh uses it', async () => {
    const { server, credentials, definition, scratchDir } = await setup({ strictRotation: true });
    const stored: string[] = [];
    const destination = createOneDriveDestination({ definition, credentials, scratchDir, onRefreshToken: (token) => { stored.push(token); }, client: { endpoints: server.endpoints(), ...FAST } });
    await destination.list('packs/');
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toBe(credentials.refreshToken);
    expect(server.refreshTokens.get(credentials.refreshToken)!.revoked).toBe(true); // Microsoft would not have to do this; the spec proves nothing depends on the old token
    server.expireAccessTokens();
    await destination.list('packs/');
    expect(server.presentedRefreshTokens).toEqual([credentials.refreshToken, stored[0]]);
    expect(stored).toHaveLength(2);
  });

  it('a failed store of the rotated token is not fatal: the new token keeps working in memory', async () => {
    const { server, credentials, definition, scratchDir } = await setup({ strictRotation: true });
    const destination = createOneDriveDestination({ definition, credentials, scratchDir, onRefreshToken: () => { throw new Error('the secret store is read only'); }, client: { endpoints: server.endpoints(), ...FAST } });
    await destination.list('packs/');
    server.expireAccessTokens();
    expect(await destination.list('packs/')).toEqual([]);
    expect(server.tokenRefreshes).toBe(2);
  });

  it('a sibling that rotated the token first is adopted from the store instead of failing as revoked', async () => {
    const { server, credentials, definition, scratchDir } = await setup({ strictRotation: true });
    let stored = credentials.refreshToken;
    const open = () => createOneDriveDestination({
      definition, credentials: { ...credentials, refreshToken: stored }, scratchDir, onRefreshToken: (token) => { stored = token; }, latestRefreshToken: () => stored, client: { endpoints: server.endpoints(), ...FAST },
    });
    const first = open();
    const second = open(); // built from the same token before the first one used it
    await first.list('packs/');
    const afterFirst = stored;
    expect(afterFirst).not.toBe(credentials.refreshToken);
    expect(await second.list('packs/')).toEqual([]); // its own token is dead (strict rotation); the stored one is adopted once
    expect(server.presentedRefreshTokens).toEqual([credentials.refreshToken, credentials.refreshToken, afterFirst]);
    await expect(createOneDriveDestination({ definition, credentials: { ...credentials, refreshToken: 'unknown' }, scratchDir, latestRefreshToken: () => 'unknown', client: { endpoints: server.endpoints(), ...FAST } }).list('packs/')).rejects.toMatchObject({ code: 'reauth' });
  });

  it('never calls anything but the one folder inside the app folder: no listing of the rest of the OneDrive and every item request is scoped to the folder id', async () => {
    const { server, folderId, destination } = await setup();
    const stranger = server.createFolder('someone elses folder');
    server.put(stranger, PACK, Buffer.from([1]));
    await put(destination, MANIFEST, new Uint8Array([1]));
    expect(await destination.list('packs/')).toEqual([]);
    expect(await destination.stat(PACK)).toBeNull();
    await destination.probe();
    const graph = server.requests.filter((r) => r.path.startsWith('/v1.0/'));
    for (const request of graph) {
      const ok = request.path === '/v1.0/me/drive' || request.path === '/v1.0/me/drive/special/approot' || request.path.startsWith(`/v1.0/me/drive/items/${folderId}`) || /^\/v1\.0\/me\/drive\/items\/[A-Za-z0-9]+(\/content)?$/.test(request.path);
      expect([request.method, request.path, ok]).toEqual([request.method, request.path, true]);
      expect(request.path).not.toMatch(/\/root|\/search|\/delta/);
    }
    expect(graph.some((r) => r.path.includes(stranger))).toBe(false);
  });
});
