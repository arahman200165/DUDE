import { DestinationError } from '../destination.js';
import type { DestinationErrorCode } from '../destination.js';
import { GOOGLE_DRIVE_ENDPOINTS, refreshDriveAccessToken } from '../../../hub/drive-oauth.js';
import type { DriveEndpoints, DriveFetch } from '../../../hub/drive-oauth.js';

/**
 * A minimal, dependency-free Google Drive v3 client (32-SS1, Milestone 856, PD-154): exactly the calls the backup destination needs,
 * over global `fetch`, under the narrow `drive.file` scope. It lists and touches only the one folder the Hub created, never the owner's
 * other Drive content. It never logs and never puts a URL, a header, a token or a provider message in an error.
 *
 * - Auth: an access token is refreshed from the stored refresh token on demand (cached until a minute before it expires, refreshed once
 *   on a 401). `invalid_grant` (the consent was revoked, the token expired, the password changed) is `reauth` with an instruction to
 *   reconnect; any other refusal of the client is `auth`.
 * - Retries: exponential backoff with jitter (`Retry-After` honoured) on network errors, timeouts, 408, 429, 5xx and the 403 rate-limit
 *   reasons; every call here is idempotent (a name is looked up before a create, an upload session is queried before it is resumed).
 * - Resumable uploads: a session is opened with the file metadata (name and the one parent folder); chunks are a multiple of 256 KiB;
 *   after a failed chunk the session is asked how much it holds and the rest is sent again. The file exists only when the last chunk
 *   lands, so an object is committed atomically. The session URI is checked to be on the upload host and is never logged.
 * - Redirects are never followed (a 3xx is `bad-endpoint`). The hosts are fixed to Google's; the endpoint object is a test seam.
 */
export interface DriveClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
  /** Test seams. */
  endpoints?: DriveEndpoints;
  fetch?: DriveFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  retry?: { attempts: number; baseMs: number; maxMs: number };
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export interface DriveFileInfo { id: string; name: string; size: number; md5: string | undefined }

export interface DriveDownload {
  status: number;
  /** The object's total size when the response says so. */
  total: number | undefined;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export interface DriveQuota { limit: number | null; usage: number | null }

export type ChunkResult = { done: false } | { done: true; file: DriveFileInfo };

interface RequestSpec {
  op: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  /** Statuses returned to the caller rather than thrown (besides every 2xx). */
  passthrough?: number[];
  /** Keep the response body open (a download). */
  stream?: boolean;
  /** The URL carries its own authority (an upload session): no `Authorization`, no 401 refresh. */
  preauthorized?: boolean;
  /** Exactly one attempt: the caller owns the retry (the chunk loop). */
  single?: boolean;
}

interface Sent { status: number; headers: Headers; response: Response; clearTimer: () => void }

/** A single attempt failed before an HTTP answer. */
class Transport extends Error {
  constructor(readonly kind: 'timeout' | 'network') { super(kind === 'timeout' ? 'The Google Drive request timed out.' : 'The Google Drive request failed on the network.'); this.name = 'DriveTransportError'; }
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'internalError', 'sharingRateLimitExceeded']);
const QUOTA_REASONS = new Set(['storageQuotaExceeded', 'dailyLimitExceeded', 'quotaExceeded']);
const MAX_ERROR_BODY = 64 * 1024;
const DEFAULT_RETRY = { attempts: 5, baseMs: 250, maxMs: 8000 };
export const DRIVE_CHUNK_ALIGN = 256 * 1024;
const FILE_FIELDS = 'id,name,size,md5Checksum';

export const REAUTH_MESSAGE = 'Google Drive access was revoked or has expired; connect the Drive destination again (dude-hub backup destination add --kind drive).';

async function readText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* best effort */ } throw new DestinationError('server', 'The Google Drive response was larger than expected.'); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DestinationError) throw error;
    throw new Transport('network');
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseFile(text: string): DriveFileInfo | undefined {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return undefined; }
  return toFile(json);
}

function toFile(json: unknown): DriveFileInfo | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const record = json as Record<string, unknown>;
  const id = record['id'];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return undefined;
  const size = record['size'] === undefined ? 0 : Number(record['size']);
  if (!Number.isSafeInteger(size) || size < 0) return undefined;
  const md5 = record['md5Checksum'];
  return { id, name: typeof record['name'] === 'string' ? record['name'] : '', size, md5: typeof md5 === 'string' && /^[0-9a-f]{32}$/.test(md5) ? md5 : undefined };
}

/** The reason code Drive names in an error body, only when it is a short plain token. */
function reasonOf(text: string): string | undefined {
  try {
    const json = JSON.parse(text) as { error?: { errors?: Array<{ reason?: unknown }>; status?: unknown } };
    const reason = json.error?.errors?.[0]?.reason ?? json.error?.status;
    return typeof reason === 'string' && /^[A-Za-z]{1,64}$/.test(reason) ? reason : undefined;
  } catch {
    return undefined;
  }
}

export class DriveClient {
  readonly folderId: string;
  private readonly endpoints: DriveEndpoints;
  private readonly uploadOrigin: string;
  private readonly fetchImpl: DriveFetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly retry: { attempts: number; baseMs: number; maxMs: number };
  private readonly idleTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly credentials: { clientId: string; clientSecret: string; refreshToken: string };
  private token: { value: string; expiresAt: number } | undefined;
  private refreshing: Promise<string> | undefined;

  constructor(options: DriveClientOptions) {
    this.folderId = options.folderId;
    this.endpoints = options.endpoints ?? GOOGLE_DRIVE_ENDPOINTS;
    this.uploadOrigin = new URL(this.endpoints.uploadBase).origin;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5 * 60_000;
    this.credentials = { clientId: options.clientId, clientSecret: options.clientSecret, refreshToken: options.refreshToken };
  }

  // ---- authorization -----------------------------------------------------------------------------------------------------------------------

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token !== undefined && this.token.expiresAt - this.now() > 60_000) return this.token.value;
    this.refreshing ??= this.refresh().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    let last: DestinationError | undefined;
    for (let attempt = 0; attempt < this.retry.attempts; attempt += 1) {
      const result = await refreshDriveAccessToken({ fetch: this.fetchImpl, endpoints: this.endpoints, ...this.credentials });
      if (result.status === 'ok') {
        this.token = { value: result.accessToken, expiresAt: this.now() + result.expiresInSeconds * 1000 };
        return result.accessToken;
      }
      if (result.status === 'revoked') throw new DestinationError('reauth', REAUTH_MESSAGE);
      if (result.status === 'rejected') throw new DestinationError('auth', 'Google refused the OAuth client (check the client id and secret, and that the Drive API is enabled).');
      last = new DestinationError(result.status === 'unreachable' ? 'network' : 'server', 'Google could not refresh the Drive access token.');
      await this.backoff(attempt, undefined);
    }
    throw last ?? new DestinationError('network', 'Google could not refresh the Drive access token.');
  }

  /** Drops the cached access token and refreshes it: the connection check that tells a revoked consent from a healthy one. */
  async checkAuthorization(): Promise<void> {
    this.token = undefined;
    await this.accessToken(true);
  }

  // ---- requests ----------------------------------------------------------------------------------------------------------------------------

  private async send(spec: RequestSpec, bearer: string | undefined): Promise<Sent> {
    const headers: Record<string, string> = { ...(spec.headers ?? {}), 'accept-encoding': 'identity' };
    if (bearer !== undefined) headers['authorization'] = `Bearer ${bearer}`;
    const controller = new AbortController();
    const limit = spec.stream === true ? this.idleTimeoutMs : this.requestTimeoutMs;
    let timer: NodeJS.Timeout | undefined = setTimeout(() => { controller.abort(new Transport('timeout')); }, limit);
    const clearTimer = (): void => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
    let response: Response;
    try {
      response = await this.fetchImpl(spec.url, {
        method: spec.method, headers, redirect: 'manual', signal: controller.signal,
        ...(spec.body !== undefined ? { body: typeof spec.body === 'string' ? spec.body : new Uint8Array(spec.body.buffer as ArrayBuffer, spec.body.byteOffset, spec.body.byteLength) } : {}),
      });
    } catch (error) {
      clearTimer();
      throw error instanceof Transport ? error : controller.signal.aborted && controller.signal.reason instanceof Transport ? controller.signal.reason : new Transport('network');
    }
    // A download keeps no overall timer (its body is guarded by the per-read idle timeout); every other call is bounded until the caller has read the body.
    if (spec.stream === true) clearTimer();
    return { status: response.status, headers: response.headers, response, clearTimer };
  }

  private codeOf(status: number, reason: string | undefined): DestinationErrorCode {
    if (status >= 300 && status < 400) return 'bad-endpoint';
    if (reason !== undefined && QUOTA_REASONS.has(reason)) return 'quota';
    if (status === 429 || (reason !== undefined && RETRY_REASONS.has(reason) && status === 403)) return 'throttled';
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'unavailable';
    if (status === 408) return 'timeout';
    if (status >= 500) return 'server';
    return 'rejected';
  }

  private async backoff(attempt: number, retryAfterMs: number | undefined): Promise<void> {
    if (attempt + 1 >= this.retry.attempts) return;
    const exp = Math.min(this.retry.maxMs, this.retry.baseMs * 2 ** attempt);
    const wait = retryAfterMs !== undefined ? Math.min(this.retry.maxMs, retryAfterMs) : Math.round(exp * (0.5 + this.random() / 2));
    await this.sleep(wait);
  }

  private fail(op: string, status: number, code: DestinationErrorCode): DestinationError {
    const detail = status === 0 ? code : String(status);
    const message = code === 'quota' ? `The Google Drive is full or its API quota is spent (${op} failed, ${detail}).`
      : code === 'auth' ? `Google Drive refused the request (${op} failed, ${detail}); the connection may need to be made again.`
        : code === 'unavailable' ? `The Google Drive folder or file was not found (${op} failed, ${detail}).`
          : `Google Drive ${op} failed (${detail}).`;
    return new DestinationError(code, message);
  }

  /** One logical request: authorizes, sends, retries and maps errors. The caller owns (consumes or cancels) the response body. */
  private async request(spec: RequestSpec): Promise<Sent> {
    let refreshedOn401 = false;
    let lastCode: DestinationErrorCode = 'network';
    let lastStatus = 0;
    const attempts = spec.single === true ? 1 : this.retry.attempts;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const bearer = spec.preauthorized === true ? undefined : await this.accessToken();
      let sent: Sent;
      try {
        sent = await this.send(spec, bearer);
      } catch (error) {
        if (!(error instanceof Transport)) throw error;
        lastCode = error.kind;
        lastStatus = 0;
        if (spec.single === true) break;
        await this.backoff(attempt, undefined);
        continue;
      }
      const { status } = sent;
      if (status >= 200 && status < 300) return sent;
      if (spec.passthrough?.includes(status) === true) return sent;
      let reason: string | undefined;
      try {
        reason = reasonOf(await readText(sent.response, MAX_ERROR_BODY));
      } catch { try { await sent.response.body?.cancel(); } catch { /* best effort */ } }
      sent.clearTimer();
      if (status === 401 && spec.preauthorized !== true && !refreshedOn401) {
        refreshedOn401 = true;
        this.token = undefined;
        attempt -= 1; // a refreshed token is not a retry
        continue;
      }
      lastStatus = status;
      lastCode = this.codeOf(status, reason);
      const retriable = RETRY_STATUSES.has(status) || (status === 403 && reason !== undefined && RETRY_REASONS.has(reason));
      if (retriable && spec.single !== true) {
        const retryAfter = Number(sent.headers.get('retry-after'));
        await this.backoff(attempt, Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : undefined);
        continue;
      }
      break;
    }
    throw this.fail(spec.op, lastStatus, lastCode);
  }

  private async json(spec: RequestSpec): Promise<{ status: number; text: string }> {
    const sent = await this.request(spec);
    try {
      return { status: sent.status, text: await readText(sent.response, 8 * 1024 * 1024) };
    } catch (error) {
      if (error instanceof Transport) throw this.fail(spec.op, 0, error.kind);
      throw error;
    } finally {
      sent.clearTimer();
    }
  }

  // ---- folder and files --------------------------------------------------------------------------------------------------------------------

  /** Creates a folder at the top of the owner's Drive (the app-created folder that holds the repository); returns its id. */
  async createFolder(name: string): Promise<string> {
    const { text } = await this.json({
      op: 'create-folder', method: 'POST', url: `${this.endpoints.apiBase}/files?fields=id`,
      headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const file = parseFile(text);
    if (file === undefined) throw new DestinationError('server', 'Google Drive create-folder returned no folder id.');
    return file.id;
  }

  /** Whether the configured folder exists, is a folder and is not in the trash. */
  async folderUsable(): Promise<boolean> {
    const sent = await this.request({ op: 'get-folder', method: 'GET', url: `${this.endpoints.apiBase}/files/${encodeURIComponent(this.folderId)}?fields=id,mimeType,trashed`, passthrough: [404] });
    if (sent.status === 404) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } sent.clearTimer(); return false; }
    const text = await readText(sent.response, MAX_ERROR_BODY).finally(() => sent.clearTimer());
    try {
      const json = JSON.parse(text) as { mimeType?: unknown; trashed?: unknown };
      return json.mimeType === 'application/vnd.google-apps.folder' && json.trashed !== true;
    } catch {
      return false;
    }
  }

  private listUrl(q: string, pageToken: string | undefined, pageSize: number): string {
    const params = new URLSearchParams({ q, spaces: 'drive', pageSize: String(pageSize), fields: `nextPageToken,files(${FILE_FIELDS})`, orderBy: 'name' });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    return `${this.endpoints.apiBase}/files?${params.toString()}`;
  }

  private inFolder(): string {
    return `'${this.folderId}' in parents and trashed = false`;
  }

  /** The files in the folder with exactly this (repository-relative) name; normally zero or one. Names are the closed object-name set. */
  async findByName(name: string): Promise<DriveFileInfo[]> {
    if (!/^[A-Za-z0-9/._-]{1,128}$/.test(name)) throw new DestinationError('bad-name', 'A backup object name is not allowed.');
    const { text } = await this.json({ op: 'find', method: 'GET', url: this.listUrl(`name = '${name}' and ${this.inFolder()}`, undefined, 10) });
    return this.parseList(text).files;
  }

  private parseList(text: string): { files: DriveFileInfo[]; nextPageToken: string | undefined } {
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new DestinationError('server', 'Google Drive returned an unreadable listing.'); }
    const record = (typeof json === 'object' && json !== null ? json : {}) as { files?: unknown; nextPageToken?: unknown };
    const files: DriveFileInfo[] = [];
    if (Array.isArray(record.files)) for (const entry of record.files) { const file = toFile(entry); if (file !== undefined) files.push(file); }
    const next = record.nextPageToken;
    return { files, nextPageToken: typeof next === 'string' && next.length > 0 && next.length <= 4096 ? next : undefined };
  }

  /** Every file in the folder whose name starts with `namePrefix`, following page tokens. */
  async list(namePrefix: string): Promise<DriveFileInfo[]> {
    const out: DriveFileInfo[] = [];
    let token: string | undefined;
    for (let page = 0; page < 100_000; page += 1) {
      const { text } = await this.json({ op: 'list', method: 'GET', url: this.listUrl(this.inFolder(), token, 1000) });
      const parsed = this.parseList(text);
      for (const file of parsed.files) if (file.name.startsWith(namePrefix)) out.push(file);
      if (parsed.nextPageToken === undefined) return out;
      if (parsed.nextPageToken === token) throw new DestinationError('server', 'Google Drive listing pagination did not advance.');
      token = parsed.nextPageToken;
    }
    throw new DestinationError('server', 'Google Drive listing returned too many pages.');
  }

  /** Permanently deletes a file (not the trash); idempotent. */
  async delete(fileId: string): Promise<void> {
    const sent = await this.request({ op: 'delete', method: 'DELETE', url: `${this.endpoints.apiBase}/files/${encodeURIComponent(fileId)}`, passthrough: [404] });
    try { await sent.response.body?.cancel(); } catch { /* best effort */ }
    sent.clearTimer();
  }

  /** Storage quota of the signed-in account (`limit` is null on an unlimited plan). */
  async about(): Promise<DriveQuota> {
    const { text } = await this.json({ op: 'about', method: 'GET', url: `${this.endpoints.apiBase}/about?fields=storageQuota` });
    try {
      const q = (JSON.parse(text) as { storageQuota?: { limit?: unknown; usage?: unknown } }).storageQuota;
      const num = (v: unknown): number | null => { const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN; return Number.isSafeInteger(n) && n >= 0 ? n : null; };
      return { limit: num(q?.limit), usage: num(q?.usage) };
    } catch {
      return { limit: null, usage: null };
    }
  }

  // ---- resumable upload --------------------------------------------------------------------------------------------------------------------

  /** Opens a resumable session for a new file in the folder; returns the session URI (a bearer-less, unguessable URL). */
  async startUpload(name: string): Promise<string> {
    const sent = await this.request({
      op: 'start-upload', method: 'POST', url: `${this.endpoints.uploadBase}/files?uploadType=resumable&fields=${FILE_FIELDS}`,
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-upload-content-type': 'application/octet-stream' },
      body: JSON.stringify({ name, parents: [this.folderId], mimeType: 'application/octet-stream' }),
    });
    try { await sent.response.body?.cancel(); } catch { /* best effort */ }
    sent.clearTimer();
    const location = sent.headers.get('location');
    let session: URL;
    try { session = new URL(location ?? ''); } catch { throw new DestinationError('server', 'Google Drive returned no upload session.'); }
    if (session.origin !== this.uploadOrigin || session.username !== '' || session.password !== '') throw new DestinationError('bad-endpoint', 'Google Drive returned an upload session on another host.');
    return session.toString();
  }

  private async sessionState(session: string, total: number | undefined): Promise<{ complete: true; file: DriveFileInfo } | { complete: false; received: number }> {
    for (let attempt = 0; attempt < this.retry.attempts; attempt += 1) {
      let sent: Sent;
      try {
        sent = await this.send({ op: 'upload-status', method: 'PUT', url: session, headers: { 'content-range': `bytes */${total ?? '*'}` }, preauthorized: true }, undefined);
      } catch (error) {
        if (!(error instanceof Transport)) throw error;
        await this.backoff(attempt, undefined);
        continue;
      }
      try {
        if (sent.status === 200 || sent.status === 201) {
          const file = parseFile(await readText(sent.response, MAX_ERROR_BODY));
          if (file === undefined) throw new DestinationError('server', 'Google Drive returned an unreadable upload result.');
          return { complete: true, file };
        }
        if (sent.status === 308) {
          const range = /^bytes=0-(\d+)$/.exec(sent.headers.get('range') ?? '');
          return { complete: false, received: range === null ? 0 : Number(range[1]) + 1 };
        }
        if (sent.status === 404 || sent.status === 410) throw new DestinationError('server', 'The Google Drive upload session expired.');
        if (RETRY_STATUSES.has(sent.status)) { await this.backoff(attempt, undefined); continue; }
        throw this.fail('upload-status', sent.status, this.codeOf(sent.status, undefined));
      } catch (error) {
        if (error instanceof Transport) { await this.backoff(attempt, undefined); continue; }
        throw error;
      } finally {
        try { await sent.response.body?.cancel(); } catch { /* best effort */ }
        sent.clearTimer();
      }
    }
    throw new DestinationError('network', 'The Google Drive upload session could not be queried.');
  }

  /**
   * Sends `bytes` (the bytes at `offset` of the object) to the session. With `total` it is the final chunk: the file is created and
   * returned. Without it the chunk must be a multiple of 256 KiB and the session must acknowledge all of it. A failed attempt asks the
   * session how much it holds (never assumes) and sends only the rest; the loop is bounded.
   */
  async uploadChunk(session: string, bytes: Uint8Array, offset: number, total: number | undefined): Promise<ChunkResult> {
    if (total === undefined && (bytes.length === 0 || bytes.length % DRIVE_CHUNK_ALIGN !== 0)) throw new DestinationError('rejected', 'A Google Drive upload chunk must be a multiple of 256 KiB.');
    const end = offset + bytes.length;
    let from = offset;
    let failures = 0;
    for (let round = 0; round < this.retry.attempts * 4; round += 1) {
      const slice = bytes.subarray(from - offset);
      const range = bytes.length === 0 ? `bytes */${total}` : `bytes ${from}-${end - 1}/${total ?? '*'}`;
      let outcome: 'retry' | ChunkResult | undefined;
      try {
        const sent = await this.send({ op: 'upload-chunk', method: 'PUT', url: session, headers: { 'content-range': range, 'content-type': 'application/octet-stream' }, body: slice, preauthorized: true }, undefined);
        try {
          if (sent.status === 200 || sent.status === 201) {
            const file = parseFile(await readText(sent.response, MAX_ERROR_BODY));
            if (file === undefined) throw new DestinationError('server', 'Google Drive returned an unreadable upload result.');
            if (total === undefined) throw new DestinationError('mismatch', 'Google Drive finished an upload before its last chunk.');
            outcome = { done: true, file };
          } else if (sent.status === 308) {
            const ack = /^bytes=0-(\d+)$/.exec(sent.headers.get('range') ?? '');
            const received = ack === null ? 0 : Number(ack[1]) + 1;
            if (total !== undefined && received >= end) { failures += 1; outcome = 'retry'; } // the final chunk is stored but no file exists yet: ask the session
            else if (received >= end) outcome = { done: false };
            else if (received < offset) throw new DestinationError('server', 'The Google Drive upload session lost data.');
            else { from = received; outcome = 'retry'; failures = 0; }
          } else if (sent.status === 404 || sent.status === 410) {
            throw new DestinationError('server', 'The Google Drive upload session expired.');
          } else {
            let reason: string | undefined;
            try { reason = reasonOf(await readText(sent.response, MAX_ERROR_BODY)); } catch { /* the status decides */ }
            const retriable = RETRY_STATUSES.has(sent.status) || (sent.status === 403 && reason !== undefined && RETRY_REASONS.has(reason));
            if (!retriable) throw this.fail('upload-chunk', sent.status, this.codeOf(sent.status, reason));
            const retryAfter = Number(sent.headers.get('retry-after'));
            failures += 1;
            if (failures >= this.retry.attempts) throw this.fail('upload-chunk', sent.status, this.codeOf(sent.status, reason));
            await this.backoff(failures - 1, Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : undefined);
            outcome = 'retry';
          }
        } finally {
          try { await sent.response.body?.cancel(); } catch { /* best effort */ }
          sent.clearTimer();
        }
      } catch (error) {
        if (!(error instanceof Transport)) throw error;
        failures += 1;
        if (failures >= this.retry.attempts) throw this.fail('upload-chunk', 0, error.kind);
        await this.backoff(failures - 1, undefined);
        outcome = 'retry';
      }
      if (outcome !== 'retry') return outcome;
      if (failures > 0) {
        // The answer was lost or an error came back: the session says what it holds (and whether the file was already created).
        const state = await this.sessionState(session, total);
        if (state.complete) {
          if (total === undefined) throw new DestinationError('mismatch', 'Google Drive finished an upload before its last chunk.');
          return { done: true, file: state.file };
        }
        if (state.received < offset) throw new DestinationError('server', 'The Google Drive upload session lost data.');
        if (total === undefined && state.received >= end) return { done: false };
        from = Math.min(state.received, end);
      }
    }
    throw new DestinationError('server', 'The Google Drive upload did not make progress.');
  }

  /** Abandons a session (best effort: an unfinished session creates no file and expires on its own). */
  async cancelUpload(session: string): Promise<void> {
    try {
      const sent = await this.send({ op: 'cancel-upload', method: 'DELETE', url: session, preauthorized: true }, undefined);
      try { await sent.response.body?.cancel(); } catch { /* best effort */ }
      sent.clearTimer();
    } catch { /* the session expires by itself */ }
  }

  /** Replaces the content of an existing file in one request (the repository object, a few hundred bytes). */
  async updateContent(fileId: string, bytes: Uint8Array): Promise<DriveFileInfo> {
    const { text } = await this.json({
      op: 'update', method: 'PATCH', url: `${this.endpoints.uploadBase}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`,
      headers: { 'content-type': 'application/octet-stream' }, body: bytes,
    });
    const file = parseFile(text);
    if (file === undefined) throw new DestinationError('server', 'Google Drive returned an unreadable update result.');
    return file;
  }

  // ---- download ----------------------------------------------------------------------------------------------------------------------------

  /** Streams a file from `start`; null when it does not exist. The caller consumes or destroys the body. */
  async download(fileId: string, start: number): Promise<DriveDownload | null> {
    const headers: Record<string, string> = {};
    if (start > 0) headers['range'] = `bytes=${start}-`;
    const sent = await this.request({ op: 'download', method: 'GET', url: `${this.endpoints.apiBase}/files/${encodeURIComponent(fileId)}?alt=media`, headers, passthrough: [404, 416], stream: true });
    if (sent.status === 404) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } return null; }
    if (sent.status === 416) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } return { status: 416, total: undefined, body: (async function* () { /* empty */ })(), destroy: () => undefined }; }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(sent.headers.get('content-range') ?? '');
    const length = Number(sent.headers.get('content-length'));
    let total: number | undefined;
    if (range !== null) total = Number(range[3]);
    else if (sent.status === 200 && Number.isSafeInteger(length)) total = length;
    if (start > 0 && sent.status !== 206) {
      try { await sent.response.body?.cancel(); } catch { /* best effort */ }
      throw new DestinationError('rejected', 'Google Drive ignored a Range request.');
    }
    if (sent.status === 206 && range !== null && Number(range[1]) !== start) {
      try { await sent.response.body?.cancel(); } catch { /* best effort */ }
      throw new DestinationError('mismatch', 'Google Drive answered a different range than requested.');
    }
    const reader = sent.response.body?.getReader();
    const idle = this.idleTimeoutMs;
    const body = (async function* (): AsyncGenerator<Uint8Array> {
      if (reader === undefined) return;
      for (;;) {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Transport('timeout')); }, idle); });
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await Promise.race([reader.read(), timeout]);
        } catch (error) {
          try { await reader.cancel(); } catch { /* best effort */ }
          throw error instanceof Transport ? error : new Transport('network');
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
        if (chunk.done) return;
        yield chunk.value;
      }
    })();
    return { status: sent.status, total, body, destroy: () => { void reader?.cancel().catch(() => undefined); } };
  }
}
