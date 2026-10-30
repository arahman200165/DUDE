import { DestinationError } from '../destination.js';
import type { DestinationErrorCode } from '../destination.js';
import { MICROSOFT_ONEDRIVE_ENDPOINTS, refreshOneDriveAccessToken } from '../../../hub/onedrive-oauth.js';
import type { OneDriveEndpoints, OneDriveFetch } from '../../../hub/onedrive-oauth.js';

/**
 * A minimal, dependency-free Microsoft Graph client for OneDrive (32-SS1, Milestone 857, PD-150): exactly the calls the backup
 * destination needs, over global `fetch`, under the narrow `Files.ReadWrite.AppFolder` scope. It touches only the one folder the Hub
 * created inside its own app folder (`/me/drive/special/approot`), never the owner's other OneDrive content. It never logs and never
 * puts a URL, a header, a token or a provider message in an error.
 *
 * - Auth: an access token is refreshed from the stored refresh token on demand (cached until a minute before it expires, refreshed once
 *   on a 401). Microsoft ROTATES the refresh token: a new one is handed to `onRefreshToken` (the Hub persists it atomically in the
 *   secret store) before the old one is dropped, and the in-memory copy follows it. A revoked or expired consent (`invalid_grant`,
 *   `interaction_required`) is `reauth` with an instruction to reconnect, after one look at the store for a token a sibling client
 *   rotated; any other refusal of the client is `auth`.
 * - Retries: exponential backoff with jitter on network errors, timeouts, 408, 429, 5xx and 509; `Retry-After` is honoured (up to two
 *   minutes) because Graph throttles in earnest. Every call here is idempotent (a name is looked up before a create, an upload session is
 *   queried before it is resumed, a create uses `conflictBehavior: fail`).
 * - Resumable uploads: `createUploadSession` on the item path (`items/{folder}:/{name}:/createUploadSession`, name collision = fail), then
 *   fragments PUT to the pre-authenticated session URL with `Content-Range: bytes a-b/total` (Graph needs the TOTAL in every fragment,
 *   so the destination stages the object and knows it) in a multiple of 320 KiB; after a failed fragment the session is asked which ranges
 *   it still expects and only those are sent again. The object exists only when its last fragment lands.
 * - Hosts: the API is the fixed Graph base. The session URL and the download URL are handed back by Graph and live on Microsoft's own
 *   file hosts; each is accepted only when it is https (or the Graph origin itself), carries no credentials, is not an IP literal and ends
 *   in one of `ONEDRIVE_TRANSFER_HOST_SUFFIXES`, and no bearer is ever sent to it. An `@odata.nextLink` must stay on the Graph origin.
 * - Redirects are never followed (a 3xx is `bad-endpoint`). The endpoint object is a test seam.
 */
export interface OneDriveClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
  /** Called with a ROTATED refresh token before the old one is forgotten (the Hub persists it). A throw is not fatal: the token keeps working in memory. */
  onRefreshToken?: (refreshToken: string) => void;
  /** The newest refresh token the Hub has stored (a sibling client may have rotated it since this one was built); consulted once when Microsoft refuses the one in hand. */
  latestRefreshToken?: () => string | undefined;
  /** Test seams. */
  endpoints?: OneDriveEndpoints;
  fetch?: OneDriveFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  retry?: { attempts: number; baseMs: number; maxMs: number };
  /** The longest `Retry-After` honoured (default 120 s). */
  retryAfterCapMs?: number;
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
}

/** The hash facets Graph reports: lower-case hex; absent when Microsoft has not computed them (yet). */
export interface OneDriveFileInfo { id: string; name: string; size: number; sha1: string | undefined; sha256: string | undefined }

export interface OneDriveDownload {
  status: number;
  /** The object's total size when the response says so. */
  total: number | undefined;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export interface OneDriveQuota { limit: number | null; usage: number | null }

export interface OneDriveUploadSession { url: string; name: string }

export type ChunkResult = { done: false } | { done: true; file: OneDriveFileInfo };

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
  /** The URL carries its own authority (an upload session or a download URL): no `Authorization`, no 401 refresh. */
  preauthorized?: boolean;
  /** Exactly one attempt: the caller owns the retry (the fragment loop). */
  single?: boolean;
}

interface Sent { status: number; headers: Headers; response: Response; clearTimer: () => void }

/** A single attempt failed before an HTTP answer. */
class Transport extends Error {
  constructor(readonly kind: 'timeout' | 'network') { super(kind === 'timeout' ? 'The OneDrive request timed out.' : 'The OneDrive request failed on the network.'); this.name = 'OneDriveTransportError'; }
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 509]);
const QUOTA_REASONS = new Set(['quotaLimitReached']);
const THROTTLE_REASONS = new Set(['activityLimitReached', 'throttledRequest', 'tooManyRequests']);
const MAX_ERROR_BODY = 64 * 1024;
const DEFAULT_RETRY = { attempts: 5, baseMs: 250, maxMs: 8000 };
const DEFAULT_RETRY_AFTER_CAP_MS = 120_000;
/** OneDrive fragments are multiples of 320 KiB (except the last). */
export const ONEDRIVE_CHUNK_ALIGN = 320 * 1024;
const ITEM_FIELDS = 'id,name,size,file,folder';

/** The hosts Graph hands pre-authenticated upload and download URLs on (Microsoft's own); anything else is refused. */
export const ONEDRIVE_TRANSFER_HOST_SUFFIXES: readonly string[] = [
  '.sharepoint.com', '.onedrive.com', '.live.com', '.1drv.com', '.microsoftpersonalcontent.com', '.office.com', '.office365.com', '.microsoft.com',
];

export const ONEDRIVE_REAUTH_MESSAGE = 'OneDrive access was revoked or has expired; connect the OneDrive destination again (dude-hub backup destination add --kind onedrive).';

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
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* best effort */ } throw new DestinationError('server', 'The OneDrive response was larger than expected.'); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DestinationError) throw error;
    throw new Transport('network');
  }
  return Buffer.concat(chunks).toString('utf8');
}

function toFile(json: unknown): OneDriveFileInfo | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const record = json as Record<string, unknown>;
  const id = record['id'];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_!.-]{1,200}$/.test(id)) return undefined;
  const size = record['size'] === undefined ? 0 : Number(record['size']);
  if (!Number.isSafeInteger(size) || size < 0) return undefined;
  const hashes = (typeof record['file'] === 'object' && record['file'] !== null ? (record['file'] as { hashes?: unknown }).hashes : undefined) as Record<string, unknown> | undefined;
  const hex = (value: unknown, length: number): string | undefined => (typeof value === 'string' && value.length === length && /^[0-9a-fA-F]+$/.test(value) ? value.toLowerCase() : undefined);
  return { id, name: typeof record['name'] === 'string' ? record['name'] : '', size, sha1: hex(hashes?.['sha1Hash'], 40), sha256: hex(hashes?.['sha256Hash'], 64) };
}

/** Whether a driveItem is a file (a name collision with a folder is not an object). */
const isFileItem = (json: unknown): boolean => typeof json === 'object' && json !== null && typeof (json as { file?: unknown }).file === 'object' && (json as { file?: unknown }).file !== null;

function parseFile(text: string): OneDriveFileInfo | undefined {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return undefined; }
  return toFile(json);
}

/** The error code Graph names in an error body, only when it is a short plain token. */
function reasonOf(text: string): string | undefined {
  try {
    const json = JSON.parse(text) as { error?: { code?: unknown } };
    const code = json.error?.code;
    return typeof code === 'string' && /^[A-Za-z]{1,64}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

/** The first byte a session still expects, from `nextExpectedRanges` (`["26-"]`, `["26-127"]`); null when it names none. */
function expectedFrom(text: string): number | null {
  try {
    const ranges = (JSON.parse(text) as { nextExpectedRanges?: unknown }).nextExpectedRanges;
    if (!Array.isArray(ranges) || ranges.length === 0 || typeof ranges[0] !== 'string') return null;
    const match = /^(\d+)-/.exec(ranges[0]);
    return match === null ? null : Number(match[1]);
  } catch {
    return null;
  }
}

export class OneDriveClient {
  readonly folderId: string;
  private readonly endpoints: OneDriveEndpoints;
  private readonly graphOrigin: string;
  private readonly fetchImpl: OneDriveFetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly retry: { attempts: number; baseMs: number; maxMs: number };
  private readonly retryAfterCapMs: number;
  private readonly idleTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly credentials: { clientId: string; clientSecret: string; refreshToken: string };
  private readonly onRefreshToken: ((refreshToken: string) => void) | undefined;
  private readonly latestRefreshToken: (() => string | undefined) | undefined;
  private token: { value: string; expiresAt: number } | undefined;
  private refreshing: Promise<string> | undefined;
  private readonly ensuredDirs = new Set<string>();

  constructor(options: OneDriveClientOptions) {
    this.folderId = options.folderId;
    this.endpoints = options.endpoints ?? MICROSOFT_ONEDRIVE_ENDPOINTS;
    this.graphOrigin = new URL(this.endpoints.graphBase).origin;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.retryAfterCapMs = options.retryAfterCapMs ?? DEFAULT_RETRY_AFTER_CAP_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5 * 60_000;
    this.credentials = { clientId: options.clientId, clientSecret: options.clientSecret, refreshToken: options.refreshToken };
    this.onRefreshToken = options.onRefreshToken;
    this.latestRefreshToken = options.latestRefreshToken;
  }

  // ---- authorization -----------------------------------------------------------------------------------------------------------------------

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token !== undefined && this.token.expiresAt - this.now() > 60_000) return this.token.value;
    this.refreshing ??= this.refresh().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    let last: DestinationError | undefined;
    let adoptedStored = false;
    for (let attempt = 0; attempt < this.retry.attempts; attempt += 1) {
      const result = await refreshOneDriveAccessToken({ fetch: this.fetchImpl, endpoints: this.endpoints, ...this.credentials });
      if (result.status === 'ok') {
        // The rotated token is stored BEFORE the old one is forgotten; a failed store leaves the old one valid at Microsoft, and the new one keeps working here.
        if (result.refreshToken !== undefined && result.refreshToken !== this.credentials.refreshToken) {
          this.credentials.refreshToken = result.refreshToken;
          try { this.onRefreshToken?.(result.refreshToken); } catch { /* the in-memory copy carries on */ }
        }
        this.token = { value: result.accessToken, expiresAt: this.now() + result.expiresInSeconds * 1000 };
        return result.accessToken;
      }
      if (result.status === 'revoked') {
        // A sibling client (another open of this destination) may have rotated the token since this one was built: look once.
        const stored = adoptedStored ? undefined : this.latestRefreshToken?.();
        adoptedStored = true;
        if (stored !== undefined && stored !== this.credentials.refreshToken) { this.credentials.refreshToken = stored; attempt -= 1; continue; }
        throw new DestinationError('reauth', ONEDRIVE_REAUTH_MESSAGE);
      }
      if (result.status === 'rejected') throw new DestinationError('auth', 'Microsoft refused the OAuth client (check the client id and secret, and that the app registration allows personal accounts).');
      last = new DestinationError(result.status === 'unreachable' ? 'network' : 'server', 'Microsoft could not refresh the OneDrive access token.');
      await this.backoff(attempt, undefined);
    }
    throw last ?? new DestinationError('network', 'Microsoft could not refresh the OneDrive access token.');
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
    if (status === 507 || (reason !== undefined && QUOTA_REASONS.has(reason))) return 'quota';
    if (status === 429 || status === 509 || (reason !== undefined && THROTTLE_REASONS.has(reason))) return 'throttled';
    if (status === 409 && reason === 'nameAlreadyExists') return 'exists';
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'unavailable';
    if (status === 408) return 'timeout';
    if (status >= 500) return 'server';
    return 'rejected';
  }

  private async backoff(attempt: number, retryAfterMs: number | undefined): Promise<void> {
    if (attempt + 1 >= this.retry.attempts) return;
    const exp = Math.min(this.retry.maxMs, this.retry.baseMs * 2 ** attempt);
    const wait = retryAfterMs !== undefined ? Math.min(this.retryAfterCapMs, retryAfterMs) : Math.round(exp * (0.5 + this.random() / 2));
    await this.sleep(wait);
  }

  private retryAfter(headers: Headers): number | undefined {
    const seconds = Number(headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
  }

  private fail(op: string, status: number, code: DestinationErrorCode): DestinationError {
    const detail = status === 0 ? code : String(status);
    const message = code === 'quota' ? `The OneDrive is full or its quota is spent (${op} failed, ${detail}).`
      : code === 'auth' ? `OneDrive refused the request (${op} failed, ${detail}); the connection may need to be made again.`
        : code === 'unavailable' ? `The OneDrive folder or file was not found (${op} failed, ${detail}).`
          : code === 'exists' ? 'A backup object with that name already exists.'
            : `OneDrive ${op} failed (${detail}).`;
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
      if (RETRY_STATUSES.has(status) && spec.single !== true) {
        await this.backoff(attempt, this.retryAfter(sent.headers));
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

  /** A Graph URL for the item at a repository-relative name under the folder (`items/{folder}:/{name}`; names are the closed object-name set). */
  private itemUrl(name: string): string {
    if (!/^[A-Za-z0-9/._-]{1,128}$/.test(name)) throw new DestinationError('bad-name', 'A backup object name is not allowed.');
    return `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(this.folderId)}:/${name.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** A pre-authenticated URL Graph returned (an upload session, a download URL): Microsoft's own https file hosts only. */
  private transferUrl(raw: unknown): string {
    let url: URL;
    try { url = new URL(typeof raw === 'string' ? raw : ''); } catch { throw new DestinationError('server', 'OneDrive returned no transfer address.'); }
    const host = url.hostname.toLowerCase();
    const onGraph = url.origin === this.graphOrigin;
    const microsoftHost = url.protocol === 'https:' && !/^[\d.]+$/.test(host) && !host.includes(':') && ONEDRIVE_TRANSFER_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
    if (url.username !== '' || url.password !== '' || !(onGraph || microsoftHost)) throw new DestinationError('bad-endpoint', 'OneDrive returned a transfer address on an unexpected host.');
    return url.toString();
  }

  // ---- folder and files --------------------------------------------------------------------------------------------------------------------

  /** Creates a folder inside the app folder (the Hub's own folder that holds the repository); returns its id. A name in use gets a numeric suffix. */
  async createFolder(name: string): Promise<string> {
    const { text } = await this.json({
      op: 'create-folder', method: 'POST', url: `${this.endpoints.graphBase}/me/drive/special/approot/children?$select=id`,
      headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
    const file = parseFile(text);
    if (file === undefined) throw new DestinationError('server', 'OneDrive create-folder returned no folder id.');
    return file.id;
  }

  /** Whether the configured folder exists, is a folder and is not deleted. */
  async folderUsable(): Promise<boolean> {
    const sent = await this.request({ op: 'get-folder', method: 'GET', url: `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(this.folderId)}?$select=id,folder,deleted`, passthrough: [404] });
    if (sent.status === 404) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } sent.clearTimer(); return false; }
    const text = await readText(sent.response, MAX_ERROR_BODY).finally(() => sent.clearTimer());
    try {
      const json = JSON.parse(text) as { folder?: unknown; deleted?: unknown };
      return typeof json.folder === 'object' && json.folder !== null && json.deleted === undefined;
    } catch {
      return false;
    }
  }

  /** Makes sure a top-level directory of the repository (`packs`, `manifests`) exists; cached per client, a name in use is fine. */
  async ensureDir(dir: string): Promise<void> {
    if (this.ensuredDirs.has(dir)) return;
    const sent = await this.request({
      op: 'ensure-dir', method: 'POST', url: `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(this.folderId)}/children?$select=id`,
      headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ name: dir, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }), passthrough: [409],
    });
    try { await sent.response.body?.cancel(); } catch { /* best effort */ }
    sent.clearTimer();
    this.ensuredDirs.add(dir);
  }

  /** The file with exactly this (repository-relative) name, as zero or one entries. A folder under the name is not an object. */
  async findByName(name: string): Promise<OneDriveFileInfo[]> {
    const sent = await this.request({ op: 'find', method: 'GET', url: `${this.itemUrl(name)}?$select=${ITEM_FIELDS}`, passthrough: [404] });
    if (sent.status === 404) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } sent.clearTimer(); return []; }
    let text: string;
    try { text = await readText(sent.response, 8 * 1024 * 1024); } catch (error) { if (error instanceof Transport) throw this.fail('find', 0, error.kind); throw error; } finally { sent.clearTimer(); }
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new DestinationError('server', 'OneDrive returned an unreadable item.'); }
    const file = isFileItem(json) ? toFile(json) : undefined;
    return file === undefined ? [] : [file];
  }

  /** Every file in the repository directory `dir` (`packs`, `manifests`) whose name starts with `namePrefix`, following `@odata.nextLink`. Names come back repository-relative. */
  async list(dir: string, namePrefix: string): Promise<OneDriveFileInfo[]> {
    if (!/^[a-z]{1,32}$/.test(dir)) throw new DestinationError('bad-name', 'A backup object prefix is not allowed.');
    const out: OneDriveFileInfo[] = [];
    let url: string | undefined = `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(this.folderId)}:/${dir}:/children?$select=${ITEM_FIELDS}&$top=200`;
    for (let page = 0; page < 100_000 && url !== undefined; page += 1) {
      const sent: Sent = await this.request({ op: 'list', method: 'GET', url, passthrough: [404] });
      if (sent.status === 404) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } sent.clearTimer(); return out; }
      let text: string;
      try { text = await readText(sent.response, 8 * 1024 * 1024); } catch (error) { if (error instanceof Transport) throw this.fail('list', 0, error.kind); throw error; } finally { sent.clearTimer(); }
      let json: { value?: unknown; '@odata.nextLink'?: unknown };
      try { json = JSON.parse(text) as typeof json; } catch { throw new DestinationError('server', 'OneDrive returned an unreadable listing.'); }
      if (Array.isArray(json.value)) {
        for (const entry of json.value) {
          const file = isFileItem(entry) ? toFile(entry) : undefined;
          if (file !== undefined) { const name = `${dir}/${file.name}`; if (name.startsWith(namePrefix)) out.push({ ...file, name }); }
        }
      }
      const next = json['@odata.nextLink'];
      if (typeof next !== 'string' || next.length === 0) return out;
      if (next.length > 8192 || next === url) throw new DestinationError('server', 'OneDrive listing pagination did not advance.');
      let nextUrl: URL;
      try { nextUrl = new URL(next); } catch { throw new DestinationError('server', 'OneDrive returned an unreadable listing link.'); }
      if (nextUrl.origin !== this.graphOrigin) throw new DestinationError('bad-endpoint', 'OneDrive returned a listing link on another host.');
      url = nextUrl.toString();
    }
    throw new DestinationError('server', 'OneDrive listing returned too many pages.');
  }

  /** Deletes a file (OneDrive moves it to the recycle bin); idempotent. */
  async delete(fileId: string): Promise<void> {
    const sent = await this.request({ op: 'delete', method: 'DELETE', url: `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(fileId)}`, passthrough: [404] });
    try { await sent.response.body?.cancel(); } catch { /* best effort */ }
    sent.clearTimer();
  }

  /** Storage quota of the signed-in account (`limit` is null when OneDrive does not say). */
  async about(): Promise<OneDriveQuota> {
    const { text } = await this.json({ op: 'about', method: 'GET', url: `${this.endpoints.graphBase}/me/drive?$select=quota` });
    try {
      const q = (JSON.parse(text) as { quota?: { total?: unknown; used?: unknown } }).quota;
      const num = (v: unknown): number | null => { const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN; return Number.isSafeInteger(n) && n >= 0 ? n : null; };
      return { limit: num(q?.total), usage: num(q?.used) };
    } catch {
      return { limit: null, usage: null };
    }
  }

  // ---- resumable upload --------------------------------------------------------------------------------------------------------------------

  /** Opens an upload session for a new file at the repository-relative `name` (an existing name is refused at the end); returns the pre-authenticated session. */
  async startUpload(name: string): Promise<OneDriveUploadSession> {
    const slash = name.indexOf('/');
    if (slash > 0) await this.ensureDir(name.slice(0, slash));
    const { text } = await this.json({
      op: 'start-upload', method: 'POST', url: `${this.itemUrl(name)}:/createUploadSession`,
      headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'fail' } }),
    });
    let uploadUrl: unknown;
    try { uploadUrl = (JSON.parse(text) as { uploadUrl?: unknown }).uploadUrl; } catch { /* handled below */ }
    return { url: this.transferUrl(uploadUrl), name };
  }

  /** The object an expired or finished session left under the name, when it is the file of `total` bytes this upload was sending. */
  private async finishedBy(name: string, total: number): Promise<OneDriveFileInfo | undefined> {
    const file = (await this.findByName(name))[0];
    return file !== undefined && file.size === total ? file : undefined;
  }

  private async sessionState(session: OneDriveUploadSession, total: number): Promise<{ complete: true; file: OneDriveFileInfo } | { complete: false; received: number }> {
    for (let attempt = 0; attempt < this.retry.attempts; attempt += 1) {
      let sent: Sent;
      try {
        sent = await this.send({ op: 'upload-status', method: 'GET', url: session.url, preauthorized: true }, undefined);
      } catch (error) {
        if (!(error instanceof Transport)) throw error;
        await this.backoff(attempt, undefined);
        continue;
      }
      try {
        if (sent.status === 200) {
          const received = expectedFrom(await readText(sent.response, MAX_ERROR_BODY));
          if (received === null) throw new DestinationError('server', 'OneDrive returned an unreadable upload status.');
          return { complete: false, received };
        }
        if (sent.status === 404 || sent.status === 410) {
          // A finished session is gone: the object under the name says whether the last fragment landed.
          const file = await this.finishedBy(session.name, total);
          if (file !== undefined) return { complete: true, file };
          throw new DestinationError('server', 'The OneDrive upload session expired.');
        }
        if (RETRY_STATUSES.has(sent.status)) { await this.backoff(attempt, this.retryAfter(sent.headers)); continue; }
        throw this.fail('upload-status', sent.status, this.codeOf(sent.status, undefined));
      } catch (error) {
        if (error instanceof Transport) { await this.backoff(attempt, undefined); continue; }
        throw error;
      } finally {
        try { await sent.response.body?.cancel(); } catch { /* best effort */ }
        sent.clearTimer();
      }
    }
    throw new DestinationError('network', 'The OneDrive upload session could not be queried.');
  }

  /**
   * Sends `bytes` (the bytes at `offset` of the object of `total` bytes) to the session. The last fragment (it ends at `total`) creates
   * the file and returns it; any other must be a multiple of 320 KiB and the session must acknowledge all of it. A failed attempt asks
   * the session which ranges it still expects (never assumes) and sends only those; the loop is bounded.
   */
  async uploadChunk(session: OneDriveUploadSession, bytes: Uint8Array, offset: number, total: number): Promise<ChunkResult> {
    const end = offset + bytes.length;
    if (bytes.length === 0 || end > total) throw new DestinationError('rejected', 'A OneDrive upload fragment must hold bytes inside the object.');
    if (end < total && bytes.length % ONEDRIVE_CHUNK_ALIGN !== 0) throw new DestinationError('rejected', 'A OneDrive upload fragment must be a multiple of 320 KiB.');
    let from = offset;
    let failures = 0;
    for (let round = 0; round < this.retry.attempts * 4; round += 1) {
      const slice = bytes.subarray(from - offset);
      const range = `bytes ${from}-${end - 1}/${total}`;
      let outcome: 'retry' | ChunkResult | undefined;
      try {
        const sent = await this.send({ op: 'upload-chunk', method: 'PUT', url: session.url, headers: { 'content-range': range, 'content-type': 'application/octet-stream' }, body: slice, preauthorized: true }, undefined);
        try {
          if (sent.status === 200 || sent.status === 201) {
            const file = parseFile(await readText(sent.response, MAX_ERROR_BODY));
            if (file === undefined) throw new DestinationError('server', 'OneDrive returned an unreadable upload result.');
            if (end < total) throw new DestinationError('mismatch', 'OneDrive finished an upload before its last fragment.');
            outcome = { done: true, file };
          } else if (sent.status === 202) {
            const received = expectedFrom(await readText(sent.response, MAX_ERROR_BODY));
            if (received === null) { failures += 1; outcome = 'retry'; }
            else if (received >= end) { if (end === total) { failures += 1; outcome = 'retry'; } else outcome = { done: false }; } // the final fragment is stored but no file was reported: ask the session
            else if (received < offset) throw new DestinationError('server', 'The OneDrive upload session lost data.');
            else { from = received; outcome = 'retry'; failures = 0; }
          } else if (sent.status === 404 || sent.status === 410 || sent.status === 416) {
            failures += 1; // the answer was lost, the fragment arrived twice, or the session ended: the session (or the object under the name) says
            outcome = 'retry';
          } else {
            let reason: string | undefined;
            try { reason = reasonOf(await readText(sent.response, MAX_ERROR_BODY)); } catch { /* the status decides */ }
            if (!RETRY_STATUSES.has(sent.status)) throw this.fail('upload-chunk', sent.status, this.codeOf(sent.status, reason));
            failures += 1;
            if (failures >= this.retry.attempts) throw this.fail('upload-chunk', sent.status, this.codeOf(sent.status, reason));
            await this.backoff(failures - 1, this.retryAfter(sent.headers));
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
        if (failures >= this.retry.attempts * 2) throw new DestinationError('server', 'The OneDrive upload did not make progress.');
        const state = await this.sessionState(session, total);
        if (state.complete) return { done: true, file: state.file };
        if (state.received < offset) throw new DestinationError('server', 'The OneDrive upload session lost data.');
        if (end < total && state.received >= end) return { done: false };
        from = Math.min(state.received, end);
      }
    }
    throw new DestinationError('server', 'The OneDrive upload did not make progress.');
  }

  /** Uploads a whole object of any size in one request, refusing an existing name (an empty object, which an upload session cannot carry). */
  async putSmall(name: string, bytes: Uint8Array): Promise<OneDriveFileInfo> {
    const slash = name.indexOf('/');
    if (slash > 0) await this.ensureDir(name.slice(0, slash));
    const sent = await this.request({
      op: 'put', method: 'PUT', url: `${this.itemUrl(name)}:/content?@microsoft.graph.conflictBehavior=fail&$select=${ITEM_FIELDS}`,
      headers: { 'content-type': 'application/octet-stream' }, body: bytes, passthrough: [409],
    });
    let text: string;
    try { text = await readText(sent.response, MAX_ERROR_BODY); } catch (error) { if (error instanceof Transport) throw this.fail('put', 0, error.kind); throw error; } finally { sent.clearTimer(); }
    if (sent.status === 409) {
      // Either a name in use, or an earlier attempt of this very call that landed before its answer was lost.
      const present = (await this.findByName(name))[0];
      if (present !== undefined && present.size === bytes.length) return present;
      throw this.fail('put', 409, 'exists');
    }
    const file = parseFile(text);
    if (file === undefined) throw new DestinationError('server', 'OneDrive returned an unreadable upload result.');
    return file;
  }

  /** Abandons a session (best effort: an unfinished session creates no file and expires on its own). */
  async cancelUpload(session: OneDriveUploadSession): Promise<void> {
    try {
      const sent = await this.send({ op: 'cancel-upload', method: 'DELETE', url: session.url, preauthorized: true }, undefined);
      try { await sent.response.body?.cancel(); } catch { /* best effort */ }
      sent.clearTimer();
    } catch { /* the session expires by itself */ }
  }

  /** Replaces the content of an existing file in one request (the repository object, a few hundred bytes). */
  async updateContent(fileId: string, bytes: Uint8Array): Promise<OneDriveFileInfo> {
    const { text } = await this.json({
      op: 'update', method: 'PUT', url: `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(fileId)}/content?$select=${ITEM_FIELDS}`,
      headers: { 'content-type': 'application/octet-stream' }, body: bytes,
    });
    const file = parseFile(text);
    if (file === undefined) throw new DestinationError('server', 'OneDrive returned an unreadable update result.');
    return file;
  }

  // ---- download ----------------------------------------------------------------------------------------------------------------------------

  /**
   * Streams a file from `start`; null when it does not exist. The bytes come from the item's short-lived pre-authenticated download URL
   * (asked for afresh on every call, so a resume after an hour still works), with a `Range` request and no bearer. The caller consumes
   * or destroys the body.
   */
  async download(fileId: string, start: number): Promise<OneDriveDownload | null> {
    const meta = await this.request({ op: 'download-url', method: 'GET', url: `${this.endpoints.graphBase}/me/drive/items/${encodeURIComponent(fileId)}?$select=id,size,@microsoft.graph.downloadUrl`, passthrough: [404] });
    if (meta.status === 404) { try { await meta.response.body?.cancel(); } catch { /* best effort */ } meta.clearTimer(); return null; }
    let downloadUrl: unknown;
    try {
      downloadUrl = (JSON.parse(await readText(meta.response, MAX_ERROR_BODY)) as Record<string, unknown>)['@microsoft.graph.downloadUrl'];
    } catch (error) {
      if (error instanceof DestinationError) throw error;
      if (error instanceof Transport) throw this.fail('download-url', 0, error.kind);
      throw new DestinationError('server', 'OneDrive returned an unreadable download address.');
    } finally { meta.clearTimer(); }
    const url = this.transferUrl(downloadUrl);
    const headers: Record<string, string> = {};
    if (start > 0) headers['range'] = `bytes=${start}-`;
    const sent = await this.request({ op: 'download', method: 'GET', url, headers, passthrough: [404, 416], stream: true, preauthorized: true });
    if (sent.status === 404) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } return null; }
    if (sent.status === 416) { try { await sent.response.body?.cancel(); } catch { /* best effort */ } return { status: 416, total: undefined, body: (async function* () { /* empty */ })(), destroy: () => undefined }; }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(sent.headers.get('content-range') ?? '');
    const length = Number(sent.headers.get('content-length'));
    let total: number | undefined;
    if (range !== null) total = Number(range[3]);
    else if (sent.status === 200 && Number.isSafeInteger(length)) total = length;
    if (start > 0 && sent.status !== 206) {
      try { await sent.response.body?.cancel(); } catch { /* best effort */ }
      throw new DestinationError('rejected', 'OneDrive ignored a Range request.');
    }
    if (sent.status === 206 && range !== null && Number(range[1]) !== start) {
      try { await sent.response.body?.cancel(); } catch { /* best effort */ }
      throw new DestinationError('mismatch', 'OneDrive answered a different range than requested.');
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
