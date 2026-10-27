import https from 'node:https';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHubClient } from '@dude/api-client';
import type { HubClient, HubRequest, HubResponse, HubTransport } from '@dude/api-client';
import { HUB_API_PREFIX } from '@dude/contracts/hub';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import type { LocalBlobStore } from '../blobs/local-blob-store.js';
import { ensureLayout } from '../config/data-dir.js';
import { drainAuditOutbox } from '../savesphere-db/audit-outbox.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import type { SaveSphereDb } from '../savesphere-db/open.js';
import { audit } from '../security/audit.js';
import { createDiskGuard } from '../uploads/disk-guard.js';
import type { VolumeProbe } from '../uploads/disk-guard.js';
import { createUploadService } from '../uploads/upload-service.js';
import type { UploadLimits, UploadService, UploadServiceOptions } from '../uploads/upload-service.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { ApiResult, AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { tempDir } from './test-helpers.js';
import type { RawResponse } from './test-helpers.js';

export const MIB = 1024 * 1024;
export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export interface UploadHub extends AuthHub {
  sdb: SaveSphereDb;
  owner: Signed;
  service: UploadService;
  blobs: LocalBlobStore;
  /** The volume probe the guard reads; replace `current` to simulate a full disk. */
  volume: { current: ReturnType<VolumeProbe> };
  uploadsDir: string;
  /** Rebuilds the upload service over the same store (a Hub restart) and routes the live Hub to it. */
  restartService(extra?: Partial<UploadServiceOptions>): UploadService;
  create(body: Record<string, unknown>, who?: Signed): Promise<ApiResult>;
  status(id: string, who?: Signed): Promise<ApiResult>;
  complete(id: string, who?: Signed): Promise<ApiResult>;
  abort(id: string, who?: Signed): Promise<ApiResult>;
  put(id: string, index: number, bytes: Uint8Array, extra?: PutOptions): Promise<RawResponse>;
  /** A `HubTransport` onto this Hub (cookie plus CSRF, raw bodies supported) and a client over it. */
  transport(who?: Signed): HubTransport;
  client(who?: Signed): HubClient;
  chunkFiles(id: string): string[];
  auditEvents(prefix?: string): string[];
  rows<T = Record<string, unknown>>(sql: string, ...params: Array<string | number>): T[];
}

export interface PutOptions {
  who?: Signed | { bearer: string } | null;
  headers?: Record<string, string>;
  /** Do not send `Content-Length` (chunked transfer). */
  chunked?: boolean;
  /** Declare this length but send only `sendBytes` and then (if `destroyAfter`) drop the connection, or keep it open. */
  contentLength?: number;
  sendBytes?: number;
  destroyAfter?: boolean;
  /** Resolve as soon as a response head arrives, even while the request body is still unfinished. */
  noHash?: boolean;
}

export interface StartUploadHubOptions {
  limits?: Partial<UploadLimits>;
  hooks?: UploadServiceOptions['hooks'];
  /** Free and total bytes the guard sees (default: 1 TiB free of 2 TiB, so nothing refuses unless a spec says so). */
  volume?: { freeBytes: number; totalBytes: number } | null;
  minFreeBytes?: number;
}

const origin = (port: number): Record<string, string> => ({ origin: `https://localhost:${port}`, host: `localhost:${port}` });

export async function startUploadHub(options: StartUploadHubOptions = {}): Promise<UploadHub> {
  const root = tempDir('hub-uploads-');
  const paths = ensureLayout(root);
  const opened = openSaveSphereDb(paths);
  if (opened.status !== 'ready') throw new Error('savesphere.db not ready');
  const sdb = opened.store;
  const clock = { t: Date.parse('2026-03-01T00:00:00.000Z') };
  const blobs = createLocalBlobStore(paths);
  const volume = { current: options.volume === undefined ? { freeBytes: 2 ** 40, totalBytes: 2 ** 41 } : options.volume };
  let service!: UploadService;
  let hubDbRef: AuthHub | undefined;
  const build = (extra: Partial<UploadServiceOptions> = {}): UploadService => createUploadService({
    db: sdb.db, paths, blobs, now: () => clock.t,
    guard: createDiskGuard({ probe: () => volume.current, ...(options.minFreeBytes === undefined ? {} : { minFreeBytes: options.minFreeBytes }) }),
    drainAudit: () => { if (hubDbRef !== undefined) drainAuditOutbox(sdb.db, hubDbRef.hub.hub.db, (input) => audit(hubDbRef!.hub.hub.db, input)); },
    ...(options.limits ? { limits: options.limits } : {}), ...(options.hooks ? { hooks: options.hooks } : {}), ...extra,
  });
  // The Hub holds one stable object whose `service` can be swapped, so a restart is observable through the live routes.
  const holder: { service: UploadService } = { service: undefined as never };
  const proxy: UploadService = {
    create: (...a) => holder.service.create(...a), status: (...a) => holder.service.status(...a), putChunk: (...a) => holder.service.putChunk(...a),
    complete: (...a) => holder.service.complete(...a), abort: (...a) => holder.service.abort(...a), expire: () => holder.service.expire(),
  };
  const h = await startAuthHub({ dataRoot: root, clock, uploads: { service: proxy } } as Parameters<typeof startAuthHub>[0]);
  hubDbRef = h;
  service = build();
  holder.service = service;
  const owner = await h.signIn();

  const call = (method: string, p: string, who: Signed, body?: unknown): Promise<ApiResult> => h.call(method, p, { cookie: who.cookie, csrf: who.csrf, ...(body === undefined ? {} : { body }) });

  const rawPut = (id: string, index: number, bytes: Uint8Array, o: PutOptions = {}): Promise<RawResponse> => new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'content-type': 'application/octet-stream', ...o.headers };
    const who = o.who === undefined ? owner : o.who;
    if (who === null) { /* anonymous */ } else if ('bearer' in who) headers.authorization = `Bearer ${who.bearer}`;
    else { Object.assign(headers, origin(h.hub.port)); headers.cookie = `__Host-dude_session=${who.cookie}`; headers['x-dude-csrf'] = who.csrf; }
    if (o.noHash !== true && headers['x-chunk-sha256'] === undefined) headers['x-chunk-sha256'] = sha256Hex(bytes);
    if (o.chunked !== true) headers['content-length'] = String(o.contentLength ?? bytes.byteLength);
    const req = https.request({ host: '127.0.0.1', port: h.hub.port, path: `${HUB_API_PREFIX}/uploads/${id}/chunks/${index}`, method: 'PUT', ca: h.hub.tls.certPem, headers, servername: 'localhost' }, (res) => {
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(parts).toString('utf8') }));
      res.on('error', reject);
      // A refusal before the body is read: resolve on the head (and stop sending).
      res.once('close', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(parts).toString('utf8') }));
    });
    req.on('error', (error) => { if (o.sendBytes === undefined || o.destroyAfter !== true) reject(error); });
    const send = o.sendBytes === undefined ? bytes : bytes.subarray(0, o.sendBytes);
    if (o.destroyAfter === true) {
      req.write(send, () => { setTimeout(() => { req.destroy(); resolve({ status: 0, headers: {}, body: '' }); }, 50); });
    } else if (o.chunked === true) {
      req.write(send);
      req.end();
    } else if (o.sendBytes !== undefined) {
      req.write(send);
    } else {
      req.end(send);
    }
  });

  const transportFor = (who: Signed): HubTransport => ({
    request: (req: HubRequest): Promise<HubResponse> => new Promise((resolve, reject) => {
      const headers: Record<string, string> = { ...origin(h.hub.port), cookie: `__Host-dude_session=${who.cookie}`, ...req.headers };
      if (req.method !== 'GET') headers['x-dude-csrf'] = who.csrf;
      const payload = req.rawBody !== undefined ? Buffer.from(req.rawBody) : req.body === undefined ? undefined : Buffer.from(JSON.stringify(req.body));
      if (payload !== undefined) { if (req.rawBody === undefined) headers['content-type'] = 'application/json'; headers['content-length'] = String(payload.length); }
      const r = https.request({ host: '127.0.0.1', port: h.hub.port, path: req.path, method: req.method, ca: h.hub.tls.certPem, headers, servername: 'localhost' }, (res) => {
        const parts: Buffer[] = [];
        res.on('data', (c: Buffer) => parts.push(c));
        res.on('end', () => {
          const text = Buffer.concat(parts).toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers: {}, body: text === '' ? undefined : (JSON.parse(text) as unknown) });
        });
      });
      r.on('error', reject);
      r.end(payload);
    }),
  });

  return {
    ...h, sdb, owner, blobs, volume, uploadsDir: paths.uploadsDir,
    get service() { return holder.service; },
    restartService(extra) { holder.service = build(extra); return holder.service; },
    create: (body, who = owner) => call('POST', '/uploads', who, body),
    status: (id, who = owner) => call('GET', `/uploads/${id}`, who),
    complete: (id, who = owner) => call('POST', `/uploads/${id}/complete`, who),
    abort: (id, who = owner) => call('DELETE', `/uploads/${id}`, who),
    put: rawPut,
    transport: (who = owner) => transportFor(who),
    client: (who = owner) => createHubClient(transportFor(who), { clientProtocol: 1, minHubProtocol: 1 }),
    chunkFiles: (id) => (existsSync(path.join(paths.uploadsDir, id)) ? readdirSync(path.join(paths.uploadsDir, id)).sort() : []),
    auditEvents: (prefix = 'upload.') => (h.hub.hub.db.prepare('SELECT event FROM audit_events WHERE event LIKE ? ORDER BY seq').all(`${prefix}%`) as Array<{ event: string }>).map((r) => r.event),
    rows: <T>(sql: string, ...params: Array<string | number>) => sdb.db.prepare(sql).all(...params) as T[],
    close: async () => { await h.close(); sdb.close(); },
  } as UploadHub;
}

export async function deviceBearerFor(h: UploadHub): Promise<string> {
  return (await enrolled(h, h.owner)).token;
}
