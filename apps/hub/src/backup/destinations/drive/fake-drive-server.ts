import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { codeChallengeS256 } from '../../../auth/oidc/pkce.js';
import { DRIVE_FILE_SCOPE } from '../../../hub/drive-oauth.js';
import type { DriveEndpoints } from '../../../hub/drive-oauth.js';

/**
 * Spec-only: an in-process fake of the subset of Google's OAuth and Drive v3 REST the destination uses (never imported by production
 * code): authorization-code with PKCE (the consent URL is "approved" by `authorize`), refresh and revoke; folders; resumable upload
 * sessions with `Content-Range`, the 308 `Range` acknowledgement, a status query and the 256 KiB alignment rule; ranged media GET;
 * listing with `pageToken`; update; delete; `about`. It implements the `drive.file` rule that matters here: it only knows the files and
 * folders created through it. Failures are injected per request (`fail`): a status with a Drive error `reason`, `Retry-After`, a dropped
 * connection before or after the request took effect, a truncated download, and a storage quota.
 */
export interface FakeDriveOptions {
  clientId?: string;
  clientSecret?: string;
  /** Pages are at most this long (default 1000, as Drive). */
  maxPageSize?: number;
  /** Total bytes the account may hold; a finished upload past it is `403 storageQuotaExceeded`. */
  quotaBytes?: number;
  /** Refuse a non-final chunk that is not a multiple of 256 KiB (default true). */
  strictAlignment?: boolean;
  now?: () => number;
}

export interface RecordedDriveRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  bodyBytes: number;
}

export type DriveFault =
  | { kind: 'status'; status: number; reason?: string; retryAfter?: number; oauthError?: string }
  /** Close the connection without answering, before the request took effect. */
  | { kind: 'drop' }
  /** Let the request take effect, then close the connection without answering. */
  | { kind: 'drop-after' }
  /** A media GET: send half the bytes, then close the connection. */
  | { kind: 'truncate' }
  /** Answer with a wrong MD5 in the created file's metadata. */
  | { kind: 'wrong-md5' };

interface FaultEntry { match: (request: RecordedDriveRequest) => boolean; fault: DriveFault; remaining: number; skip: number }
interface StoredFile { id: string; name: string; mime: string; parents: string[]; bytes: Buffer }
interface Session { id: string; name: string; parents: string[]; received: Buffer; fileId?: string }

const ALIGN = 256 * 1024;
const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

export class FakeDriveServer {
  readonly options: Required<Omit<FakeDriveOptions, 'quotaBytes'>> & { quotaBytes: number | null };
  readonly files = new Map<string, StoredFile>();
  readonly sessions = new Map<string, Session>();
  readonly requests: RecordedDriveRequest[] = [];
  /** Requests refused for a missing, expired or unknown access token. */
  authFailures = 0;
  tokenRefreshes = 0;
  readonly refreshTokens = new Map<string, { revoked: boolean }>();
  readonly revoked: string[] = [];
  private readonly accessTokens = new Map<string, number>();
  private readonly codes = new Map<string, { challenge: string; redirectUri: string; clientId: string }>();
  private readonly faults: FaultEntry[] = [];
  private server: http.Server | undefined;
  private origin = '';
  private counter = 0;
  accessTokenTtlSeconds = 3600;

  constructor(options: FakeDriveOptions = {}) {
    this.options = {
      clientId: options.clientId ?? 'fake-client-id.apps.example.com', clientSecret: options.clientSecret ?? 'GOCSPX-fake-client-secret-0123456789',
      maxPageSize: options.maxPageSize ?? 1000, strictAlignment: options.strictAlignment ?? true, now: options.now ?? Date.now, quotaBytes: options.quotaBytes ?? null,
    };
  }

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => { void this.handle(req, res); });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.origin = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.origin;
  }

  async close(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => { if (this.server === undefined) resolve(); else this.server.close(() => resolve()); });
  }

  endpoints(): DriveEndpoints {
    return { authUrl: `${this.origin}/o/oauth2/v2/auth`, tokenUrl: `${this.origin}/token`, revokeUrl: `${this.origin}/revoke`, apiBase: `${this.origin}/drive/v3`, uploadBase: `${this.origin}/upload/drive/v3` };
  }

  /** Injects `fault` into the next `times` requests that match, after skipping `skip` matches. */
  fail(match: (request: RecordedDriveRequest) => boolean, fault: DriveFault, times = 1, skip = 0): void {
    this.faults.push({ match, fault, remaining: times, skip });
  }

  /** The owner approving a consent URL in the browser: checks it as Google would and returns where the browser is sent next. */
  authorize(authorizationUrl: string, options: { deny?: boolean } = {}): { redirect: string; code: string; state: string } | { error: string } {
    const url = new URL(authorizationUrl);
    const q = url.searchParams;
    if (q.get('client_id') !== this.options.clientId) return { error: 'invalid_client' };
    if (q.get('scope') !== DRIVE_FILE_SCOPE) return { error: 'invalid_scope' };
    if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || (q.get('code_challenge') ?? '').length < 43) return { error: 'invalid_request' };
    const redirectUri = q.get('redirect_uri') ?? '';
    const state = q.get('state') ?? '';
    if (options.deny === true) return { redirect: `${redirectUri}?error=access_denied&state=${encodeURIComponent(state)}`, code: '', state };
    const code = `4/${randomBytes(24).toString('base64url')}`;
    this.codes.set(code, { challenge: q.get('code_challenge')!, redirectUri, clientId: q.get('client_id')! });
    return { redirect: `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(DRIVE_FILE_SCOPE)}`, code, state };
  }

  /** A refresh token as a completed consent would have produced (specs that skip the browser). */
  issueRefreshToken(): string {
    const token = `1//0g${randomBytes(24).toString('base64url')}`;
    this.refreshTokens.set(token, { revoked: false });
    return token;
  }

  /** The owner revoking the app in their Google account. */
  revokeAll(): void {
    for (const entry of this.refreshTokens.values()) entry.revoked = true;
    this.accessTokens.clear();
  }

  expireAccessTokens(): void { this.accessTokens.clear(); }

  createFolder(name = 'DUDE Hub backups'): string {
    const id = this.newId();
    this.files.set(id, { id, name, mime: 'application/vnd.google-apps.folder', parents: [], bytes: Buffer.alloc(0) });
    return id;
  }

  /** Names and sizes of the (non-folder) files inside `folderId`, as the sorted object listing a repository would show. */
  names(folderId: string): string[] {
    return [...this.files.values()].filter((f) => f.parents.includes(folderId)).map((f) => f.name).sort();
  }

  find(folderId: string, name: string): StoredFile[] {
    return [...this.files.values()].filter((f) => f.parents.includes(folderId) && f.name === name);
  }

  count(match: (request: RecordedDriveRequest) => boolean): number { return this.requests.filter(match).length; }

  private newId(): string { this.counter += 1; return `fid${String(this.counter).padStart(6, '0')}${randomBytes(6).toString('hex')}`; }

  private takeFault(request: RecordedDriveRequest): DriveFault | undefined {
    for (const entry of this.faults) {
      if (entry.remaining <= 0 || !entry.match(request)) continue;
      if (entry.skip > 0) { entry.skip -= 1; continue; }
      entry.remaining -= 1;
      return entry.fault;
    }
    return undefined;
  }

  private authorized(request: RecordedDriveRequest): boolean {
    const header = request.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    const expires = this.accessTokens.get(token);
    return expires !== undefined && expires > this.options.now();
  }

  private json(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=UTF-8', 'content-length': String(Buffer.byteLength(text)), ...headers });
    res.end(text);
  }

  private driveError(res: http.ServerResponse, status: number, reason: string, headers: Record<string, string> = {}): void {
    this.json(res, status, { error: { code: status, message: `fake drive error ${reason}`, errors: [{ domain: 'global', reason, message: 'fake' }] } }, headers);
  }

  private fileJson(file: StoredFile, wrongMd5 = false): Record<string, unknown> {
    return { id: file.id, name: file.name, mimeType: file.mime, size: String(file.bytes.length), md5Checksum: wrongMd5 ? '0'.repeat(32) : md5(file.bytes) };
  }

  private used(): number { return [...this.files.values()].reduce((sum, f) => sum + f.bytes.length, 0); }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.origin);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const recorded: RecordedDriveRequest = { method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers, bodyBytes: body.length };
    this.requests.push(recorded);
    const fault = this.takeFault(recorded);
    if (fault?.kind === 'drop') { req.socket.destroy(); return; }
    if (fault?.kind === 'status') {
      const headers: Record<string, string> = fault.retryAfter !== undefined ? { 'retry-after': String(fault.retryAfter) } : {};
      if (fault.oauthError !== undefined) this.json(res, fault.status, { error: fault.oauthError }, headers);
      else this.driveError(res, fault.status, fault.reason ?? 'backendError', headers);
      return;
    }
    const dropAfter = fault?.kind === 'drop-after';
    const respond = (status: number, payload: unknown, headers: Record<string, string> = {}): void => {
      if (dropAfter) { req.socket.destroy(); return; }
      this.json(res, status, payload, headers);
    };
    try {
      await this.route(req, res, url, body, recorded, fault, respond);
    } catch {
      if (!res.headersSent) this.driveError(res, 500, 'internalError');
    }
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse, url: URL, body: Buffer, recorded: RecordedDriveRequest, fault: DriveFault | undefined, respond: (status: number, payload: unknown, headers?: Record<string, string>) => void): Promise<void> {
    const { pathname } = url;
    const method = req.method ?? 'GET';

    // ---- OAuth ------------------------------------------------------------------------------------------------------------------------
    if (method === 'POST' && pathname === '/token') {
      const form = new URLSearchParams(body.toString('utf8'));
      if (form.get('client_id') !== this.options.clientId || form.get('client_secret') !== this.options.clientSecret) { this.json(res, 401, { error: 'invalid_client' }); return; }
      if (form.get('grant_type') === 'authorization_code') {
        const code = this.codes.get(form.get('code') ?? '');
        this.codes.delete(form.get('code') ?? '');
        if (code === undefined || code.redirectUri !== form.get('redirect_uri') || codeChallengeS256(form.get('code_verifier') ?? '') !== code.challenge) { this.json(res, 400, { error: 'invalid_grant' }); return; }
        const refresh = `1//0g${randomBytes(24).toString('base64url')}`;
        this.refreshTokens.set(refresh, { revoked: false });
        const access = `ya29.${randomBytes(24).toString('base64url')}`;
        this.accessTokens.set(access, this.options.now() + this.accessTokenTtlSeconds * 1000);
        this.json(res, 200, { access_token: access, refresh_token: refresh, expires_in: this.accessTokenTtlSeconds, scope: DRIVE_FILE_SCOPE, token_type: 'Bearer' });
        return;
      }
      if (form.get('grant_type') === 'refresh_token') {
        const entry = this.refreshTokens.get(form.get('refresh_token') ?? '');
        if (entry === undefined || entry.revoked) { this.json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }); return; }
        this.tokenRefreshes += 1;
        const access = `ya29.${randomBytes(24).toString('base64url')}`;
        this.accessTokens.set(access, this.options.now() + this.accessTokenTtlSeconds * 1000);
        this.json(res, 200, { access_token: access, expires_in: this.accessTokenTtlSeconds, scope: DRIVE_FILE_SCOPE, token_type: 'Bearer' });
        return;
      }
      this.json(res, 400, { error: 'unsupported_grant_type' });
      return;
    }
    if (method === 'POST' && pathname === '/revoke') {
      const token = new URLSearchParams(body.toString('utf8')).get('token') ?? '';
      const entry = this.refreshTokens.get(token);
      if (entry === undefined) { this.json(res, 400, { error: 'invalid_token' }); return; }
      entry.revoked = true;
      this.revoked.push(token);
      this.json(res, 200, {});
      return;
    }

    // ---- an upload session (pre-authorized by its URL) -----------------------------------------------------------------------------------
    const sessionMatch = /^\/upload\/session\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if (sessionMatch !== null) {
      const session = this.sessions.get(sessionMatch[1]!);
      if (session === undefined) { this.driveError(res, 404, 'notFound'); return; }
      if (method === 'DELETE') { this.sessions.delete(session.id); res.writeHead(499); res.end(); return; }
      if (method !== 'PUT') { this.driveError(res, 405, 'methodNotAllowed'); return; }
      const range = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+|\*)$/.exec(String(req.headers['content-range'] ?? ''));
      if (range === null) { this.driveError(res, 400, 'badRequest'); return; }
      const total = range[3] === '*' ? undefined : Number(range[3]);
      const ack = (): void => {
        const headers: Record<string, string> = {};
        if (session.received.length > 0) headers['range'] = `bytes=0-${session.received.length - 1}`;
        res.writeHead(308, { ...headers, 'content-length': '0' });
        res.end();
      };
      if (range[1] === undefined) {
        // A status query (`bytes */total`) or an empty final chunk.
        if (body.length === 0 && total !== undefined && session.received.length === total && (session.received.length > 0 || session.fileId === undefined)) { this.finish(res, session, fault, respond); return; }
        if (session.fileId !== undefined) { respond(200, this.fileJson(this.files.get(session.fileId)!)); return; }
        ack();
        return;
      }
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (body.length !== end - start + 1) { this.driveError(res, 400, 'badRequest'); return; }
      if (start > session.received.length) { this.driveError(res, 400, 'badRequest'); return; }
      if (this.options.strictAlignment && total === undefined && body.length % ALIGN !== 0) { this.driveError(res, 400, 'badRequest'); return; }
      session.received = Buffer.concat([session.received, body.subarray(session.received.length - start)]);
      if (total !== undefined && session.received.length === total) { this.finish(res, session, fault, respond); return; }
      if (dropIf(fault, 'drop-after')) { req.socket.destroy(); return; }
      ack();
      return;
    }

    // ---- Drive REST (needs an access token) ---------------------------------------------------------------------------------------------
    if (!this.authorized(recorded)) {
      this.authFailures += 1;
      this.driveError(res, 401, 'authError');
      return;
    }
    if (method === 'POST' && pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'resumable') {
      let meta: { name?: unknown; parents?: unknown };
      try { meta = JSON.parse(body.toString('utf8')) as typeof meta; } catch { this.driveError(res, 400, 'badRequest'); return; }
      const parents = Array.isArray(meta.parents) ? (meta.parents as string[]) : [];
      if (typeof meta.name !== 'string' || parents.length !== 1 || !this.files.has(parents[0]!)) { this.driveError(res, 404, 'notFound'); return; }
      const id = randomBytes(12).toString('hex');
      this.sessions.set(id, { id, name: meta.name, parents, received: Buffer.alloc(0) });
      if (dropIf(fault, 'drop-after')) { req.socket.destroy(); return; }
      res.writeHead(200, { location: `${this.origin}/upload/session/${id}`, 'content-length': '0' });
      res.end();
      return;
    }
    const patchMatch = /^\/upload\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if (method === 'PATCH' && patchMatch !== null) {
      const file = this.files.get(patchMatch[1]!);
      if (file === undefined) { this.driveError(res, 404, 'notFound'); return; }
      file.bytes = Buffer.from(body);
      respond(200, this.fileJson(file, fault?.kind === 'wrong-md5'));
      return;
    }
    if (method === 'POST' && pathname === '/drive/v3/files') {
      const meta = JSON.parse(body.toString('utf8')) as { name?: unknown; mimeType?: unknown };
      if (typeof meta.name !== 'string' || meta.mimeType !== 'application/vnd.google-apps.folder') { this.driveError(res, 400, 'badRequest'); return; }
      respond(200, this.fileJson(this.files.get(this.createFolder(meta.name))!));
      return;
    }
    if (method === 'GET' && pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      const parent = /'([A-Za-z0-9_-]+)' in parents/.exec(q)?.[1];
      const name = /name = '([^']+)'/.exec(q)?.[1];
      const matches = [...this.files.values()].filter((f) => f.mime !== 'application/vnd.google-apps.folder' && (parent === undefined || f.parents.includes(parent)) && (name === undefined || f.name === name))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const size = Math.min(Number(url.searchParams.get('pageSize') ?? 100), this.options.maxPageSize);
      const offset = Number(url.searchParams.get('pageToken') ?? 0);
      const page = matches.slice(offset, offset + size);
      respond(200, { files: page.map((f) => this.fileJson(f)), ...(offset + size < matches.length ? { nextPageToken: String(offset + size) } : {}) });
      return;
    }
    if (method === 'GET' && pathname === '/drive/v3/about') {
      respond(200, { storageQuota: { ...(this.options.quotaBytes !== null ? { limit: String(this.options.quotaBytes) } : {}), usage: String(this.used()) } });
      return;
    }
    const fileMatch = /^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if (fileMatch !== null) {
      const file = this.files.get(fileMatch[1]!);
      if (method === 'DELETE') {
        if (file === undefined) { this.driveError(res, 404, 'notFound'); return; }
        this.files.delete(file.id);
        if (dropIf(fault, 'drop-after')) { req.socket.destroy(); return; }
        res.writeHead(204);
        res.end();
        return;
      }
      if (method === 'GET') {
        if (file === undefined) { this.driveError(res, 404, 'notFound'); return; }
        if (url.searchParams.get('alt') !== 'media') { respond(200, { ...this.fileJson(file), trashed: false }); return; }
        const range = /^bytes=(\d+)-$/.exec(String(req.headers['range'] ?? ''));
        const from = range === null ? 0 : Number(range[1]);
        if (from >= file.bytes.length && file.bytes.length > 0) { res.writeHead(416, { 'content-range': `bytes */${file.bytes.length}`, 'content-length': '0' }); res.end(); return; }
        const slice = file.bytes.subarray(from);
        const headers: Record<string, string | number> = { 'content-type': 'application/octet-stream', 'content-length': slice.length };
        if (range !== null) headers['content-range'] = `bytes ${from}-${file.bytes.length - 1}/${file.bytes.length}`;
        res.writeHead(range === null ? 200 : 206, headers);
        if (fault?.kind === 'truncate') { res.write(slice.subarray(0, Math.floor(slice.length / 2))); setTimeout(() => { req.socket.destroy(); }, 5); return; }
        res.end(slice);
        return;
      }
    }
    this.driveError(res, 404, 'notFound');
  }

  /** The last chunk landed: create the file (or refuse it for quota) and answer. */
  private finish(res: http.ServerResponse, session: Session, fault: DriveFault | undefined, respond: (status: number, payload: unknown, headers?: Record<string, string>) => void): void {
    if (session.fileId !== undefined) { respond(200, this.fileJson(this.files.get(session.fileId)!)); return; }
    if (this.options.quotaBytes !== null && this.used() + session.received.length > this.options.quotaBytes) { this.sessions.delete(session.id); this.driveError(res, 403, 'storageQuotaExceeded'); return; }
    const id = this.newId();
    const file: StoredFile = { id, name: session.name, mime: 'application/octet-stream', parents: session.parents, bytes: session.received };
    this.files.set(id, file);
    session.fileId = id;
    respond(200, this.fileJson(file, fault?.kind === 'wrong-md5'));
  }
}

const dropIf = (fault: DriveFault | undefined, kind: DriveFault['kind']): boolean => fault?.kind === kind;
