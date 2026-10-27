import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { uploadFileResumable, bytesSource, UploadAbandonedError } from '@dude/api-client';
import { UPLOAD_BODY_LIMIT, UPLOAD_CHUNK_SIZE_DEFAULT, UploadChunkResponse, UploadCompleteResponse, UploadSession } from '@dude/contracts/hub';
import { blobRefCount, getBlobRow } from '../blobs/registry.js';
import { attachUploadBlob, UploadAttachError } from '../uploads/attach.js';
import { MIB, deviceBearerFor, sha256Hex, startUploadHub } from './uploads-test-helpers.js';
import type { UploadHub } from './uploads-test-helpers.js';

/**
 * The resumable upload route family (32-SS1, Milestone 845, PD-118, PD-148) against the real Hub over a real savesphere.db, blob store and
 * chunk directory. The credential-matrix, streaming, crash-injection and guard cases the milestone names live here.
 */
const open: UploadHub[] = [];
const start = async (options: Parameters<typeof startUploadHub>[0] = {}): Promise<UploadHub> => {
  const hub = await startUploadHub(options);
  open.push(hub);
  return hub;
};
afterEach(async () => {
  while (open.length > 0) await open.pop()!.close();
});

const small = { chunkSize: MIB };
const hashAsync = async (bytes: Uint8Array): Promise<string> => sha256Hex(bytes);
const createOk = async (hub: UploadHub, size: number, extra: Record<string, unknown> = {}) => {
  const res = await hub.create({ size, ...small, ...extra });
  expect(res.status, res.raw.body).toBe(201);
  return res.json as UploadSession;
};
const chunkOf = (bytes: Uint8Array, index: number, chunkSize = MIB): Uint8Array => bytes.subarray(index * chunkSize, Math.min(bytes.length, (index + 1) * chunkSize));

describe('uploads: the full flow', () => {
  it('uploads 40 MiB as five default 8 MiB chunks, assembles them into the blob store and references the blob as the upload', async () => {
    const hub = await start();
    const payload = randomBytes(40 * MIB);
    const sha = sha256Hex(payload);
    const created = await hub.create({ size: payload.length, sha256: sha, mime: 'Application/OCTET-STREAM; charset=x', name: '..\\evil/‮txt\u0000.bin' });
    expect(created.status).toBe(201);
    const session = created.json as UploadSession;
    expect(Value.Check(UploadSession, session)).toBe(true);
    expect(session).toMatchObject({ state: 'open', size: payload.length, chunkSize: UPLOAD_CHUNK_SIZE_DEFAULT, chunkCount: 5, received: [], mime: 'application/octet-stream', name: 'txt.bin', sha256: sha });
    expect(hub.auditEvents()).toEqual(['upload.created']);

    for (let i = 0; i < 5; i += 1) {
      const res = await hub.put(session.uploadId, i, chunkOf(payload, i, UPLOAD_CHUNK_SIZE_DEFAULT));
      expect(res.status, res.body).toBe(200);
      const body = JSON.parse(res.body) as unknown;
      expect(Value.Check(UploadChunkResponse, body)).toBe(true);
      expect(body).toMatchObject({ index: i, duplicate: false, receivedChunks: i + 1 });
    }
    expect((await hub.status(session.uploadId)).json).toMatchObject({ state: 'open', received: [[0, 4]], receivedChunks: 5, receivedBytes: payload.length });
    expect(hub.chunkFiles(session.uploadId).filter((f) => f.endsWith('.part'))).toHaveLength(5);

    const done = await hub.complete(session.uploadId);
    expect(done.status, done.raw.body).toBe(200);
    expect(Value.Check(UploadCompleteResponse, done.json)).toBe(true);
    expect(done.json).toMatchObject({ state: 'complete', sha256: sha, size: payload.length, blobRef: `upload:${session.uploadId}` });

    // The blob is stored once, byte-exact, catalogued, and referenced by the upload so garbage collection keeps it until something attaches it.
    expect(await hub.blobs.has(sha)).toBe(true);
    expect(await hub.blobs.verify(sha)).toBe('ok');
    expect(getBlobRow(hub.sdb.db, sha)).toMatchObject({ size: payload.length, state: 'ok', unreferencedSince: null });
    expect(hub.rows('SELECT owner_kind, owner_id FROM blob_refs')).toEqual([{ owner_kind: 'upload', owner_id: session.uploadId }]);
    expect(hub.chunkFiles(session.uploadId)).toEqual([]);
    expect(hub.rows('SELECT COUNT(*) AS n FROM upload_chunks')).toEqual([{ n: 0 }]);
    expect(hub.auditEvents()).toEqual(['upload.created', 'upload.completed']);
    // The audit trail carries no file name and no bytes.
    const details = hub.hub.hub.db.prepare("SELECT detail_json FROM audit_events WHERE event LIKE 'upload.%'").all() as Array<{ detail_json: string }>;
    for (const row of details) expect(row.detail_json).not.toMatch(/txt\.bin|evil/);

    // Complete is idempotent: the same answer, no second blob, no second audit event.
    const again = await hub.complete(session.uploadId);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ sha256: sha, blobRef: `upload:${session.uploadId}` });
    expect(hub.auditEvents()).toEqual(['upload.created', 'upload.completed']);
    expect((await hub.status(session.uploadId)).json).toMatchObject({ state: 'complete', received: [], blob: { sha256: sha, size: payload.length } });
  }, 60_000);

  it('uploadFileResumable negotiates, sends, resumes from the status and completes through the typed client', async () => {
    const hub = await start();
    const payload = randomBytes(5 * MIB + 123);
    const client = hub.client();
    // A first run that is interrupted after two chunks (the session id is what a real client would persist).
    let sessionId = '';
    let sent = 0;
    await expect(uploadFileResumable({ ...client, putUploadChunk: async (...args) => {
      if (sent === 2) throw new UploadAbandonedError('open', 'simulated app exit');
      sent += 1;
      return client.putUploadChunk(...args);
    } }, bytesSource(payload), { sha256Hex: hashAsync, chunkSize: MIB, name: 'a.bin', onSession: (s) => { sessionId = s.uploadId; }, maxAttempts: 1 })).rejects.toThrow('simulated app exit');
    expect((await hub.status(sessionId)).json).toMatchObject({ state: 'open', received: [[0, 1]] });

    const puts: number[] = [];
    const result = await uploadFileResumable({ ...client, putUploadChunk: async (a, id, index, bytes, o) => { puts.push(index); return client.putUploadChunk(a, id, index, bytes, o); } },
      bytesSource(payload), { uploadId: sessionId, sha256: sha256Hex(payload), sha256Hex: hashAsync });
    expect(puts).toEqual([2, 3, 4, 5]); // only what was missing
    expect(result).toMatchObject({ sha256: sha256Hex(payload), size: payload.length, uploadId: sessionId });
    expect(await hub.blobs.has(result.sha256)).toBe(true);
  }, 60_000);
});

describe('uploads: chunk rules', () => {
  it('is idempotent by index: an identical re-PUT is a 200 no-op, a different chunk for the same index is 409, nothing is overwritten', async () => {
    const hub = await start();
    const payload = randomBytes(3 * MIB);
    const s = await createOk(hub, payload.length);
    const first = await hub.put(s.uploadId, 1, chunkOf(payload, 1));
    expect(JSON.parse(first.body)).toMatchObject({ duplicate: false });
    const again = await hub.put(s.uploadId, 1, chunkOf(payload, 1));
    expect(again.status).toBe(200);
    expect(JSON.parse(again.body)).toMatchObject({ duplicate: true, receivedChunks: 1 });
    const other = await hub.put(s.uploadId, 1, randomBytes(MIB));
    expect(other.status).toBe(409);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ received: [[1, 1]] });
    await hub.put(s.uploadId, 0, chunkOf(payload, 0));
    await hub.put(s.uploadId, 2, chunkOf(payload, 2));
    const done = await hub.complete(s.uploadId);
    expect(done.json.sha256).toBe(sha256Hex(payload)); // the original chunk 1 survived the conflicting attempt
  });

  it('accepts chunks in any order and sums them back in index order', async () => {
    const hub = await start();
    const payload = randomBytes(4 * MIB - 17);
    const s = await createOk(hub, payload.length);
    for (const i of [3, 0, 2, 1]) expect((await hub.put(s.uploadId, i, chunkOf(payload, i))).status).toBe(200);
    expect((await hub.status(s.uploadId)).json.received).toEqual([[0, 3]]);
    expect((await hub.complete(s.uploadId)).json.sha256).toBe(sha256Hex(payload));
  });

  it('rejects a wrong chunk hash, a wrong length, an out-of-range index and an invalid hash header, writing nothing', async () => {
    const hub = await start();
    const payload = randomBytes(2 * MIB + 5);
    const s = await createOk(hub, payload.length);
    const bad = await hub.put(s.uploadId, 0, chunkOf(payload, 0), { headers: { 'x-chunk-sha256': 'f'.repeat(64) } });
    expect(bad.status).toBe(400);
    expect((await hub.put(s.uploadId, 0, chunkOf(payload, 0), { headers: { 'x-chunk-sha256': 'NOTHEX' } })).status).toBe(400);
    expect((await hub.put(s.uploadId, 2, randomBytes(6))).status).toBe(400); // last chunk must be exactly 5 bytes
    expect((await hub.put(s.uploadId, 0, randomBytes(MIB - 1))).status).toBe(400); // a middle chunk must be the full chunk size
    expect((await hub.put(s.uploadId, 3, randomBytes(5))).status).toBe(400); // out of range
    expect((await hub.status(s.uploadId)).json).toMatchObject({ received: [], receivedChunks: 0 });
    expect(hub.chunkFiles(s.uploadId).filter((f) => f.endsWith('.part'))).toEqual([]);
    expect(hub.chunkFiles(s.uploadId).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    // Completing with chunks missing is a conflict that names the count.
    const early = await hub.complete(s.uploadId);
    expect(early.status).toBe(409);
    expect(early.json.error.message).toContain('3 of 3');
  });

  it('refuses an oversize chunk with 413 BEFORE reading the body (a cut-off, not a buffer), and chunked transfer with 411', async () => {
    const hub = await start({ });
    const s = await createOk(hub, 20 * MIB, { chunkSize: undefined });
    const bytes = randomBytes(64 * 1024);
    const startedAt = Date.now();
    // Declares 9 MiB against an 8 MiB session, sends 64 KiB and then keeps the request OPEN: the answer must come without the rest of the body.
    const over = await hub.put(s.uploadId, 0, bytes, { contentLength: 9 * MIB, sendBytes: bytes.length, noHash: true });
    expect(over.status).toBe(413);
    expect(over.headers['connection']).toBe('close');
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    // Larger than any session could accept: refused outright.
    const huge = await hub.put(s.uploadId, 0, bytes, { contentLength: UPLOAD_BODY_LIMIT + 1, sendBytes: bytes.length, noHash: true });
    expect(huge.status).toBe(413);
    const chunked = await hub.put(s.uploadId, 0, bytes, { chunked: true, noHash: true });
    expect(chunked.status, chunked.body).toBe(411);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ receivedChunks: 0 });
    // The 64 KiB JSON limit is untouched elsewhere.
    const tooBig = await hub.create({ size: 1, name: 'x'.repeat(70 * 1024) });
    expect([400, 413]).toContain(tooBig.status);
  });

  it('keeps the octet-stream content type to the chunk route (every other route still wants JSON)', async () => {
    const hub = await start();
    const res = await new Promise<number>((resolve, reject) => {
      const req = https.request({
        host: '127.0.0.1', port: hub.hub.port, path: '/api/v1/uploads', method: 'POST', ca: hub.hub.tls.certPem, servername: 'localhost',
        headers: { 'content-type': 'application/octet-stream', 'content-length': '3', cookie: `__Host-dude_session=${hub.owner.cookie}`, 'x-dude-csrf': hub.owner.csrf, origin: `https://localhost:${hub.hub.port}`, host: `localhost:${hub.hub.port}` },
      }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode ?? 0)); });
      req.on('error', reject);
      req.end('abc');
    });
    expect(res).toBe(415);
  });

  it('drops a connection cut mid-chunk: the partial chunk is discarded and a re-PUT succeeds', async () => {
    const hub = await start();
    const payload = randomBytes(2 * MIB);
    const s = await createOk(hub, payload.length);
    await hub.put(s.uploadId, 0, chunkOf(payload, 0), { sendBytes: 300_000, destroyAfter: true, noHash: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await hub.status(s.uploadId)).json).toMatchObject({ received: [], receivedChunks: 0 });
    expect(hub.chunkFiles(s.uploadId)).toEqual([]); // no .tmp and no .part is left behind
    expect((await hub.put(s.uploadId, 0, chunkOf(payload, 0))).status).toBe(200);
    expect((await hub.put(s.uploadId, 1, chunkOf(payload, 1))).status).toBe(200);
    expect((await hub.complete(s.uploadId)).json.sha256).toBe(sha256Hex(payload));
  });
});

describe('uploads: completion', () => {
  it('a wrong declared SHA-256 fails the session and keeps no blob and no chunk', async () => {
    const hub = await start();
    const payload = randomBytes(2 * MIB);
    const s = await createOk(hub, payload.length, { sha256: sha256Hex(randomBytes(8)) });
    for (let i = 0; i < 2; i += 1) await hub.put(s.uploadId, i, chunkOf(payload, i));
    const done = await hub.complete(s.uploadId);
    expect(done.status).toBe(409);
    expect(await hub.blobs.list()).toEqual([]);
    expect(hub.rows('SELECT COUNT(*) AS n FROM blobs')).toEqual([{ n: 0 }]);
    expect(hub.rows('SELECT COUNT(*) AS n FROM blob_refs')).toEqual([{ n: 0 }]);
    expect(hub.chunkFiles(s.uploadId)).toEqual([]);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ state: 'failed', failure: 'sha256-mismatch', blob: null });
    expect(hub.auditEvents()).toEqual(['upload.created', 'upload.failed']);
    expect((await hub.complete(s.uploadId)).status).toBe(409); // final: a failed session never completes
    expect((await hub.put(s.uploadId, 0, chunkOf(payload, 0))).status).toBe(409);
  });

  it('answers 202 while a long assembly runs, then 200 with the same result (the assembly outlives the request)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hub = await start({ limits: { completeWaitMs: 50 }, hooks: { beforeAssemble: () => gate } });
    const payload = randomBytes(MIB + 9);
    const s = await createOk(hub, payload.length);
    for (let i = 0; i < 2; i += 1) await hub.put(s.uploadId, i, chunkOf(payload, i));
    const pending = await hub.complete(s.uploadId);
    expect(pending.status).toBe(202);
    expect(pending.json).toMatchObject({ state: 'completing' });
    expect((await hub.abort(s.uploadId)).status).toBe(409); // not while assembling
    release();
    let done = await hub.complete(s.uploadId);
    for (let i = 0; i < 50 && done.status === 202; i += 1) { await new Promise((r) => setTimeout(r, 50)); done = await hub.complete(s.uploadId); }
    expect(done.status).toBe(200);
    expect(done.json.sha256).toBe(sha256Hex(payload));
    expect(hub.auditEvents()).toEqual(['upload.created', 'upload.completed']);
  });

  it('survives a crash between the chunk file and its row (the retry overwrites it, no orphan is counted) and a crash mid-assembly', async () => {
    let crash = true;
    const hub = await start({ hooks: { afterChunkRename: () => { if (crash) { crash = false; throw new Error('simulated kill'); } } } });
    const payload = randomBytes(2 * MIB);
    const s = await createOk(hub, payload.length);
    const killed = await hub.put(s.uploadId, 0, chunkOf(payload, 0));
    expect(killed.status).toBe(500);
    // The file is on disk but no row names it: not received, and not counted.
    expect(hub.chunkFiles(s.uploadId)).toEqual(['0.part']);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ received: [], receivedChunks: 0, receivedBytes: 0 });
    expect((await hub.put(s.uploadId, 0, chunkOf(payload, 0))).status).toBe(200);
    await hub.put(s.uploadId, 1, chunkOf(payload, 1));
    expect((await hub.status(s.uploadId)).json).toMatchObject({ received: [[0, 1]], receivedChunks: 2 });

    // A Hub killed while `completing` restarts with the session open and every chunk still in place.
    hub.sdb.db.prepare("UPDATE uploads SET state = 'completing' WHERE id = ?").run(s.uploadId);
    hub.restartService();
    expect((await hub.status(s.uploadId)).json).toMatchObject({ state: 'open', receivedChunks: 2 });
    expect((await hub.complete(s.uploadId)).json.sha256).toBe(sha256Hex(payload));
  });

  it('a chunk that vanished or rotted on disk is dropped from the received set so the client can re-send just that one', async () => {
    const hub = await start();
    const payload = randomBytes(3 * MIB);
    const s = await createOk(hub, payload.length);
    for (let i = 0; i < 3; i += 1) await hub.put(s.uploadId, i, chunkOf(payload, i));
    const { writeFileSync, rmSync } = await import('node:fs');
    rmSync(path.join(hub.uploadsDir, s.uploadId, '1.part'));
    writeFileSync(path.join(hub.uploadsDir, s.uploadId, '2.part'), randomBytes(MIB)); // right size, wrong bytes
    const first = await hub.complete(s.uploadId);
    expect(first.status).toBe(409);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ state: 'open', received: [[0, 0], [2, 2]] });
    await hub.put(s.uploadId, 1, chunkOf(payload, 1));
    const second = await hub.complete(s.uploadId);
    expect(second.status).toBe(409); // chunk 2 has the right size and the wrong bytes
    expect((await hub.status(s.uploadId)).json).toMatchObject({ state: 'open', received: [[0, 1]] });
    expect(await hub.blobs.list()).toEqual([]);
    await hub.put(s.uploadId, 2, chunkOf(payload, 2));
    expect((await hub.complete(s.uploadId)).json.sha256).toBe(sha256Hex(payload));
  });

  it('the typed client repairs a lost chunk on its own', async () => {
    const hub = await start();
    const payload = randomBytes(3 * MIB);
    const client = hub.client();
    let removed = false;
    const result = await uploadFileResumable({
      ...client,
      completeUpload: async (a, id) => {
        if (!removed) {
          removed = true;
          const { rmSync } = await import('node:fs');
          rmSync(path.join(hub.uploadsDir, id, '1.part'));
        }
        return client.completeUpload(a, id);
      },
    }, bytesSource(payload), { chunkSize: MIB, sleep: async () => undefined, sha256Hex: hashAsync });
    expect(result.sha256).toBe(sha256Hex(payload));
  });
});

describe('uploads: guards', () => {
  it('refuses a session, a chunk and a completion when the free-disk guard says no (507 storage-full), keeping the session', async () => {
    const hub = await start({ minFreeBytes: 100 * MIB });
    hub.volume.current = { freeBytes: 120 * MIB, totalBytes: 1000 * MIB };
    const tooBig = await hub.create({ size: 50 * MIB });
    expect(tooBig.status).toBe(507);
    expect(tooBig.json.error.code).toBe('storage-full');
    expect(hub.rows('SELECT COUNT(*) AS n FROM uploads')).toEqual([{ n: 0 }]);
    const s = await createOk(hub, 4 * MIB);
    const payload = randomBytes(4 * MIB);
    expect((await hub.put(s.uploadId, 0, chunkOf(payload, 0))).status).toBe(200);
    hub.volume.current = { freeBytes: 100 * MIB + MIB / 2, totalBytes: 1000 * MIB }; // less than the reserve plus one chunk
    const refused = await hub.put(s.uploadId, 1, chunkOf(payload, 1));
    expect(refused.status).toBe(507);
    expect(JSON.parse(refused.body).error.code).toBe('storage-full');
    expect(hub.chunkFiles(s.uploadId).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    hub.volume.current = { freeBytes: 500 * MIB, totalBytes: 1000 * MIB };
    for (const i of [1, 2, 3]) expect((await hub.put(s.uploadId, i, chunkOf(payload, i))).status).toBe(200);
    hub.volume.current = { freeBytes: 100 * MIB + MIB, totalBytes: 1000 * MIB }; // the assembly needs the file's size again
    expect((await hub.complete(s.uploadId)).status).toBe(507);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ state: 'open', receivedChunks: 4 });
    hub.volume.current = { freeBytes: 500 * MIB, totalBytes: 1000 * MIB };
    expect((await hub.complete(s.uploadId)).json.sha256).toBe(sha256Hex(payload));
  });

  it('treats a volume it cannot measure as no guard (a real ENOSPC still maps to 507 in the service)', async () => {
    const hub = await start({ volume: null });
    expect((await hub.create({ size: MIB })).status).toBe(201);
  });

  it('caps concurrent sessions per owner and the declared bytes in flight, and reserves what open sessions still owe', async () => {
    const hub = await start({ limits: { maxSessionsPerPrincipal: 3, maxInflightBytes: 10 * MIB } });
    const a = await createOk(hub, 4 * MIB);
    await createOk(hub, 4 * MIB);
    const over = await hub.create({ size: 4 * MIB, ...small });
    expect(over.status).toBe(409); // 12 MiB declared > 10 MiB in flight
    // What already arrived is no longer owed.
    const payload = randomBytes(4 * MIB);
    for (let i = 0; i < 4; i += 1) await hub.put(a.uploadId, i, chunkOf(payload, i));
    expect((await hub.create({ size: 4 * MIB, ...small })).status).toBe(201);
    const fourth = await hub.create({ size: 1 });
    expect(fourth.status).toBe(409); // three sessions are active
    expect(fourth.json.error.message).toContain('at most 3');
    await hub.abort(a.uploadId);
    expect((await hub.create({ size: 1 })).status).toBe(201);
  });

  it('rejects an absurd declared size and malformed metadata', async () => {
    const hub = await start();
    expect((await hub.create({ size: 2 ** 40 + 1 })).status).toBe(400);
    expect((await hub.create({ size: 0 })).status).toBe(400);
    expect((await hub.create({ size: 1, sha256: 'ABC' })).status).toBe(400);
    expect((await hub.create({ size: 1, mime: 'not a type' })).status).toBe(400);
    expect((await hub.create({ size: 1, extra: true })).status).toBe(400);
    const s = (await hub.create({ size: 1, chunkSize: 1 })).json as UploadSession;
    expect(s.chunkSize).toBe(MIB); // negotiated up to the minimum
    const t = (await hub.create({ size: 1, chunkSize: 2 ** 31 })).json as UploadSession;
    expect(t.chunkSize).toBe(32 * MIB); // and down to the maximum
  });
});

describe('uploads: expiry, abort and attach', () => {
  it('expires idle sessions: chunk files go, references are released, blobs stay for the collector, attached blobs are untouched, a restored orphan reference is released', async () => {
    const hub = await start({ limits: { ttlMs: 60_000, retentionMs: 10 * 60_000 } });
    const idle = await createOk(hub, 2 * MIB);
    await hub.put(idle.uploadId, 0, randomBytes(MIB));
    const live = await createOk(hub, 2 * MIB);

    const finished = await createOk(hub, MIB);
    const finishedBytes = randomBytes(MIB);
    await hub.put(finished.uploadId, 0, finishedBytes);
    const doneFinished = (await hub.complete(finished.uploadId)).json;

    const adopted = await createOk(hub, MIB);
    const adoptedBytes = randomBytes(MIB);
    await hub.put(adopted.uploadId, 0, adoptedBytes);
    const doneAdopted = (await hub.complete(adopted.uploadId)).json;
    attachUploadBlob(hub.sdb.db, adopted.uploadId, 'attachment', 'item-1', hub.clock.t);

    // Another Hub's reference for a session that is gone (what a restore leaves: `blob_refs` kept, `uploads` scrubbed).
    const ghost = await hub.blobs.put(randomBytes(64));
    hub.sdb.db.prepare("INSERT INTO blobs(sha256, size, created_at, state) VALUES(?, 64, '2026-03-01T00:00:00.000Z', 'ok')").run(ghost.sha256);
    hub.sdb.db.prepare("INSERT INTO blob_refs(blob_sha256, owner_kind, owner_id, created_at) VALUES(?, 'upload', 'no-such-session', '2026-03-01T00:00:00.000Z')").run(ghost.sha256);

    hub.clock.t += 30_000;
    await hub.put(live.uploadId, 0, randomBytes(MIB)); // activity moves its expiry
    hub.clock.t += 40_000; // idle is now 70 s old, finished 70 s old, live 40 s old
    const result = await hub.service.expire();
    expect(result).toMatchObject({ expired: 2, releasedRefs: 2 }); // idle and finished expire; finished's reference and the ghost reference are released
    expect(hub.chunkFiles(idle.uploadId)).toEqual([]);
    expect((await hub.status(idle.uploadId)).json).toMatchObject({ state: 'expired', receivedChunks: 0 });
    expect((await hub.status(live.uploadId)).json).toMatchObject({ state: 'open', receivedChunks: 1 });
    expect((await hub.status(finished.uploadId)).json).toMatchObject({ state: 'expired', blob: null });
    expect((await hub.status(adopted.uploadId)).json).toMatchObject({ state: 'complete' });
    expect(blobRefCount(hub.sdb.db, doneFinished.sha256)).toBe(0);
    expect(getBlobRow(hub.sdb.db, doneFinished.sha256)?.unreferencedSince).not.toBeNull(); // the grace period starts; the bytes wait for the two-step collector
    expect(await hub.blobs.has(doneFinished.sha256)).toBe(true);
    expect(hub.rows('SELECT owner_kind, owner_id FROM blob_refs WHERE blob_sha256 = ?', doneAdopted.sha256)).toEqual([{ owner_kind: 'attachment', owner_id: 'item-1' }]);
    expect(blobRefCount(hub.sdb.db, ghost.sha256)).toBe(0);
    expect(hub.auditEvents()).toContain('upload.expired');
    expect((await hub.put(idle.uploadId, 1, randomBytes(MIB))).status).toBe(409);
    expect((await hub.complete(finished.uploadId)).status).toBe(409);

    // Final rows are pruned after the retention window; an immediate second run does nothing.
    expect(await hub.service.expire()).toMatchObject({ expired: 0, pruned: 0 });
    hub.clock.t += 11 * 60_000;
    const later = await hub.service.expire();
    expect(later.pruned).toBeGreaterThanOrEqual(2);
    expect((await hub.status(idle.uploadId)).status).toBe(404);
  });

  it('sweeps chunk directories that no live session owns, after a grace period', async () => {
    const hub = await start();
    const s = await createOk(hub, MIB);
    await hub.put(s.uploadId, 0, randomBytes(MIB));
    const { mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
    const orphan = path.join(hub.uploadsDir, '11111111-1111-4111-8111-111111111111');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(path.join(orphan, '0.part'), 'x');
    const old = new Date('2000-01-01T00:00:00.000Z');
    utimesSync(orphan, old, old);
    await hub.service.expire();
    expect(existsSync(orphan)).toBe(false);
    expect(hub.chunkFiles(s.uploadId)).toEqual(['0.part']); // a live session's directory is never touched
  });

  it('abort is one audited step that removes only the session: an open upload loses its staged chunks, a finished one loses ITS reference but never the blob', async () => {
    const hub = await start();
    const bytes = randomBytes(MIB);
    const s = await createOk(hub, MIB);
    await hub.put(s.uploadId, 0, bytes);
    expect((await hub.abort(s.uploadId)).status).toBe(200);
    expect(hub.chunkFiles(s.uploadId)).toEqual([]);
    expect((await hub.status(s.uploadId)).json).toMatchObject({ state: 'aborted' });
    expect((await hub.abort(s.uploadId)).status).toBe(200); // idempotent, not audited twice
    expect(hub.auditEvents()).toEqual(['upload.created', 'upload.aborted']);

    const done = await createOk(hub, MIB);
    await hub.put(done.uploadId, 0, bytes);
    const finished = (await hub.complete(done.uploadId)).json;
    // Someone else already references the same bytes: abort must not disturb that.
    hub.sdb.db.prepare("INSERT INTO blob_refs(blob_sha256, owner_kind, owner_id, created_at) VALUES(?, 'attachment', 'keep', '2026-03-01T00:00:00.000Z')").run(finished.sha256);
    expect((await hub.abort(done.uploadId)).status).toBe(200);
    expect(hub.rows('SELECT owner_kind, owner_id FROM blob_refs')).toEqual([{ owner_kind: 'attachment', owner_id: 'keep' }]);
    expect(await hub.blobs.verify(finished.sha256)).toBe('ok');
    expect((await hub.abort('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await hub.abort('../../etc')).status).toBe(404);
  });

  it('attachUploadBlob swaps the upload reference for the caller\'s own in one step and refuses what is not a completed upload', async () => {
    const hub = await start({ limits: { ttlMs: 60_000 } });
    const bytes = randomBytes(MIB);
    const s = await createOk(hub, MIB);
    expect(() => attachUploadBlob(hub.sdb.db, s.uploadId, 'attachment', 'a', hub.clock.t)).toThrow(UploadAttachError); // still open
    await hub.put(s.uploadId, 0, bytes);
    const done = (await hub.complete(s.uploadId)).json;
    expect(attachUploadBlob(hub.sdb.db, s.uploadId, 'attachment', 'a', hub.clock.t, { kind: 'owner', id: hub.ownerId })).toEqual({ sha256: done.sha256, size: MIB });
    expect(() => attachUploadBlob(hub.sdb.db, s.uploadId, 'attachment', 'a', hub.clock.t, { kind: 'owner', id: 'someone-else' })).toThrow(UploadAttachError);
    expect(() => attachUploadBlob(hub.sdb.db, 'nope', 'attachment', 'a', hub.clock.t)).toThrow(UploadAttachError);
    expect(hub.rows('SELECT owner_kind, owner_id FROM blob_refs')).toEqual([{ owner_kind: 'attachment', owner_id: 'a' }]);
    hub.clock.t += 120_000;
    await hub.service.expire();
    expect(blobRefCount(hub.sdb.db, done.sha256)).toBe(1); // an attached upload never expires its blob away
    expect((await hub.abort(s.uploadId)).status).toBe(200);
    expect(blobRefCount(hub.sdb.db, done.sha256)).toBe(1);
  });
});

describe('uploads: credentials', () => {
  it('is owner-only: anonymous 401, an ingest token 401, a device token 403, the owner bearer and cookie work, another principal cannot see a session', async () => {
    const hub = await start();
    const s = await createOk(hub, MIB);
    const id = s.uploadId;
    const bytes = randomBytes(MIB);
    const anonymous = async (method: string, p: string) => hub.call(method, p, { noOrigin: true, ...(method === 'POST' && p === '/uploads' ? { body: { size: 1 } } : {}) });
    for (const [method, p] of [['POST', '/uploads'], ['GET', `/uploads/${id}`], ['POST', `/uploads/${id}/complete`], ['DELETE', `/uploads/${id}`]] as const) {
      expect((await anonymous(method, p)).status, `${method} ${p}`).toBe(401);
    }
    expect((await hub.put(id, 0, bytes, { who: null })).status).toBe(401);
    const ingest = `dit_${'A'.repeat(43)}`;
    expect((await hub.put(id, 0, bytes, { who: { bearer: ingest } })).status).toBe(401);
    expect((await hub.call('GET', `/uploads/${id}`, { bearer: ingest, noOrigin: true })).status).toBe(401);
    const device = await deviceBearerFor(hub);
    expect((await hub.put(id, 0, bytes, { who: { bearer: device } })).status).toBe(403);
    expect((await hub.call('POST', '/uploads', { bearer: device, body: { size: 1 }, noOrigin: true })).status).toBe(403);
    expect((await hub.call('GET', `/uploads/${id}`, { bearer: device, noOrigin: true })).status).toBe(403);
    expect(hub.chunkFiles(id)).toEqual([]);

    // A cookie without the CSRF token is refused like every mutating owner request.
    expect((await hub.put(id, 0, bytes, { who: { ...hub.owner, csrf: '' } })).status).toBe(403);

    // The owner bearer works end to end.
    const { createSession } = await import('../auth/sessions.js');
    const { enrolled } = await import('./device-test-helpers.js');
    const enrolledDevice = await enrolled(hub, hub.owner);
    const bearer = createSession(hub.hub.hub.db, { ownerId: hub.ownerId, kind: 'bearer', deviceId: enrolledDevice.device.deviceId, now: hub.clock.t }).token;
    expect((await hub.put(id, 0, bytes, { who: { bearer } })).status).toBe(200);
    expect((await hub.call('GET', `/uploads/${id}`, { bearer, noOrigin: true })).json).toMatchObject({ receivedChunks: 1 });

    // A session another principal made is a plain 404 (never a 403 oracle).
    const { createUploadService } = await import('../uploads/upload-service.js');
    void createUploadService;
    expect(hub.service.status({ kind: 'owner', id: 'another-owner' }, id)).toMatchObject({ ok: false, status: 404 });
  });

  it('answers 409 when SaveSphere storage does not exist (no service), without reading a chunk body', async () => {
    const { startAuthHub } = await import('./auth-test-helpers.js');
    const h = await startAuthHub({});
    try {
      const owner = await h.signIn();
      const res = await h.call('POST', '/uploads', { cookie: owner.cookie, csrf: owner.csrf, body: { size: 1 } });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe('conflict');
    } finally { await h.close(); }
  });
});

describe('uploads: memory', () => {
  it('holds one chunk at a time: streaming 96 chunks does not grow memory with the chunk count', async () => {
    const hub = await start();
    const vm = await import('node:vm');
    const v8 = await import('node:v8');
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    const size = 96 * MIB;
    const created = hub.service.create({ kind: 'owner', id: hub.ownerId }, { size, chunkSize: MIB });
    if (!created.ok) throw new Error('create failed');
    const id = created.value.uploadId;
    const piece = randomBytes(MIB);
    const used = (): number => { gc(); const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
    const baseline = used();
    let peak = 0;
    for (let i = 0; i < 96; i += 1) {
      // A body that arrives in 64 KiB pieces, as a socket delivers it.
      async function* body(): AsyncGenerator<Uint8Array> { for (let o = 0; o < MIB; o += 65536) yield piece.subarray(o, o + 65536); }
      const res = await hub.service.putChunk({ kind: 'owner', id: hub.ownerId }, id, i, body(), { contentLength: MIB });
      expect(res.ok).toBe(true);
      if (i % 8 === 0) peak = Math.max(peak, used() - baseline);
    }
    const done = await hub.service.complete({ kind: 'owner', id: hub.ownerId }, id);
    expect(done.ok).toBe(true);
    peak = Math.max(peak, used() - baseline);
    expect(peak).toBeLessThan(32 * MIB); // 96 MiB moved; a buffering implementation would sit at or above it
  }, 120_000);
});
