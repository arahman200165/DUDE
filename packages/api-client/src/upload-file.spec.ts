import { describe, expect, it } from 'vitest';
import type { UploadSession } from '@dude/contracts/hub';
import { HubApiError } from './errors.js';
import { UploadAbandonedError, bytesSource, isTransientUploadError, missingChunks, uploadFileResumable } from './upload-file.js';

const MIB = 1024 * 1024;
const sha = (bytes: Uint8Array): Promise<string> => Promise.resolve(`h${bytes.byteLength}`);

/** An in-memory Hub: enough of the upload routes to drive the helper. */
function fakeHub(size: number, chunkSize = MIB) {
  const count = Math.ceil(size / chunkSize);
  const got = new Map<number, string>();
  const calls: string[] = [];
  const session = (state: UploadSession['state'] = 'open'): UploadSession => {
    const idx = [...got.keys()].sort((a, b) => a - b);
    const received: Array<[number, number]> = [];
    for (const i of idx) { const last = received[received.length - 1]; if (last !== undefined && last[1] + 1 === i) last[1] = i; else received.push([i, i]); }
    return { uploadId: 'u1', state, size, sha256: null, chunkSize, chunkCount: count, received, receivedChunks: got.size, receivedBytes: 0, createdAt: 't', expiresAt: 't', mime: null, name: null, blob: null, failure: null };
  };
  const hub = {
    got, calls, failPuts: [] as unknown[], completeReplies: [] as unknown[],
    client: {
      createUpload: async () => { calls.push('create'); return session(); },
      uploadStatus: async (..._args: unknown[]) => { calls.push('status'); return session(); },
      putUploadChunk: async (_a: unknown, _id: string, index: number, bytes: Uint8Array, o?: { sha256?: string }) => {
        calls.push(`put:${index}`);
        const failure = hub.failPuts.shift();
        if (failure !== undefined) throw failure;
        got.set(index, o?.sha256 ?? '');
        return { uploadId: 'u1', index, size: bytes.byteLength, sha256: 'a'.repeat(64), duplicate: false, receivedChunks: got.size, receivedBytes: 0, expiresAt: 't' };
      },
      completeUpload: async () => {
        calls.push('complete');
        const reply = hub.completeReplies.shift();
        if (reply instanceof Error) throw reply;
        return (reply ?? { uploadId: 'u1', state: 'complete', sha256: 'b'.repeat(64), size, blobRef: 'upload:u1', expiresAt: 't' }) as never;
      },
    },
  };
  return hub;
}
const noSleep = (log?: number[]) => async (ms: number): Promise<void> => { log?.push(ms); };

describe('uploadFileResumable', () => {
  it('creates a session, sends every chunk with its own hash, and completes', async () => {
    const hub = fakeHub(2 * MIB + 10);
    const data = new Uint8Array(2 * MIB + 10);
    const result = await uploadFileResumable(hub.client, bytesSource(data), { sha256Hex: sha, sleep: noSleep() });
    expect(hub.calls).toEqual(['create', 'put:0', 'put:1', 'put:2', 'complete']);
    expect([...hub.got.values()]).toEqual([`h${MIB}`, `h${MIB}`, 'h10']);
    expect(result).toEqual({ uploadId: 'u1', sha256: 'b'.repeat(64), size: 2 * MIB + 10, blobRef: 'upload:u1' });
  });

  it('resumes: asks for the status and sends only the missing chunks', async () => {
    const hub = fakeHub(4 * MIB);
    hub.got.set(0, 'x'); hub.got.set(1, 'x'); hub.got.set(3, 'x');
    await uploadFileResumable(hub.client, bytesSource(new Uint8Array(4 * MIB)), { uploadId: 'u1', sha256Hex: sha, sleep: noSleep() });
    expect(hub.calls).toEqual(['status', 'put:2', 'complete']);
  });

  it('retries a transient chunk failure with exponential backoff, and gives up on one repeating cannot fix', async () => {
    const hub = fakeHub(MIB);
    const delays: number[] = [];
    hub.failPuts.push(new TypeError('fetch failed'), new HubApiError(503, 'internal', 'x'), new HubApiError(429, 'rate-limited', 'x'));
    await uploadFileResumable(hub.client, bytesSource(new Uint8Array(MIB)), { sha256Hex: sha, sleep: noSleep(delays), baseDelayMs: 100, maxDelayMs: 350 });
    expect(delays).toEqual([100, 200, 350]);
    expect(hub.calls.filter((c) => c === 'put:0')).toHaveLength(4);

    const full = fakeHub(MIB);
    full.failPuts.push(new HubApiError(507, 'storage-full', 'x'));
    await expect(uploadFileResumable(full.client, bytesSource(new Uint8Array(MIB)), { sha256Hex: sha, sleep: noSleep() })).rejects.toMatchObject({ status: 507 });
    expect(full.calls.filter((c) => c === 'put:0')).toHaveLength(1);

    const flaky = fakeHub(MIB);
    flaky.failPuts.push(...Array.from({ length: 5 }, () => new TypeError('down')));
    await expect(uploadFileResumable(flaky.client, bytesSource(new Uint8Array(MIB)), { sha256Hex: sha, sleep: noSleep(), maxAttempts: 3 })).rejects.toThrow('down');
    expect(flaky.calls.filter((c) => c === 'put:0')).toHaveLength(3);
  });

  it('polls a long assembly (state completing) until it completes, and repairs a 409 by re-sending what is missing', async () => {
    const hub = fakeHub(2 * MIB);
    hub.completeReplies.push({ ...(await hub.client.uploadStatus()), state: 'completing' });
    hub.completeReplies.push(new HubApiError(409, 'conflict', 'Chunk 1 was missing'));
    hub.calls.length = 0;
    await uploadFileResumable(hub.client, bytesSource(new Uint8Array(2 * MIB)), { sha256Hex: sha, sleep: noSleep() });
    expect(hub.calls).toEqual(['create', 'put:0', 'put:1', 'complete', 'complete', 'status', 'complete']);
  });

  it('stops on a session that is over, a wrong-size session, and a cancel', async () => {
    const hub = fakeHub(MIB);
    hub.client.uploadStatus = async () => ({ ...(await fakeHub(MIB).client.uploadStatus()), state: 'expired' as const });
    await expect(uploadFileResumable(hub.client, bytesSource(new Uint8Array(MIB)), { uploadId: 'u1', sha256Hex: sha, sleep: noSleep() })).rejects.toBeInstanceOf(UploadAbandonedError);
    const other = fakeHub(2 * MIB);
    await expect(uploadFileResumable(other.client, bytesSource(new Uint8Array(MIB)), { uploadId: 'u1', sha256Hex: sha, sleep: noSleep() })).rejects.toBeInstanceOf(UploadAbandonedError);
    const controller = new AbortController();
    controller.abort();
    await expect(uploadFileResumable(fakeHub(MIB).client, bytesSource(new Uint8Array(MIB)), { signal: controller.signal, sha256Hex: sha, sleep: noSleep() })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('finds the missing indexes of a range list and classifies errors', () => {
    expect(missingChunks(6, [[0, 1], [4, 4]])).toEqual([2, 3, 5]);
    expect(missingChunks(2, [[0, 9]])).toEqual([]);
    expect(isTransientUploadError(new HubApiError(409, 'conflict', ''))).toBe(false);
    expect(isTransientUploadError(new HubApiError(401, 'unauthorized', ''))).toBe(false);
    expect(isTransientUploadError(new HubApiError(502, 'internal', ''))).toBe(true);
    expect(isTransientUploadError(new Error('socket hang up'))).toBe(true);
  });
});
