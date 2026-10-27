import type { UploadBlob, UploadChunkRange, UploadSession } from '@dude/contracts/hub';
import { HubApiError } from './errors.js';
import type { Bearer, HubClient } from './client.js';

/**
 * `uploadFileResumable` (32-SS1, Milestone 845): the client half of the resumable upload route family, pure and transport-agnostic (it only
 * calls `HubClient` methods, so the web, desktop and mobile hosts all reuse it). It negotiates a session, asks the Hub which chunks already
 * arrived (so a dropped connection, a restarted app or a second attempt resumes instead of starting over), sends only the missing chunks,
 * each with its SHA-256 header, retries transient failures with exponential backoff, and completes. A chunk is read from the source only
 * when it is about to be sent, so memory is one chunk, never the file.
 */
export interface UploadSource {
  /** Total bytes. */
  readonly size: number;
  /** Exactly `length` bytes starting at `offset` (the last chunk is shorter). */
  read(offset: number, length: number): Promise<Uint8Array>;
}

export const bytesSource = (bytes: Uint8Array): UploadSource => ({ size: bytes.byteLength, read: async (offset, length) => bytes.subarray(offset, offset + length) });

/** A browser `File` or `Blob`. */
export const blobSource = (blob: { size: number; slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> } }): UploadSource => ({
  size: blob.size,
  read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
});

export interface UploadProgress {
  uploadId: string;
  chunkCount: number;
  receivedChunks: number;
  receivedBytes: number;
  totalBytes: number;
}

export interface ResumableUploadOptions {
  auth?: Bearer;
  name?: string;
  mime?: string;
  /** Lower-case hex SHA-256 of the whole file, when the caller already has it: the Hub then refuses to keep different bytes. */
  sha256?: string;
  /** Preferred chunk size (the Hub negotiates it; default 8 MiB). */
  chunkSize?: number;
  /** Resume this session (for example the id a previous run persisted) instead of creating one. */
  uploadId?: string;
  /** Tries per chunk (and per status or complete call) before giving up. Default 5. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  /** Called once the session id is known (persist it to resume after a restart). */
  onSession?: (session: UploadSession) => void;
  /**
   * SHA-256 of one chunk as lower-case hex, sent as the chunk's checksum header (the Hub verifies it). Required: portable code owns no crypto,
   * so the host supplies it, for example `webCryptoSha256(globalThis.crypto.subtle)` in a browser or Node.
   */
  sha256Hex: (bytes: Uint8Array) => Promise<string>;
}

export class UploadAbandonedError extends Error {
  constructor(readonly state: string, message: string) {
    super(message);
    this.name = 'UploadAbandonedError';
  }
}

type UploadClient = Pick<HubClient, 'createUpload' | 'uploadStatus' | 'putUploadChunk' | 'completeUpload'>;

const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
/** Adapts a Web Crypto `SubtleCrypto` (browsers, Node, Electron renderers) to the `sha256Hex` option. */
export const webCryptoSha256 = (subtle: { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> }): ((bytes: Uint8Array) => Promise<string>) =>
  async (bytes) => hex(await subtle.digest('SHA-256', bytes as BufferSource));

/** Network failures and overload are worth retrying; a refusal that repeating cannot change (bad request, conflict, auth, disk full, not found) is not. */
export function isTransientUploadError(error: unknown): boolean {
  if (error instanceof HubApiError) return error.status === 408 || error.status === 429 || (error.status >= 500 && error.status !== 507);
  return !(error instanceof UploadAbandonedError) && !(error instanceof Error && error.name === 'AbortError') && !(error instanceof Error && error.name === 'HubProtocolError');
}

/** The chunk indexes `received` (inclusive ranges) lacks, ascending. */
export function missingChunks(chunkCount: number, received: readonly UploadChunkRange[]): number[] {
  const have = new Uint8Array(chunkCount);
  for (const [from, to] of received) for (let i = from; i <= Math.min(to, chunkCount - 1); i += 1) have[i] = 1;
  const out: number[] = [];
  for (let i = 0; i < chunkCount; i += 1) if (have[i] === 0) out.push(i);
  return out;
}

export async function uploadFileResumable(client: UploadClient, source: UploadSource, options: ResumableUploadOptions): Promise<UploadBlob & { uploadId: string }> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelay = options.baseDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 15_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const hashOf = options.sha256Hex;
  const auth = options.auth;
  const aborted = (): void => { if (options.signal?.aborted) throw Object.assign(new Error('The upload was cancelled.'), { name: 'AbortError' }); };

  async function retrying<T>(what: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      aborted();
      try { return await what(); } catch (error) {
        if (attempt >= maxAttempts || !isTransientUploadError(error)) throw error;
        await sleep(Math.min(maxDelay, baseDelay * 2 ** (attempt - 1)));
      }
    }
  }

  let session = options.uploadId === undefined
    ? await retrying(() => client.createUpload(auth, {
      size: source.size,
      ...(options.sha256 === undefined ? {} : { sha256: options.sha256 }),
      ...(options.chunkSize === undefined ? {} : { chunkSize: options.chunkSize }),
      ...(options.mime === undefined ? {} : { mime: options.mime }),
      ...(options.name === undefined ? {} : { name: options.name }),
    }))
    : await retrying(() => client.uploadStatus(auth, options.uploadId as string));
  options.onSession?.(session);
  if (session.size !== source.size) throw new UploadAbandonedError(session.state, 'The upload session is for a file of a different size.');

  const abandoned = (s: UploadSession): UploadAbandonedError => new UploadAbandonedError(s.state, `The upload is ${s.state}${s.failure === null ? '' : ` (${s.failure})`}; start a new one.`);
  const progress = (s: UploadSession): void => options.onProgress?.({ uploadId: s.uploadId, chunkCount: s.chunkCount, receivedChunks: s.receivedChunks, receivedBytes: s.receivedBytes, totalBytes: s.size });

  if (session.state === 'complete' && session.blob !== null) return { ...session.blob, uploadId: session.uploadId };
  if (session.state === 'failed' || session.state === 'aborted' || session.state === 'expired') throw abandoned(session);

  async function sendMissing(): Promise<void> {
    progress(session);
    for (const index of missingChunks(session.chunkCount, session.received)) {
      aborted();
      const offset = index * session.chunkSize;
      const length = Math.min(session.chunkSize, source.size - offset);
      const bytes = await source.read(offset, length);
      const sha256 = await hashOf(bytes);
      const sent = await retrying(() => client.putUploadChunk(auth, session.uploadId, index, bytes, { sha256 }));
      progress({ ...session, receivedChunks: sent.receivedChunks, receivedBytes: sent.receivedBytes });
    }
  }
  if (session.state === 'open') await sendMissing();

  // Complete; a long assembly answers with the session (state `completing`): poll, which also joins the running assembly. A 409 while the session is
  // still open means the Hub lost or rejected a stored chunk: ask what is missing now, send it, and complete again (a few rounds at most).
  let repairs = 0;
  for (let polls = 0; ; polls += 1) {
    let result;
    try {
      result = await retrying(() => client.completeUpload(auth, session.uploadId));
    } catch (error) {
      if (!(error instanceof HubApiError) || error.status !== 409 || repairs >= 3) throw error;
      const fresh = await retrying(() => client.uploadStatus(auth, session.uploadId));
      if (fresh.state !== 'open') throw abandoned(fresh);
      repairs += 1;
      session = fresh;
      await sendMissing();
      continue;
    }
    if (result.state === 'complete' && 'sha256' in result && 'blobRef' in result) {
      return { sha256: result.sha256, size: result.size, blobRef: result.blobRef, uploadId: result.uploadId };
    }
    session = result as UploadSession;
    if (session.state !== 'completing') throw abandoned(session);
    if (polls >= 600) throw new UploadAbandonedError(session.state, 'The Hub is still assembling the upload; check its status later.');
    await sleep(Math.min(maxDelay, baseDelay * 2 ** Math.min(polls, 6)));
  }
}
