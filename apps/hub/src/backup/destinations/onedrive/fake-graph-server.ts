import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { codeChallengeS256 } from '../../../auth/oidc/pkce.js';
import { ONEDRIVE_SCOPE } from '../../../hub/onedrive-oauth.js';
import type { OneDriveEndpoints } from '../../../hub/onedrive-oauth.js';

/**
 * Spec-only: an in-process fake of the subset of Microsoft's identity platform and Graph REST the OneDrive destination uses (never
 * imported by production code): authorization-code with PKCE (the consent URL is "approved" by `authorize`) and refresh with token
 * ROTATION (a new refresh token on every refresh; `strictRotation` also kills the old one); the special app folder
 * (`/me/drive/special/approot`), folders, path addressing (`items/{id}:/a/b`), children listings with `@odata.nextLink`, `createUploadSession`
 * with `conflictBehavior: fail`, fragments with `Content-Range: bytes a-b/total` (320 KiB alignment, 202 with `nextExpectedRanges`, the
 * session status GET, 416 on a bad start), simple content PUT, item content replace, delete, the quota, and a pre-authenticated ranged
 * `downloadUrl`. It implements the app-folder rule that matters here: it only knows the items created through it. Failures are injected
 * per request (`fail`): a status with a Graph error `code`, `Retry-After`, a dropped connection before or after the request took
 * effect, a truncated download, a wrong hash in the created item, and a storage quota.
 */
export interface FakeGraphOptions {
  clientId?: string;
  clientSecret?: string;
  /** Children pages are at most this long (default 200, as Graph's usual page). */
  maxPageSize?: number;
  /** Total bytes the account may hold; a finished upload past it is `507 quotaLimitReached`. */
  quotaBytes?: number;
  /** Refuse a non-final fragment that is not a multiple of 320 KiB (default true). */
  strictAlignment?: boolean;
  /** A refresh kills the refresh token it used (default false: Microsoft leaves the old one valid for a while). */
  strictRotation?: boolean;
  /** Answer `createUploadSession` for a path whose parent folder is missing by creating it (Graph does for some endpoints; default false). */
  autoCreateParents?: boolean;
  /** The `scope` the token endpoint reports as granted (default: the app folder only). */
  grantedScope?: string;
  now?: () => number;
}

export interface RecordedGraphRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  bodyBytes: number;
}

export type GraphFault =
  | { kind: 'status'; status: number; code?: string; retryAfter?: number; oauthError?: string }
  /** Close the connection without answering, before the request took effect. */
  | { kind: 'drop' }
  /** Let the request take effect, then close the connection without answering. */
  | { kind: 'drop-after' }
  /** A download: send half the bytes, then close the connection. */
  | { kind: 'truncate' }
  /** Answer with a wrong SHA-1 and SHA-256 in the created item's metadata. */
  | { kind: 'wrong-hash' };

interface FaultEntry { match: (request: RecordedGraphRequest) => boolean; fault: GraphFault; remaining: number; skip: number }
export interface StoredItem { id: string; name: string; parentId: string | null; folder: boolean; bytes: Buffer }
interface Session { id: string; folderId: string; relPath: string; total: number | undefined; received: Buffer; conflictFail: boolean }

const ALIGN = 320 * 1024;
const sha1Upper = (bytes: Uint8Array): string => createHash('sha1').update(bytes).digest('hex').toUpperCase();
const sha256Upper = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').toUpperCase();

export class FakeGraphServer {
  readonly options: Required<Omit<FakeGraphOptions, 'quotaBytes'>> & { quotaBytes: number | null };
  readonly items = new Map<string, StoredItem>();
  readonly sessions = new Map<string, Session>();
  readonly requests: RecordedGraphRequest[] = [];
  /** Requests refused for a missing, expired or unknown access token. */
  authFailures = 0;
  tokenRefreshes = 0;
  /** Refresh tokens the token endpoint ever issued, and whether each is still honoured. */
  readonly refreshTokens = new Map<string, { revoked: boolean }>();
  /** Every refresh token presented to the token endpoint, in order (the rotation chain a spec asserts on). */
  readonly presentedRefreshTokens: string[] = [];
  readonly approotId: string;
  private readonly accessTokens = new Map<string, number>();
  private readonly codes = new Map<string, { challenge: string; redirectUri: string; clientId: string }>();
  private readonly faults: FaultEntry[] = [];
  private server: http.Server | undefined;
  private origin = '';
  private counter = 0;
  accessTokenTtlSeconds = 3600;

  constructor(options: FakeGraphOptions = {}) {
    this.options = {
      clientId: options.clientId ?? '11111111-2222-3333-4444-555555555555', clientSecret: options.clientSecret ?? 'fake~Client.Secret_Value-0123456789',
      maxPageSize: options.maxPageSize ?? 200, strictAlignment: options.strictAlignment ?? true, strictRotation: options.strictRotation ?? false,
      autoCreateParents: options.autoCreateParents ?? false, grantedScope: options.grantedScope ?? 'Files.ReadWrite.AppFolder', now: options.now ?? Date.now,
      quotaBytes: options.quotaBytes ?? null,
    };
    this.approotId = this.newId();
    this.items.set(this.approotId, { id: this.approotId, name: 'DUDE Spec App', parentId: null, folder: true, bytes: Buffer.alloc(0) });
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

  endpoints(): OneDriveEndpoints {
    return { authUrl: `${this.origin}/consumers/oauth2/v2.0/authorize`, tokenUrl: `${this.origin}/consumers/oauth2/v2.0/token`, graphBase: `${this.origin}/v1.0` };
  }

  /** Injects `fault` into the next `times` requests that match, after skipping `skip` matches. */
  fail(match: (request: RecordedGraphRequest) => boolean, fault: GraphFault, times = 1, skip = 0): void {
    this.faults.push({ match, fault, remaining: times, skip });
  }

  /** The owner approving a consent URL in the browser: checks it as Microsoft would and returns where the browser is sent next. */
  authorize(authorizationUrl: string, options: { deny?: boolean } = {}): { redirect: string; code: string; state: string } | { error: string } {
    const url = new URL(authorizationUrl);
    const q = url.searchParams;
    if (q.get('client_id') !== this.options.clientId) return { error: 'invalid_client' };
    if (q.get('scope') !== ONEDRIVE_SCOPE) return { error: 'invalid_scope' };
    if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || (q.get('code_challenge') ?? '').length < 43) return { error: 'invalid_request' };
    const redirectUri = q.get('redirect_uri') ?? '';
    const state = q.get('state') ?? '';
    if (options.deny === true) return { redirect: `${redirectUri}?error=access_denied&error_description=declined&state=${encodeURIComponent(state)}`, code: '', state };
    const code = `M.C506_BAY.2.U.${randomBytes(24).toString('base64url')}`;
    this.codes.set(code, { challenge: q.get('code_challenge')!, redirectUri, clientId: q.get('client_id')! });
    return { redirect: `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, code, state };
  }

  /** A refresh token as a completed consent would have produced (specs that skip the browser). */
  issueRefreshToken(): string {
    const token = `M.C506_BAY.0.U.${randomBytes(48).toString('base64url')}`;
    this.refreshTokens.set(token, { revoked: false });
    return token;
  }

  /** The owner revoking the app at account.microsoft.com. */
  revokeAll(): void {
    for (const entry of this.refreshTokens.values()) entry.revoked = true;
    this.accessTokens.clear();
  }

  expireAccessTokens(): void { this.accessTokens.clear(); }

  /** A folder directly under the app folder (what `connect.complete` creates). */
  createFolder(name = 'DUDE Hub backups', parentId: string = this.approotId): string {
    const id = this.newId();
    this.items.set(id, { id, name, parentId, folder: true, bytes: Buffer.alloc(0) });
    return id;
  }

  /** The files below `folderId` as the sorted repository-relative names a destination would list (`packs/<id>`, `repo`). */
  names(folderId: string): string[] {
    const out: string[] = [];
    const walk = (parentId: string, prefix: string): void => {
      for (const item of this.items.values()) {
        if (item.parentId !== parentId) continue;
        if (item.folder) walk(item.id, `${prefix}${item.name}/`); else out.push(`${prefix}${item.name}`);
      }
    };
    walk(folderId, '');
    return out.sort();
  }

  /** The file at a repository-relative path below `folderId`, if any. */
  find(folderId: string, relPath: string): StoredItem | undefined {
    return this.resolve(folderId, relPath);
  }

  /** Puts a file at a path below `folderId` (another writer, a stray file), creating the directories. */
  put(folderId: string, relPath: string, bytes: Uint8Array): StoredItem {
    return this.store(folderId, relPath, Buffer.from(bytes), true);
  }

  count(match: (request: RecordedGraphRequest) => boolean): number { return this.requests.filter(match).length; }

  private newId(): string { this.counter += 1; return `01FAKE${String(this.counter).padStart(6, '0')}${randomBytes(6).toString('hex').toUpperCase()}`; }

  private childOf(parentId: string, name: string): StoredItem | undefined {
    const lower = name.toLowerCase();
    for (const item of this.items.values()) if (item.parentId === parentId && item.name.toLowerCase() === lower) return item;
    return undefined;
  }

  private resolve(folderId: string, relPath: string): StoredItem | undefined {
    let current: StoredItem | undefined = this.items.get(folderId);
    for (const part of relPath.split('/').filter((p) => p.length > 0)) {
      if (current === undefined || !current.folder) return undefined;
      current = this.childOf(current.id, part);
    }
    return current;
  }

  private store(folderId: string, relPath: string, bytes: Buffer, makeParents: boolean): StoredItem {
    const parts = relPath.split('/').filter((p) => p.length > 0);
    const name = parts.pop()!;
    let parent = this.items.get(folderId)!;
    for (const part of parts) {
      let next = this.childOf(parent.id, part);
      if (next === undefined && makeParents) { const id = this.createFolder(part, parent.id); next = this.items.get(id)!; }
      if (next === undefined) throw new Error('parent missing');
      parent = next;
    }
    const existing = this.childOf(parent.id, name);
    if (existing !== undefined) { existing.bytes = bytes; return existing; }
    const id = this.newId();
    const item: StoredItem = { id, name, parentId: parent.id, folder: false, bytes };
    this.items.set(id, item);
    return item;
  }

  private takeFault(request: RecordedGraphRequest): GraphFault | undefined {
    for (const entry of this.faults) {
      if (entry.remaining <= 0 || !entry.match(request)) continue;
      if (entry.skip > 0) { entry.skip -= 1; continue; }
      entry.remaining -= 1;
      return entry.fault;
    }
    return undefined;
  }

  private authorized(request: RecordedGraphRequest): boolean {
    const header = request.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    const expires = this.accessTokens.get(token);
    return expires !== undefined && expires > this.options.now();
  }

  private json(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(text)), ...headers });
    res.end(text);
  }

  private graphError(res: http.ServerResponse, status: number, code: string, headers: Record<string, string> = {}): void {
    this.json(res, status, { error: { code, message: `fake graph error ${code}`, innerError: { 'request-id': 'fake' } } }, headers);
  }

  private itemJson(item: StoredItem, wrongHash = false, downloadUrl = false): Record<string, unknown> {
    return {
      id: item.id, name: item.name, size: item.bytes.length,
      ...(item.folder ? { folder: { childCount: 0 } }
        : { file: { mimeType: 'application/octet-stream', hashes: { sha1Hash: wrongHash ? '0'.repeat(40) : sha1Upper(item.bytes), sha256Hash: wrongHash ? '0'.repeat(64) : sha256Upper(item.bytes) } } }),
      ...(downloadUrl && !item.folder ? { '@microsoft.graph.downloadUrl': `${this.origin}/dl/${item.id}` } : {}),
    };
  }

  private used(): number { return [...this.items.values()].reduce((sum, f) => sum + f.bytes.length, 0); }

  private newRefreshToken(previous: string | undefined): string {
    if (previous !== undefined && this.options.strictRotation) this.refreshTokens.get(previous)!.revoked = true;
    return this.issueRefreshToken();
  }

  private tokenResponse(refreshToken: string, scope: string): Record<string, unknown> {
    const access = `EwB${randomBytes(48).toString('base64url')}`;
    this.accessTokens.set(access, this.options.now() + this.accessTokenTtlSeconds * 1000);
    return { token_type: 'Bearer', scope, expires_in: this.accessTokenTtlSeconds, access_token: access, refresh_token: refreshToken };
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.origin);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const recorded: RecordedGraphRequest = { method: req.method ?? 'GET', path: decodeURIComponent(url.pathname), query: url.searchParams, headers: req.headers, bodyBytes: body.length };
    this.requests.push(recorded);
    const fault = this.takeFault(recorded);
    if (fault?.kind === 'drop') { req.socket.destroy(); return; }
    if (fault?.kind === 'status') {
      const headers: Record<string, string> = fault.retryAfter !== undefined ? { 'retry-after': String(fault.retryAfter) } : {};
      if (fault.oauthError !== undefined) this.json(res, fault.status, { error: fault.oauthError }, headers);
      else this.graphError(res, fault.status, fault.code ?? 'generalException', headers);
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
      if (!res.headersSent) this.graphError(res, 500, 'generalException');
    }
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse, url: URL, body: Buffer, recorded: RecordedGraphRequest, fault: GraphFault | undefined, respond: (status: number, payload: unknown, headers?: Record<string, string>) => void): Promise<void> {
    const pathname = recorded.path;
    const method = recorded.method;

    // ---- OAuth ------------------------------------------------------------------------------------------------------------------------
    if (method === 'POST' && pathname === '/consumers/oauth2/v2.0/token') {
      const form = new URLSearchParams(body.toString('utf8'));
      if (form.get('client_id') !== this.options.clientId || form.get('client_secret') !== this.options.clientSecret) { this.json(res, 401, { error: 'invalid_client' }); return; }
      if (form.get('scope') !== ONEDRIVE_SCOPE) { this.json(res, 400, { error: 'invalid_scope' }); return; }
      if (form.get('grant_type') === 'authorization_code') {
        const code = this.codes.get(form.get('code') ?? '');
        this.codes.delete(form.get('code') ?? '');
        if (code === undefined || code.redirectUri !== form.get('redirect_uri') || codeChallengeS256(form.get('code_verifier') ?? '') !== code.challenge) { this.json(res, 400, { error: 'invalid_grant' }); return; }
        this.json(res, 200, this.tokenResponse(this.issueRefreshToken(), this.options.grantedScope));
        return;
      }
      if (form.get('grant_type') === 'refresh_token') {
        const presented = form.get('refresh_token') ?? '';
        this.presentedRefreshTokens.push(presented);
        const entry = this.refreshTokens.get(presented);
        if (entry === undefined || entry.revoked) { this.json(res, 400, { error: 'invalid_grant', error_description: 'AADSTS70000: The refresh token has expired or is invalid.' }); return; }
        this.tokenRefreshes += 1;
        this.json(res, 200, this.tokenResponse(this.newRefreshToken(presented), this.options.grantedScope));
        return;
      }
      this.json(res, 400, { error: 'unsupported_grant_type' });
      return;
    }

    // ---- a pre-authenticated download (no bearer) ------------------------------------------------------------------------------------
    const downloadMatch = /^\/dl\/([A-Za-z0-9]+)$/.exec(pathname);
    if (downloadMatch !== null) {
      const item = this.items.get(downloadMatch[1]!);
      if (item === undefined || item.folder) { this.graphError(res, 404, 'itemNotFound'); return; }
      const range = /^bytes=(\d+)-$/.exec(String(req.headers['range'] ?? ''));
      const from = range === null ? 0 : Number(range[1]);
      if (from >= item.bytes.length && item.bytes.length > 0) { res.writeHead(416, { 'content-range': `bytes */${item.bytes.length}`, 'content-length': '0' }); res.end(); return; }
      const slice = item.bytes.subarray(from);
      const headers: Record<string, string | number> = { 'content-type': 'application/octet-stream', 'content-length': slice.length };
      if (range !== null) headers['content-range'] = `bytes ${from}-${item.bytes.length - 1}/${item.bytes.length}`;
      res.writeHead(range === null ? 200 : 206, headers);
      if (fault?.kind === 'truncate') { res.write(slice.subarray(0, Math.floor(slice.length / 2))); setTimeout(() => { req.socket.destroy(); }, 5); return; }
      res.end(slice);
      return;
    }

    // ---- an upload session (pre-authenticated by its URL) --------------------------------------------------------------------------------
    const sessionMatch = /^\/upload\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if (sessionMatch !== null) {
      const session = this.sessions.get(sessionMatch[1]!);
      if (session === undefined) { this.graphError(res, 404, 'itemNotFound'); return; }
      const ack = (status = 202): void => this.json(res, status, { expirationDateTime: '2026-12-31T00:00:00Z', nextExpectedRanges: session.total !== undefined && session.received.length >= session.total ? [] : [`${session.received.length}-`] });
      if (method === 'DELETE') { this.sessions.delete(session.id); res.writeHead(204); res.end(); return; }
      if (method === 'GET') { ack(200); return; }
      if (method !== 'PUT') { this.graphError(res, 405, 'methodNotAllowed'); return; }
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(req.headers['content-range'] ?? ''));
      if (range === null) { this.graphError(res, 400, 'invalidRange'); return; }
      const start = Number(range[1]);
      const end = Number(range[2]);
      const total = Number(range[3]);
      if (session.total !== undefined && session.total !== total) { this.graphError(res, 400, 'invalidRange'); return; }
      session.total = total;
      if (body.length !== end - start + 1 || end >= total) { this.graphError(res, 400, 'invalidRange'); return; }
      if (start > session.received.length || start < 0) { this.graphError(res, 416, 'invalidRange'); return; }
      if (this.options.strictAlignment && end + 1 < total && body.length % ALIGN !== 0) { this.graphError(res, 400, 'invalidRange'); return; }
      session.received = Buffer.concat([session.received, body.subarray(session.received.length - start)]);
      if (session.received.length === total) { this.finish(res, session, fault, respond); return; }
      if (fault?.kind === 'drop-after') { req.socket.destroy(); return; }
      ack();
      return;
    }

    // ---- Graph REST (needs an access token) ---------------------------------------------------------------------------------------------
    if (!this.authorized(recorded)) {
      this.authFailures += 1;
      this.graphError(res, 401, 'InvalidAuthenticationToken');
      return;
    }
    const base = '/v1.0/me/drive';
    if (method === 'GET' && pathname === `${base}/special/approot`) { respond(200, this.itemJson(this.items.get(this.approotId)!)); return; }
    if (method === 'POST' && pathname === `${base}/special/approot/children`) {
      const meta = JSON.parse(body.toString('utf8')) as { name?: unknown; folder?: unknown; '@microsoft.graph.conflictBehavior'?: unknown };
      if (typeof meta.name !== 'string' || meta.folder === undefined) { this.graphError(res, 400, 'invalidRequest'); return; }
      let name = meta.name;
      for (let n = 1; this.childOf(this.approotId, name) !== undefined && meta['@microsoft.graph.conflictBehavior'] === 'rename'; n += 1) name = `${meta.name} ${n}`;
      if (this.childOf(this.approotId, name) !== undefined) { this.graphError(res, 409, 'nameAlreadyExists'); return; }
      respond(201, this.itemJson(this.items.get(this.createFolder(name))!));
      return;
    }
    if (method === 'GET' && pathname === base) {
      const used = this.used();
      respond(200, { quota: { ...(this.options.quotaBytes !== null ? { total: this.options.quotaBytes, remaining: Math.max(0, this.options.quotaBytes - used) } : {}), used, state: 'normal' } });
      return;
    }

    // items/{id}, items/{id}/children|content, items/{id}:/path[:[/children|/content|/createUploadSession]]
    const itemMatch = /^\/v1\.0\/me\/drive\/items\/([A-Za-z0-9!]+)(?::(\/[^:]*))?(?::(\/[A-Za-z]+)?)?(\/[A-Za-z]+)?$/.exec(pathname);
    if (itemMatch === null) { this.graphError(res, 404, 'itemNotFound'); return; }
    const folderId = itemMatch[1]!;
    const relPath = itemMatch[2]?.slice(1);
    const sub = itemMatch[3] ?? itemMatch[4];
    const root = this.items.get(folderId);
    if (root === undefined) { this.graphError(res, 404, 'itemNotFound'); return; }

    if (relPath === undefined) {
      // addressed by id
      if (method === 'GET' && sub === undefined) { respond(200, this.itemJson(root, false, (url.searchParams.get('$select') ?? '').includes('@microsoft.graph.downloadUrl'))); return; }
      if (method === 'DELETE' && sub === undefined) {
        if (root.id === this.approotId) { this.graphError(res, 403, 'accessDenied'); return; }
        const doomed = [root.id];
        for (let i = 0; i < doomed.length; i += 1) for (const item of this.items.values()) if (item.parentId === doomed[i]) doomed.push(item.id);
        for (const id of doomed) this.items.delete(id);
        if (fault?.kind === 'drop-after') { req.socket.destroy(); return; }
        res.writeHead(204);
        res.end();
        return;
      }
      if (method === 'PUT' && sub === '/content') {
        if (root.folder) { this.graphError(res, 400, 'invalidRequest'); return; }
        root.bytes = Buffer.from(body);
        respond(200, this.itemJson(root, fault?.kind === 'wrong-hash'));
        return;
      }
      if (method === 'POST' && sub === '/children' && root.folder) {
        const meta = JSON.parse(body.toString('utf8')) as { name?: unknown; folder?: unknown; '@microsoft.graph.conflictBehavior'?: unknown };
        if (typeof meta.name !== 'string' || meta.folder === undefined) { this.graphError(res, 400, 'invalidRequest'); return; }
        if (this.childOf(root.id, meta.name) !== undefined) { this.graphError(res, 409, 'nameAlreadyExists'); return; }
        respond(201, this.itemJson(this.items.get(this.createFolder(meta.name, root.id))!));
        return;
      }
      this.graphError(res, 404, 'itemNotFound');
      return;
    }

    // addressed by path below a folder
    if (method === 'GET' && sub === '/children') {
      const dir = this.resolve(folderId, relPath);
      if (dir === undefined || !dir.folder) { this.graphError(res, 404, 'itemNotFound'); return; }
      const all = [...this.items.values()].filter((i) => i.parentId === dir.id).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const size = Math.min(Number(url.searchParams.get('$top') ?? 200), this.options.maxPageSize);
      const offset = Number(url.searchParams.get('$skiptoken') ?? 0);
      const page = all.slice(offset, offset + size);
      const next = new URL(url.toString());
      next.searchParams.set('$skiptoken', String(offset + size));
      respond(200, { value: page.map((i) => this.itemJson(i)), ...(offset + size < all.length ? { '@odata.nextLink': next.toString() } : {}) });
      return;
    }
    if (method === 'GET' && sub === undefined) {
      const found = this.resolve(folderId, relPath);
      if (found === undefined) { this.graphError(res, 404, 'itemNotFound'); return; }
      respond(200, this.itemJson(found));
      return;
    }
    if (method === 'POST' && sub === '/createUploadSession') {
      const meta = body.length > 0 ? (JSON.parse(body.toString('utf8')) as { item?: Record<string, unknown> }) : {};
      const parts = relPath.split('/').filter((p) => p.length > 0);
      parts.pop();
      if (this.options.autoCreateParents) { /* created at the end */ } else if (parts.length > 0 && this.resolve(folderId, parts.join('/')) === undefined) { this.graphError(res, 404, 'itemNotFound'); return; }
      const id = randomBytes(12).toString('hex');
      this.sessions.set(id, { id, folderId, relPath, total: undefined, received: Buffer.alloc(0), conflictFail: meta.item?.['@microsoft.graph.conflictBehavior'] === 'fail' });
      if (fault?.kind === 'drop-after') { req.socket.destroy(); return; }
      this.json(res, 200, { uploadUrl: `${this.origin}/upload/${id}`, expirationDateTime: '2026-12-31T00:00:00Z' });
      return;
    }
    if (method === 'PUT' && sub === '/content') {
      const parts = relPath.split('/').filter((p) => p.length > 0);
      parts.pop();
      if (parts.length > 0 && this.resolve(folderId, parts.join('/')) === undefined) { this.graphError(res, 404, 'itemNotFound'); return; }
      if (url.searchParams.get('@microsoft.graph.conflictBehavior') === 'fail' && this.resolve(folderId, relPath) !== undefined) { this.graphError(res, 409, 'nameAlreadyExists'); return; }
      if (this.options.quotaBytes !== null && this.used() + body.length > this.options.quotaBytes) { this.graphError(res, 507, 'quotaLimitReached'); return; }
      const item = this.store(folderId, relPath, Buffer.from(body), false);
      respond(201, this.itemJson(item, fault?.kind === 'wrong-hash'));
      return;
    }
    this.graphError(res, 404, 'itemNotFound');
  }

  /** The last fragment landed: create the file (or refuse it for a name in use or for quota) and answer. */
  private finish(res: http.ServerResponse, session: Session, fault: GraphFault | undefined, respond: (status: number, payload: unknown, headers?: Record<string, string>) => void): void {
    if (session.conflictFail && this.resolve(session.folderId, session.relPath) !== undefined) { this.sessions.delete(session.id); this.graphError(res, 409, 'nameAlreadyExists'); return; }
    if (this.options.quotaBytes !== null && this.used() + session.received.length > this.options.quotaBytes) { this.sessions.delete(session.id); this.graphError(res, 507, 'quotaLimitReached'); return; }
    const item = this.store(session.folderId, session.relPath, session.received, this.options.autoCreateParents);
    this.sessions.delete(session.id); // a finished session is gone (a status query then gets 404)
    respond(201, this.itemJson(item, fault?.kind === 'wrong-hash'));
  }
}
